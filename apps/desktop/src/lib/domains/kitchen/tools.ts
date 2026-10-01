// Hearth's tool handlers (product/domains/kitchen.md, "Gardener tools"; docs/engineering/gardener.md, "Tools"): what
// each declared tool does with what the model sends. The model-backed ones hand the runtime a prompt and read the
// answer back; the plain ones write through the store. Every recipe suggestion passes the local safety filter
// before it is shown, whatever the model saw (D-25). The rows a delegated request reads come from the pack, built
// from the tool's declared reads; a prompt names what it wants of them and nothing more. The tools that read files
// (`capture-haul`, `import-recipe`) are given the ones on the owner's message, or the ones a page staged for them.
import { get } from 'svelte/store'
import { fetchPage } from '@eden/shared/api'
import { newId } from '@eden/shared/data'
import { answer, type DraftCard } from '@eden/shared/gardener'
import {
	CAPTURE_MODES,
	CATEGORIES,
	haulRows,
	isSafe,
	LOCATIONS,
	pageText,
	recipeDraft,
	recipeFromJsonLd,
	type CaptureMode,
	type StockLocation,
} from '@eden/shared/domains/kitchen'
import { t } from '@eden/shared/i18n'
import { settings } from '@eden/shared/settings'
import {
	DRAFTED,
	int,
	parseJson,
	str,
	type ToolContext,
	type ToolHandler,
	type ToolResult,
} from '$lib/shell/gardener/types'
import { capture } from './capture.svelte.js'
import { recipeDrafts } from './recipe-draft.svelte.js'
import { forbidden } from './safety.svelte.js'
import { kitchen } from './store.svelte.js'

interface Suggestion {
	recipeId?: string
	name: string
	minutes?: number
	why: string
	uses?: string[]
}

/** Drops every suggestion that names a forbidden word anywhere in what it says or uses; all of them on `null`. */
function safe(suggestions: Suggestion[], words: string[] | null): Suggestion[] {
	const names = (id: string) => kitchen.stockById(id)?.name ?? ''
	return suggestions.filter((suggestion) =>
		isSafe([suggestion.name, suggestion.why, ...(suggestion.uses ?? []).map(names)], words)
	)
}

function location(value: unknown): StockLocation {
	return typeof value === 'string' && (LOCATIONS as readonly string[]).includes(value)
		? (value as StockLocation)
		: 'pantry'
}

/** What a capture was asked to read: a haul unless the input says the shelves. */
export function captureMode(input: unknown): CaptureMode {
	const mode = str(input, 'mode')
	return (CAPTURE_MODES as readonly string[]).includes(mode ?? '') ? (mode as CaptureMode) : 'haul'
}

/** The lines both kinds of capture end on: how amounts are written, where an item is in a photo, what to leave out. */
const captureRules = (today: string) => [
	`Where an amount is printed, give it as printed. Where you have to estimate one, use ${settings.measurement === 'imperial' ? 'ounces and pounds' : 'grams and millilitres'}, or a plain count for things that are counted.`,
	'For each item you can see in a photo, say which file it is in (`photo`, counting the files from 1 in the order given) and the box around the item alone in that photo (`box`), so a picture of it can be cut out. Draw the box tight to the item. For an item you read from a receipt, an order or a list and cannot see, `photo` is 0.',
	`Today is ${today}.`,
	'When you cannot tell what something is, leave it out: a wrong row costs the owner more than a missing one.',
]

/** The recipe's shape as a model is held to it: what `import-recipe` answers and what `recipeDraft` reads. */
const RECIPE_ANSWER = answer.object({
	name: answer.text('The dish, as the source names it.'),
	serves: answer.integer('How many it serves; 2 when the source does not say.'),
	minutes: answer.integer('How long it takes start to finish, in minutes; 0 when the source does not say.'),
	tags: answer.list(answer.text(), 'Up to three plain tags: weeknight, vegetarian, one pot. Empty when none fit.'),
	ingredients: answer.list(
		answer.object({
			name: answer.text('The ingredient alone: "short-grain rice", without its amount or how it is cut.'),
			qty: answer.text('The amount alone: 2, 1/2, 200; an empty string when the source gives none.'),
			unit: answer.text('The unit of the amount: g, ml, tbsp, cup, clove; an empty string for a plain count.'),
			note: answer.text('How it is prepared or how much is meant: "minced", "to taste"; an empty string otherwise.'),
		})
	),
	steps: answer.list(answer.text('One step, as a full sentence.')),
	tip: answer.text(
		'One sentence the source gives, or that any cook would want, that makes the dish go right; an empty string when there is nothing of the kind.'
	),
})

/** What a recipe's page says, for the model: the recipe as the page describes it in JSON-LD when it does, else its text. */
async function pageFor(url: string): Promise<string> {
	const page = await fetchPage(url)
	const described = recipeFromJsonLd(page.html, page.url)
	return described ? JSON.stringify(described) : pageText(page.html)
}

export const kitchenTools: Record<string, ToolHandler> = {
	'suggest-recipes': {
		delegate: {
			schema: answer.object({
				suggestions: answer.list(
					answer.object({
						name: answer.text('The dish.'),
						minutes: answer.integer('Roughly how long it takes to make, in minutes.'),
						why: answer.text('One sentence on why this one now: what it uses up, how it fits what was asked.'),
						uses: answer.list(answer.text(), 'The `id` of each stock item it uses, from rows under `stock-item`.'),
						recipeId: answer.text(
							'The `id` of the saved recipe when it is one, from rows under `recipe`; an empty string otherwise.'
						),
					})
				),
			}),
			prompt: (input) => {
				const count = int(input, 'count', 3, 1, 5)
				const constraints = str(input, 'constraints')
				return [
					`Suggest ${count} things the owner could cook, from the stock, the saved recipes and their food preferences in the context.`,
					'Favour what uses the stock that expires soonest, so less is wasted, and what needs little that is not in stock.',
					'Leave out anything with an ingredient the context lists as an allergy, a restriction or a dislike. Eden filters for these again afterwards, and a suggestion it removes is one the owner never sees.',
					constraints ? `The owner asked for: ${constraints}` : '',
				]
					.filter(Boolean)
					.join('\n')
			},
			parse: async (text) => {
				const parsed = parseJson<{ suggestions?: Suggestion[] }>(text)
				const all = parsed?.suggestions ?? []
				const suggestions = safe(all, await forbidden.read()).map(({ recipeId, ...rest }) =>
					recipeId ? { ...rest, recipeId } : rest
				)
				// how many the local filter dropped (D-25), so the reply can say some were left out and never which
				return { output: { suggestions, withheld: all.length - suggestions.length } }
			},
		},
	},
	'storage-tip': {
		delegate: {
			check: (input) => {
				const id = str(input, 'stockItemId')
				if (id && !kitchen.stockById(id))
					return `No stock item has the id ${JSON.stringify(id)}. Pass the \`id\` of a row under \`stock-item\`, or the food's \`name\`.`
				return id || str(input, 'name') ? undefined : 'Pass `stockItemId` or `name`: which food the tip is for.'
			},
			schema: answer.object({
				tip: answer.text('Where and how to keep it, two sentences at most.'),
				shelfLifeDays: answer.integer('How many days it typically keeps when stored that way.'),
			}),
			prompt: (input) => {
				const id = str(input, 'stockItemId')
				const name = (id && kitchen.stockById(id)?.name) || str(input, 'name') || 'the item'
				return [
					`How is ${name} best stored at home, and how long does it typically keep that way?`,
					id
						? 'Its row in the context says where the owner keeps it now; say so if somewhere else would keep it longer.'
						: '',
				]
					.filter(Boolean)
					.join('\n')
			},
			focus: (input) => {
				const id = str(input, 'stockItemId')
				return id ? [`eden://stock-item/${id}`] : []
			},
			parse: (text) => ({ output: parseJson<{ tip: string; shelfLifeDays?: number }>(text) ?? { tip: text.trim() } }),
			maxTokens: 400,
		},
	},
	'capture-haul': {
		delegate: {
			files: (_input, ctx) => ctx.files,
			schema: answer.object({
				rows: answer.list(
					answer.object({
						name: answer.text(
							'The item, named in full as a shopper would say it: "Greek yogurt", never a receipt’s abbreviation.'
						),
						qty: answer.text('The amount alone, as a number: 2, 500, 1.5.'),
						unit: answer.text(
							'The unit of the amount: g, kg, ml, l, oz, lb, bunch, can, packets; an empty string for a plain count.'
						),
						location: answer.oneOf(LOCATIONS, 'Where this kind of food is normally kept at home.'),
						category: answer.oneOf(CATEGORIES, 'What kind of thing it is.'),
						expiryDate: answer.text(
							'The use-by or best-before date printed on it, as YYYY-MM-DD, when one can be read; an empty string otherwise.'
						),
						daysUntilExpiry: answer.integer(
							'How many days this kind of food typically keeps from today, stored where `location` says; 0 when it keeps for months or cannot be estimated.'
						),
						tip: answer.text(
							'One short sentence on storing or handling it that is worth knowing and not obvious; an empty string when there is nothing of the kind. Most rows have none.'
						),
						photo: answer.integer(
							'Which file the item is seen in, counting from 1 in the order the files are given; 0 when it is not seen in a photo.'
						),
						box: answer.object({
							left: answer.integer(
								'The left edge of the item, in thousandths of the photo’s width from its left side.'
							),
							top: answer.integer('The top edge, in thousandths of the photo’s height from its top.'),
							right: answer.integer('The right edge, in thousandths of the width from the left side.'),
							bottom: answer.integer('The bottom edge, in thousandths of the height from the top.'),
						}),
					})
				),
			}),
			prompt: (input, ctx) =>
				(captureMode(input) === 'stock'
					? [
							'These files are photos of the owner’s kitchen as it stands: the inside of the fridge or the freezer, pantry shelves, the counter. List every food, drink, supplement and other kitchen consumable you can see, one row each. The owner checks the rows before they become their stock.',
							'An item that shows in two photos is one row. Put each item where its photo shows it: what is in the fridge is `fridge`, what is on a pantry shelf is `pantry`, and so on, wherever that kind of food is usually kept.',
							'Count what you can count and estimate what you cannot: a carton that looks half full is half its size.',
							'These things were not bought today, so do not guess how long they keep: `daysUntilExpiry` is 0 for every row, and `expiryDate` is filled only where a date can be read on the item.',
							'Leave out what is not a consumable: containers, appliances, dishes, magnets.',
							...captureRules(ctx.today),
						]
					: [
							'These files are one grocery haul: photos of the groceries, receipts, an order confirmation or a list, in any mix. List every item that was bought, one row each. The owner checks the rows before they are added to their stock.',
							'An item that shows in two of the files, on the receipt and in a photo, is one row. A receipt’s or an order’s quantity and weight win over what a photo suggests; a photo says what an abbreviated receipt line is.',
							'Leave out what is not food, drink, a supplement or another kitchen consumable, and every line that is not an item: totals, tax, discounts, bags, fees, an item that was refunded or not delivered.',
							...captureRules(ctx.today),
						]
				).join('\n'),
			parse: async (text, input, ctx) => {
				await kitchen.load()
				const mode = captureMode(input)
				const rows = haulRows(parseJson(text), { today: ctx.today, stock: kitchen.data().stock, newId, mode })
				if (!rows.length)
					return {
						output: { error: 'No grocery items could be read from the files. Tell the owner; they can try others.' },
						failure: 'empty',
					}
				const sources = (ctx.files?.blocks ?? []).map(({ id, name, mime }) => ({ id, name, mime }))
				return {
					output: { status: 'drafted', rows: rows.length, note: DRAFTED },
					card: { kind: 'capture', mode, rows, ...(sources.length ? { sources } : {}) },
				}
			},
			maxTokens: 8000,
		},
	},
	'draft-grocery-list': {
		delegate: {
			schema: answer.object({
				items: answer.list(
					answer.object({
						name: answer.text('The thing to buy.'),
						qty: answer.text('How much, with its unit: 2, 500 g, 1 bunch.'),
						note: answer.text('What it is for, in a few words, when that is not obvious; an empty string otherwise.'),
					})
				),
			}),
			prompt: (input) => {
				const recipes = ((input as { forRecipeIds?: unknown })?.forRecipeIds as string[] | undefined)
					?.map((id) => kitchen.recipeById(id)?.name)
					.filter(Boolean)
				const days = int(input, 'days', 7, 1, 14)
				const notes = str(input, 'notes')
				return [
					`Draft a grocery list that covers the next ${days} days.`,
					recipes?.length ? `The owner wants to cook: ${recipes.join(', ')}.` : '',
					'List what those days need that is not already covered: leave out what the stock in the context holds enough of, and what is already on the grocery list.',
					notes ? `The owner added: ${notes}` : '',
				]
					.filter(Boolean)
					.join('\n')
			},
			parse: (text) => {
				const parsed = parseJson<{ items?: { name?: string; qty?: string; note?: string }[] }>(text)
				const items = (parsed?.items ?? []).flatMap((item) =>
					item.name ? [{ name: item.name, qty: item.qty ?? '', note: item.note || undefined }] : []
				)
				if (!items.length)
					return { output: { error: 'The list came back empty. Tell the owner it could not be drafted.' } }
				return { output: { status: 'drafted', items, note: DRAFTED }, card: { kind: 'grocery', items } }
			},
		},
	},
	'add-stock': {
		run: async (input, ctx) => {
			const rows = (((input as { items?: unknown })?.items as Record<string, unknown>[] | undefined) ?? []).flatMap(
				(row) => {
					const name = str(row, 'name')
					if (!name) return []
					return [
						{
							name,
							qty: str(row, 'qty') ?? '1',
							unit: str(row, 'unit'),
							location: location(row.location),
							expiry: str(row, 'expiry'),
						},
					]
				}
			)
			if (!rows.length) return { output: { error: 'Nothing to add: pass `items`, each with a `name`.' } }
			const { items, undo } = kitchen.addStockRows(rows)
			if (items.length)
				ctx.undo(get(t)('domains.kitchen.stock.toast.addedMany', { values: { count: items.length } }), undo)
			return {
				output: { added: items.map((item) => ({ id: item.id, name: item.name })) },
				touched: items.map((item) => `eden://stock-item/${item.id}`),
			}
		},
	},
	'import-recipe': {
		delegate: {
			files: (_input, ctx) => ctx.files,
			filesOptional: (input) => !!(str(input, 'text') || str(input, 'url')),
			schema: RECIPE_ANSWER,
			prompt: async (input) => {
				const url = str(input, 'url')
				const text = [str(input, 'text'), url ? await pageFor(url) : undefined].filter(Boolean).join('\n\n')
				return [
					'Write out the recipe in what follows, or in the files, as the owner will keep it: its ingredients one line each and its steps in order. The owner checks it before it is saved.',
					'Keep to the source: its amounts, its units and its order. Do not add an ingredient or a step it does not have, and leave an amount empty where it gives none.',
					'When there are several recipes, write the first. When there is none, answer an empty name.',
					text ? `<recipe>\n${text}\n</recipe>` : '',
				]
					.filter(Boolean)
					.join('\n')
			},
			parse: (text, input) => {
				const draft = recipeDraft(parseJson(text))
				if (!draft)
					return {
						output: { error: 'No recipe could be read from that. Tell the owner; they can try another source.' },
						failure: 'empty',
					}
				const url = str(input, 'url')
				const recipe = url && !draft.sourceUrl ? { ...draft, sourceUrl: url } : draft
				return { output: { status: 'drafted', name: recipe.name, note: DRAFTED }, card: { kind: 'recipe', recipe } }
			},
			maxTokens: 4000,
		},
	},
	'save-recipe': {
		run: async (input) => {
			const recipe = recipeDraft(input)
			if (!recipe)
				return { output: { error: 'Nothing to save: pass the recipe’s `name`, its `ingredients` and its `steps`.' } }
			// what the Gardener wrote is a suggestion, and passes the filter like one (D-25)
			const texts = [recipe.name, ...recipe.tags, ...recipe.ingredients.map((line) => line.name)]
			if (!isSafe(texts, await forbidden.read()))
				return {
					output: {
						error:
							'This recipe was not drafted: it names something the owner has said they must not be offered. Do not say which; suggest another dish.',
					},
				}
			return { output: { status: 'drafted', name: recipe.name, note: DRAFTED }, card: { kind: 'recipe', recipe } }
		},
	},
	'plan-week': {
		delegate: {
			schema: answer.object({
				days: answer.list(
					answer.object({
						day: answer.text('The day, as YYYY-MM-DD.'),
						meals: answer.list(
							answer.object({
								name: answer.text('The meal.'),
								recipeId: answer.text(
									'The `id` of the saved recipe when it is one, from rows under `recipe`; an empty string otherwise.'
								),
							})
						),
					})
				),
				shopDay: answer.object({
					day: answer.text('The day to shop, as YYYY-MM-DD; an empty string when nothing needs buying.'),
					items: answer.list(
						answer.object({
							name: answer.text('The thing to buy.'),
							qty: answer.text('How much, with its unit.'),
						})
					),
				}),
				tasks: answer.list(
					answer.object({
						title: answer.text('The step to do ahead of a meal.'),
						due: answer.text('The day to do it, as YYYY-MM-DD.'),
					})
				),
			}),
			prompt: (input, ctx) => {
				const from = str(input, 'from') ?? ctx.today
				const days = int(input, 'days', 7, 1, 14)
				const notes = str(input, 'notes')
				return [
					`Plan the owner's meals for ${days} days from ${from}, from the stock, the saved recipes, the events and the tasks in the context.`,
					'Use what expires soonest first, so less is wasted. On an evening with an event, keep the meal quick and light. Put one shop day where the stock runs out, with what to buy that day. Add a task only for a step that has to happen ahead of a meal, such as defrosting or marinating.',
					notes ? `The owner added: ${notes}` : '',
				]
					.filter(Boolean)
					.join('\n')
			},
			parse: (text) => {
				const parsed = parseJson<{
					days?: { day: string; meals: { name: string; recipeId?: string }[] }[]
					shopDay?: { day: string; items: { name: string; qty?: string }[] }
					tasks?: { title: string; due?: string }[]
				}>(text)
				// a field with nothing to say arrives as an empty string: it is left off the card
				const meals = (parsed?.days ?? [])
					.filter((day) => day.day && Array.isArray(day.meals))
					.map((day) => ({
						day: day.day,
						meals: day.meals.map((meal) => (meal.recipeId ? meal : { name: meal.name })),
					}))
				const tasks = (parsed?.tasks ?? [])
					.filter((task) => task.title)
					.map((task) => (task.due ? task : { title: task.title }))
				const shop = parsed?.shopDay
				if (!parsed || !meals.length)
					return { output: { error: 'The plan came back empty. Tell the owner it could not be drafted.' } }
				return {
					output: { status: 'drafted', days: meals, shopDay: shop?.day ? shop : undefined, tasks, note: DRAFTED },
					card: {
						kind: 'plan',
						title: get(t)('domains.kitchen.plan.title'),
						tasks,
						events: shop?.day
							? [{ kind: 'shop-day', title: get(t)('domains.kitchen.plan.shopDay'), day: shop.day }]
							: [],
						meals,
						grocery: shop?.items?.filter((item) => item.name).map((item) => ({ name: item.name, qty: item.qty ?? '' })),
					},
				}
			},
			maxTokens: 3000,
		},
	},
}

/** Hearth's part of a draft's commit: a drafted grocery list, and the shop list of a plan. */
export async function kitchenCommitDraft(card: DraftCard): Promise<{ undo: () => void } | undefined> {
	if (card.kind === 'grocery') return kitchen.addGroceryItems(card.items)
	if (card.kind === 'plan') return card.grocery?.length ? kitchen.addGroceryItems(card.grocery, 'recipe') : undefined
	return undefined
}

/**
 * The drafts Hearth opens on a surface of its own, where the owner checks them before anything is stored: a
 * captured haul on the capture sheet at its rows, a recipe in the Recipes view's detail pane.
 */
export function kitchenOpenDraft(
	card: DraftCard,
	settle: (state: 'committed' | 'discarded') => void,
	open: { recipes: () => void }
): boolean {
	if (card.kind === 'capture') {
		void capture.fromDraft(card, settle)
		return true
	}
	if (card.kind === 'recipe') {
		recipeDrafts.open(card.recipe, settle)
		open.recipes()
		return true
	}
	return false
}

/** What Hearth's quick actions write, by id; `capture-haul` is the tool itself, run from the page or the panel. */
export const kitchenQuickActions = {
	'add-to-grocery': (value: string) => kitchen.addGrocery(value),
}

export type { ToolContext, ToolResult }
