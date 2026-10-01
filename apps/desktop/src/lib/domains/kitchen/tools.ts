// Hearth's tool handlers (product/domains/kitchen.md, "Gardener tools"; docs/engineering/gardener.md, "Tools"): what
// each declared tool does with what the model sends. The model-backed ones hand the runtime a prompt and read the
// answer back; the plain ones write through the store. Every recipe suggestion passes the local safety filter
// before it is shown, whatever the model saw (D-25). The rows a delegated request reads come from the pack, built
// from the tool's declared reads; a prompt names what it wants of them and nothing more. The tools that read files
// (`capture-haul`, `import-recipe`) are given the ones on the owner's message, or the ones a page staged for them.
// The batch tools (`update-stock`, `edit-grocery`, `edit-stores`, `change-recipe`) check every id before they write
// anything, write through the store's own methods and hand back one undo for the whole call.
import { get } from 'svelte/store'
import { fetchPage } from '@eden/shared/api'
import { newId } from '@eden/shared/data'
import { answer, type DraftCard } from '@eden/shared/gardener'
import {
	CAPTURE_MODES,
	CATEGORIES,
	haulReceipt,
	haulRows,
	isSafe,
	LOCATIONS,
	pageImage,
	pageSiteName,
	pageText,
	placed,
	productLink,
	recipeDraft,
	recipeFromJsonLd,
	siteAddress,
	STORE_SELLS,
	type CaptureMode,
	type StockLocation,
	type StoreSells,
} from '@eden/shared/domains/kitchen'
import { t } from '@eden/shared/i18n'
import { settings } from '@eden/shared/settings'
import {
	entries,
	given,
	ids,
	preview,
	stated,
	together,
	unknown,
	withFields,
	type Fields,
} from '$lib/shell/gardener/batch'
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
import { linkedPicture } from './staging.svelte.js'
import { fetchStoreSite } from './store-site.js'
import {
	kitchen,
	type GroceryPatch,
	type GroceryRow,
	type StockPatch,
	type StorePatch,
	type Undo,
} from './store.svelte.js'

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

/** What a `storeId` says for the list of what is not filed under a store. */
const NONE = 'none'

/** The store a `storeId` means: the store, `null` for the unfiled list, `undefined` for an id no store has. */
function storeNamed(id: string) {
	return id === NONE ? null : kitchen.storeById(id)
}

const say = (key: 'add' | 'change' | 'remove' | 'complete' | 'cooked', what: string) =>
	get(t)(`domains.kitchen.gardener.preview.${key}`, { values: { what } })
const labelled = (name: string | undefined, brand?: string) => (name ? (brand ? `${brand} ${name}` : name) : undefined)
const stockName = (id: unknown) => {
	const item = typeof id === 'string' ? kitchen.stockById(id) : undefined
	return labelled(item?.name, item?.brand)
}
const groceryById = (id: unknown) => kitchen.grocery.items.find((entry) => entry.id === id)
const storeName = (id: unknown) =>
	id === NONE
		? get(t)('domains.kitchen.gardener.preview.unfiled')
		: kitchen.storeById(typeof id === 'string' ? id : undefined)?.name
/** A shop day as a list keeps it, from a day or a day and a time; `null` for what is neither. */
function shopDayOf(value: string): string | null {
	const match = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/.exec(value)
	return match ? `${match[1]}T${match[2] ?? '10:00'}:00` : null
}

/** What a capture was asked to read: a haul unless the input says the shelves. */
export function captureMode(input: unknown): CaptureMode {
	const mode = str(input, 'mode')
	return (CAPTURE_MODES as readonly string[]).includes(mode ?? '') ? (mode as CaptureMode) : 'haul'
}

/** The lines both kinds of capture end on: how an item is named, how amounts are written, where an item is in a photo, what to leave out. */
const captureRules = (today: string) => [
	'Name each item as the thing itself, and give who makes it and how much one package holds apart from the name: "butter" with the brand "Kerrygold" and the size "8 oz", never "Kerrygold butter 8 oz". The app matches items by that name, so the same thing must get the same name from a receipt as from a photo.',
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
	author: answer.text('Who wrote the recipe, as the source credits them; an empty string when it does not say.'),
	sourceName: answer.text(
		'What it comes from, by name, when the source shows it: the site, the magazine, the cookbook; an empty string otherwise.'
	),
})

/** What a page shows of its recipe beyond its words (D-93): kept from the fetch for the draft the answer becomes. */
const pagesRead = new Map<string, { imageUrl?: string; sourceName?: string; author?: string }>()

/** What a recipe's page says, for the model: the recipe as the page describes it in JSON-LD when it does, else its text. */
async function pageFor(url: string): Promise<string> {
	const page = await fetchPage(url)
	const described = recipeFromJsonLd(page.html, page.url)
	pagesRead.set(url, {
		imageUrl: described?.imageUrl ?? pageImage(page.html, page.url),
		sourceName: described?.sourceName || pageSiteName(page.html) || undefined,
		author: described?.author,
	})
	if (!described) return pageText(page.html)
	// the picture's address is nothing the model needs
	const { imageUrl: _imageUrl, ...words } = described
	return JSON.stringify(words)
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
					'Stock kept under `household` is not food: never cook with it or count it.',
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
					return `No stock item has the id ${JSON.stringify(id)}. Pass the \`id\` of a row under \`stock-item\`, or the item's \`name\`.`
				return id || str(input, 'name') ? undefined : 'Pass `stockItemId` or `name`: which item the tip is for.'
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
							'The item itself, as a shopper would say it: "Greek yogurt", "butter"; never a receipt’s abbreviation, and without its maker or its package size.'
						),
						brand: answer.text(
							'Who makes it, as the item or the receipt shows: "Kerrygold", "H-E-B"; an empty string for what has no brand, such as loose produce, or when none can be read.'
						),
						size: answer.text(
							'How much one package holds, as printed: "16 oz", "12 ct", or the weight of something sold by weight, "1.24 lb"; an empty string when it is not shown.'
						),
						priceCents: answer.integer(
							'What the receipt or the order charged for this line, in cents, after any discount printed on the line: 698 for $6.98; 0 when no file prices it.'
						),
						count: answer.integer(
							'How many packages that price is for: 2 for "2 @ 3.49"; 1 when the line shows no multiple.'
						),
						qty: answer.text('The amount alone, as a number: 2, 500, 1.5.'),
						unit: answer.text(
							'The unit of the amount: g, kg, ml, l, oz, lb, bunch, can, packets; an empty string for a plain count.'
						),
						location: answer.oneOf(
							LOCATIONS,
							'Where this kind of food is normally kept at home; `household` for what is not food or drink: cleaning and laundry, paper goods, personal care, health.'
						),
						category: answer.oneOf(CATEGORIES, 'What kind of thing it is.'),
						expiryDate: answer.text(
							'The use-by or best-before date printed on it, as YYYY-MM-DD, when one can be read; an empty string otherwise.'
						),
						daysUntilExpiry: answer.integer(
							'How many days this kind of food typically keeps from today, stored where `location` says; 0 when it keeps for months or cannot be estimated, and for everything under `household`.'
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
				store: answer.text(
					'The shop a receipt or an order is from, as it is printed; an empty string when no file shows one.'
				),
				boughtOn: answer.text(
					'The day printed on the receipt or the order, as YYYY-MM-DD; an empty string when no file shows one.'
				),
			}),
			prompt: (input, ctx) =>
				(captureMode(input) === 'stock'
					? [
							'These files are photos of the owner’s home as it stands: the inside of the fridge or the freezer, pantry shelves, the counter, a cupboard or a bathroom shelf. List every food, drink, supplement and household consumable (cleaning and laundry, paper goods, personal care, health) you can see, one row each. The owner checks the rows before they become their stock.',
							'An item that shows in two photos is one row. Put each item where its photo shows it: what is in the fridge is `fridge`, what is on a pantry shelf is `pantry`, and so on, wherever that kind of food is usually kept. What is not food or drink is `household`, wherever it is seen.',
							'Count what you can count and estimate what you cannot: a carton that looks half full is half its size.',
							'These things were not bought today, so do not guess how long they keep: `daysUntilExpiry` is 0 for every row, and `expiryDate` is filled only where a date can be read on the item. Nothing here has a price or a shop: `priceCents` is 0 and `count` is 1 for every row, and `store` and `boughtOn` are empty.',
							'Leave out what is not a consumable: containers, appliances, dishes, magnets.',
							...captureRules(ctx.today),
						]
					: [
							'These files are one grocery haul: photos of the groceries, receipts, an order confirmation or a list, in any mix. List every item that was bought, one row each. The owner checks the rows before they are added to their stock.',
							'An item that shows in two of the files, on the receipt and in a photo, is one row. A receipt’s or an order’s quantity and weight win over what a photo suggests; a photo says what an abbreviated receipt line is.',
							'Keep the household consumables bought with the food (cleaning and laundry, paper goods, personal care, health), each under `household`. Leave out what is not a consumable, such as clothes, dishes, tools and gift cards, and every line that is not an item: totals, tax, discounts, bags, fees, an item that was refunded or not delivered.',
							'Where a receipt or an order prices an item, give that line’s price as printed and how many packages it is for; do not divide it yourself. An item only seen in a photo has no price. Give the shop’s name and the day when a receipt or an order shows them.',
							...captureRules(ctx.today),
						]
				).join('\n'),
			parse: async (text, input, ctx) => {
				await kitchen.load()
				const mode = captureMode(input)
				const parsed = parseJson(text)
				const rows = haulRows(parsed, { today: ctx.today, stock: kitchen.data().stock, newId, mode })
				if (!rows.length)
					return {
						output: { error: 'No items could be read from the files. Tell the owner; they can try others.' },
						failure: 'empty',
					}
				const sources = (ctx.files?.blocks ?? []).map(({ id, name, mime }) => ({ id, name, mime }))
				return {
					output: { status: 'drafted', rows: rows.length, note: DRAFTED },
					card: {
						kind: 'capture',
						mode,
						rows,
						...(sources.length ? { sources } : {}),
						// where and when it was bought, for the prices the rows carry (D-105)
						...(mode === 'haul' ? haulReceipt(parsed, ctx.today) : {}),
					},
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
						name: answer.text('The thing to buy, without its maker: "butter".'),
						brand: answer.text(
							'The brand to buy, when the stock or the owner’s words name one for it; an empty string otherwise.'
						),
						size: answer.text(
							'The package size to buy, when the stock names one for it: "16 oz"; an empty string otherwise.'
						),
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
					'List what those days need that is not already covered: leave out what the stock in the context holds enough of (an item at a quantity of 0 ran out and is not there), and what is already on a grocery list.',
					'Include the household items, kept under `household`, that ran out or are at or under their `threshold`.',
					notes ? `The owner added: ${notes}` : '',
				]
					.filter(Boolean)
					.join('\n')
			},
			parse: (text, input) => {
				const parsed = parseJson<{
					items?: { name?: string; brand?: string; size?: string; qty?: string; note?: string }[]
				}>(text)
				const items = (parsed?.items ?? []).flatMap((item) =>
					item.name
						? [
								{
									name: item.name,
									...(item.brand ? { brand: item.brand } : {}),
									...(item.size ? { size: item.size } : {}),
									qty: item.qty ?? '',
									note: item.note || undefined,
								},
							]
						: []
				)
				if (!items.length)
					return { output: { error: 'The list came back empty. Tell the owner it could not be drafted.' } }
				const store = kitchen.storeById(str(input, 'storeId'))
				return {
					output: { status: 'drafted', items, ...(store ? { store: store.name } : {}), note: DRAFTED },
					card: { kind: 'grocery', items, ...(store ? { storeId: store.id } : {}) },
				}
			},
		},
	},
	'add-stock': {
		preview: preview('add-stock', (input) =>
			entries(input, 'items').map((row) => {
				const named = labelled(str(row, 'name'), str(row, 'brand'))
				return named && say('add', named)
			})
		),
		run: async (input, ctx) => {
			const rows = entries(input, 'items').flatMap((row) => {
				// a grocer's product link names the thing, its size and its picture (D-91); the owner's words win
				const link = str(row, 'link')
				const product = link ? productLink(link) : undefined
				const name = str(row, 'name') ?? product?.name
				if (!name) return []
				const category = str(row, 'category')
				return [
					{
						name,
						brand: str(row, 'brand') ?? product?.brand,
						size: str(row, 'size') ?? product?.size,
						qty: given(row, 'qty') || '1',
						unit: str(row, 'unit'),
						// a household category puts it under `household`, whatever location was sent (D-122)
						...placed(
							location(row.location),
							(CATEGORIES as readonly string[]).includes(category ?? '') ? category : undefined
						),
						expiry: str(row, 'expiry'),
						tip: str(row, 'tip'),
						link,
					},
				]
			})
			if (!rows.length) return { output: { error: 'Nothing to add: pass `items`, each with a `name`.' } }
			const { items, undo } = kitchen.addStockRows(rows.map(({ link: _link, ...row }) => row))
			// a linked product's picture arrives after, for an item that has none by then
			let stopped = false
			const pictures: Undo[] = []
			rows.forEach((row, at) => {
				const id = items[at]?.id
				if (!row.link || !id) return
				void linkedPicture(row.link).then((image) => {
					if (stopped || !image || !kitchen.stockById(id) || kitchen.stockById(id)?.photo) return
					pictures.push(kitchen.setStockPhoto(id, image).undo)
				})
			})
			if (items.length)
				ctx.undo(get(t)('domains.kitchen.stock.toast.addedMany', { values: { count: items.length } }), () => {
					stopped = true
					together([undo, ...pictures])()
				})
			return {
				output: { added: items.map((item) => ({ id: item.id, name: item.name })) },
				touched: items.map((item) => `eden://stock-item/${item.id}`),
			}
		},
	},
	'update-stock': {
		preview: preview('update-stock', (input) => {
			const recipe = kitchen.recipeById(str(input, 'cookedRecipeId') ?? '')
			return [
				...(recipe ? [say('cooked', recipe.name)] : []),
				...entries(input, 'changes').map((row) => {
					const named = withFields(stockName(row.id), row)
					return named && say('change', named)
				}),
				...ids(input, 'remove').map((id) => {
					const named = stockName(id)
					return named && say('remove', named)
				}),
			]
		}),
		run: async (input, ctx) => {
			const changes = entries(input, 'changes')
			const remove = ids(input, 'remove')
			if (!changes.length && !remove.length)
				return { output: { error: 'Nothing to change: pass `changes`, `remove` or both.' } }
			const missing = [...changes.map((row) => String(row.id ?? '')), ...remove].filter((id) => !kitchen.stockById(id))
			if (missing.length) return unknown('stock item', 'stock-item', missing)
			const misplaced = changes.find(
				(row) => 'location' in row && !(LOCATIONS as readonly unknown[]).includes(row.location)
			)
			if (misplaced)
				return {
					output: {
						error: `\`location\` is one of ${LOCATIONS.join(', ')}, not ${JSON.stringify(misplaced.location)}. Nothing was changed.`,
					},
				}
			const names = (list: string[]) => list.map((id) => ({ id, name: kitchen.stockById(id)?.name ?? '' }))
			const changed = names(changes.map((row) => row.id as string))
			const removed = names(remove)
			const undos: Undo[] = []
			const cooked = kitchen.recipeById(str(input, 'cookedRecipeId') ?? '')
			// what cooking used is one write under the recipe's name, when the changes are quantities alone
			const amounts = changes.every((row) => Object.keys(row).every((key) => key === 'id' || key === 'qty'))
			if (cooked && changes.length && amounts) {
				undos.push(
					kitchen.cookRecipe(
						cooked.id,
						changes.map((row) => ({ stockId: row.id as string, qty: given(row, 'qty') || '0' }))
					).undo
				)
			} else {
				for (const row of changes) {
					const patch: StockPatch = {}
					for (const key of ['name', 'brand', 'size', 'qty', 'unit', 'expiry', 'tip'] as const) {
						const value = given(row, key)
						if (value !== undefined) patch[key] = value || undefined
					}
					// a threshold under nothing is how the model clears one
					if (typeof row.threshold === 'number') patch.threshold = row.threshold >= 0 ? row.threshold : undefined
					if ('location' in row) patch.location = row.location as StockLocation
					const category = given(row, 'category')
					if (category && (CATEGORIES as readonly string[]).includes(category)) {
						patch.category = category
						// a household category moves the item under `household` (D-122)
						const where = placed(patch.location ?? kitchen.stockById(row.id as string)!.location, category)
						if (where.location === 'household') patch.location = where.location
					}
					undos.push(kitchen.updateStock(row.id as string, patch).undo)
				}
			}
			if (remove.length) undos.push(kitchen.removeStockMany(remove).undo)
			ctx.undo(
				get(t)('domains.kitchen.gardener.toast.stock', { values: { count: changed.length + removed.length } }),
				together(undos)
			)
			return {
				output: { changed, removed },
				touched: [...changes.map((row) => row.id as string), ...remove].map((id) => `eden://stock-item/${id}`),
			}
		},
	},
	'edit-grocery': {
		preview: preview('edit-grocery', (input) => [
			...entries(input, 'add').map((row) => {
				const name = labelled(str(row, 'name') ?? productLink(str(row, 'link') ?? '')?.name, str(row, 'brand'))
				const store = 'storeId' in row ? storeName(row.storeId) : ''
				return name && store !== undefined ? say('add', store ? `${name} (${store})` : name) : undefined
			}),
			...entries(input, 'update').map((row) => {
				const item = groceryById(row.id)
				const named = withFields(labelled(item?.name, item?.brand), row, ['id'], { storeId: storeName })
				return named && say('change', named)
			}),
			...ids(input, 'remove').map((id) => {
				const item = groceryById(id)
				return item && say('remove', labelled(item.name, item.brand) ?? '')
			}),
			...ids(input, 'complete').map((id) => {
				const store = storeName(id)
				return store && say('complete', store)
			}),
		]),
		run: async (input, ctx) => {
			const add = entries(input, 'add')
			const update = entries(input, 'update')
			const remove = ids(input, 'remove')
			const complete = ids(input, 'complete')
			if (!add.length && !update.length && !remove.length && !complete.length)
				return { output: { error: 'Nothing to change: pass `add`, `update`, `remove` or `complete`.' } }
			const missing = [...update.map((row) => String(row.id ?? '')), ...remove].filter((id) => !groceryById(id))
			if (missing.length) return unknown('grocery item', 'grocery-item', missing)
			const stores = [...add, ...update].flatMap((row) => (typeof row.storeId === 'string' ? [row.storeId] : []))
			const noStore = [...stores, ...complete].filter((id) => storeNamed(id) === undefined)
			if (noStore.length) return unknown('store', 'grocery-store', noStore)

			const undos: Undo[] = []
			// the rows of one target go on together: a named store's, the unfiled list's, and the ones filed by memory
			const targets = new Map<string | null | undefined, GroceryRow[]>()
			for (const row of add) {
				const product = productLink(str(row, 'link') ?? '')
				const name = str(row, 'name') ?? product?.name
				if (!name) continue
				const price = typeof row.price === 'number' && row.price > 0 ? row.price : undefined
				const target = typeof row.storeId === 'string' ? (storeNamed(row.storeId)?.id ?? null) : undefined
				targets.set(target, [
					...(targets.get(target) ?? []),
					{
						name,
						brand: str(row, 'brand') ?? product?.brand,
						size: str(row, 'size') ?? product?.size,
						qty: given(row, 'qty') ?? '',
						...(price === undefined ? {} : { price }),
						note: str(row, 'note'),
					},
				])
			}
			type Line = { id: string; name: string; store: string | null }
			const added: Line[] = []
			for (const [target, rows] of targets) {
				const { items, undo } = kitchen.addGroceryItems(rows, 'manual', target)
				undos.push(undo)
				for (const item of items)
					added.push({ id: item.id, name: item.name, store: kitchen.storeOf(item)?.name ?? null })
			}
			const updated: Line[] = []
			for (const row of update) {
				const id = row.id as string
				const patch: GroceryPatch = {}
				for (const key of ['name', 'brand', 'size', 'qty', 'note'] as const) {
					const value = given(row, key)
					if (value !== undefined) patch[key] = key === 'qty' ? value : value || undefined
				}
				if (typeof row.price === 'number') patch.price = row.price > 0 ? row.price : undefined
				if (typeof row.storeId === 'string') patch.storeId = storeNamed(row.storeId)?.id ?? null
				if (Object.keys(patch).length) undos.push(kitchen.updateGrocery(id, patch).undo)
				if (typeof row.done === 'boolean' && groceryById(id)?.done !== row.done)
					undos.push(kitchen.toggleGrocery(id).undo)
				const item = groceryById(id)
				updated.push({ id, name: item?.name ?? '', store: kitchen.storeOf(item)?.name ?? null })
			}
			const removed = remove.map((id) => {
				const { item, undo } = kitchen.removeGrocery(id)
				undos.push(undo)
				return { id, name: item?.name ?? '' }
			})
			const completed = complete.map((id) => {
				const store = storeNamed(id)
				const list = kitchen.grocery.lists.find((entry) => entry.storeId === (store?.id ?? undefined))
				const { count, undo } = list ? kitchen.completeList(list.id) : { count: 0, undo: () => {} }
				undos.push(undo)
				return {
					store: store?.name ?? null,
					cleared: count,
					...(count ? {} : { note: 'Nothing on that list was checked off, so nothing left it.' }),
				}
			})
			const count = added.length + updated.length + removed.length + completed.length
			ctx.undo(get(t)('domains.kitchen.gardener.toast.grocery', { values: { count } }), together(undos))
			return {
				output: { added, updated, removed, completed },
				touched: [...added, ...updated, ...removed].map(({ id }) => `eden://grocery-item/${id}`),
			}
		},
	},
	'edit-stores': {
		preview: preview('edit-stores', (input) => [
			...entries(input, 'add').map((row) => {
				const named = withFields(str(row, 'name'), row, ['name'])
				return named && say('add', named)
			}),
			...entries(input, 'update').map((row) => {
				const named = withFields(storeName(row.id), row)
				return named && say('change', named)
			}),
			...ids(input, 'remove').map((id) => {
				const store = kitchen.storeById(id)
				return store && say('remove', store.name)
			}),
		]),
		run: async (input, ctx) => {
			const add = entries(input, 'add')
			const update = entries(input, 'update')
			const remove = ids(input, 'remove')
			if (!add.length && !update.length && !remove.length)
				return { output: { error: 'Nothing to change: pass `add`, `update` or `remove`.' } }
			const missing = [...update.map((row) => String(row.id ?? '')), ...remove].filter((id) => !kitchen.storeById(id))
			if (missing.length) return unknown('store', 'grocery-store', missing)
			// every website and every shop day is read before anything is written
			const sites = new Map<Fields, string | undefined>()
			const days = new Map<Fields, string | undefined>()
			for (const row of [...add, ...update]) {
				const url = given(row, 'url')
				if (url) {
					const site = siteAddress(url)
					if (!site)
						return {
							output: {
								error: `${JSON.stringify(url)} is not a website: pass an address starting with https://. Nothing was changed.`,
							},
						}
					sites.set(row, site)
				} else if (url === '') sites.set(row, undefined)
				const day = given(row, 'shopDay')
				if (day) {
					const shopDay = shopDayOf(day)
					if (!shopDay)
						return {
							output: {
								error: `${JSON.stringify(day)} is not a day: pass \`shopDay\` as YYYY-MM-DD or YYYY-MM-DDTHH:MM. Nothing was changed.`,
							},
						}
					days.set(row, shopDay)
				} else if (day === '') days.set(row, undefined)
			}
			const sells = (row: Fields): StoreSells[] | undefined => {
				const named = Array.isArray(row.sells)
					? row.sells.filter((entry): entry is StoreSells => (STORE_SELLS as readonly unknown[]).includes(entry))
					: []
				return named.length ? named : undefined
			}
			const undos: Undo[] = []
			const added = add.flatMap((row) => {
				const name = str(row, 'name')
				if (!name) return []
				const url = sites.get(row)
				const { store, created, undo } = kitchen.addStore(name, sells(row) ?? ['grocery'], {
					note: str(row, 'note'),
					place: { url, phone: str(row, 'phone') },
				})
				if (!created)
					return [
						{
							id: store.id,
							name: store.name,
							note: 'A store of that name was already there; it was left as it stands.',
						},
					]
				undos.push(undo)
				const shopDay = days.get(row)
				if (shopDay) undos.push(kitchen.setShopDay(store.id, shopDay))
				// the website the owner confirmed on the card is read on the device (D-108)
				if (url) undos.push(fetchStoreSite(store.id, url))
				return [{ id: store.id, name: store.name }]
			})
			const updated = update.map((row) => {
				const id = row.id as string
				const before = kitchen.storeById(id)!
				const patch: StorePatch = {}
				const name = str(row, 'name')
				if (name) patch.name = name
				const sold = sells(row)
				if (sold) patch.sells = sold
				const note = given(row, 'note')
				if (note !== undefined) patch.note = note
				const phone = given(row, 'phone')
				if (sites.has(row) || phone !== undefined)
					patch.place = {
						...before.place,
						...(sites.has(row) ? { url: sites.get(row) } : {}),
						...(phone === undefined ? {} : { phone: phone || undefined }),
					}
				if (Object.keys(patch).length) undos.push(kitchen.updateStore(id, patch).undo)
				if (days.has(row)) undos.push(kitchen.setShopDay(id, days.get(row)))
				const url = sites.get(row)
				if (url && url !== before.place?.url) undos.push(fetchStoreSite(id, url))
				return { id, name: kitchen.storeById(id)?.name ?? before.name }
			})
			const removed = remove.map((id) => {
				const { store, undo } = kitchen.removeStore(id)
				undos.push(undo)
				return { id, name: store?.name ?? '' }
			})
			if (undos.length)
				ctx.undo(
					get(t)('domains.kitchen.gardener.toast.stores', {
						// a store that was already there is not a change
						values: { count: added.filter((store) => !('note' in store)).length + updated.length + removed.length },
					}),
					together(undos)
				)
			return {
				output: { added, updated, removed },
				touched: [...added, ...updated, ...removed].map((store) => `eden://grocery-store/${store.id}`),
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
				const shown = url ? pagesRead.get(url) : undefined
				if (url) pagesRead.delete(url)
				const recipe = {
					...draft,
					...(url && !draft.sourceUrl ? { sourceUrl: url } : {}),
					...(shown?.sourceName && !draft.sourceName ? { sourceName: shown.sourceName } : {}),
					...(shown?.author && !draft.author ? { author: shown.author } : {}),
					...(shown?.imageUrl ? { imageUrl: shown.imageUrl } : {}),
				}
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
	'change-recipe': {
		preview: preview('change-recipe', (input) => {
			const recipe = kitchen.recipeById(str(input, 'id') ?? '')
			if (!recipe) return [undefined]
			const sent = stated((input ?? {}) as Fields)
			const fields = Object.keys(sent).filter((key) => key !== 'id' && key !== 'remove')
			return [
				sent.remove === true ? say('remove', recipe.name) : say('change', `${recipe.name} (${fields.join(', ')})`),
			]
		}),
		run: async (input, ctx) => {
			const id = str(input, 'id') ?? ''
			const recipe = kitchen.recipeById(id)
			if (!recipe) return unknown('recipe', 'recipe', [id])
			// a field sent as `null` is one left out, never one to clear: the stored recipe keeps it
			const { id: _id, remove, ...fields } = stated(input as Fields)
			if (remove === true) {
				const { undo } = kitchen.removeRecipe(id)
				ctx.undo(get(t)('domains.kitchen.gardener.toast.recipeRemoved', { values: { name: recipe.name } }), undo)
				return { output: { removed: { id, name: recipe.name } }, touched: [`eden://recipe/${id}`] }
			}
			if (!Object.keys(fields).length)
				return { output: { error: 'Nothing to change: pass the fields that change, or `remove: true`.' } }
			const { id: _was, photo: _photo, ...kept } = kitchen.data().recipes.find((entry) => entry.id === id)!
			const draft = recipeDraft({ ...kept, ...fields })
			if (!draft || !draft.steps.length)
				return {
					output: {
						error: 'A recipe keeps a `name`, at least one of `ingredients` and one of `steps`. Nothing was changed.',
					},
				}
			// what the Gardener wrote into a recipe passes the filter as a suggestion does (D-25)
			const texts = [draft.name, ...draft.tags, ...draft.ingredients.map((line) => line.name)]
			if (!isSafe(texts, await forbidden.read()))
				return {
					output: {
						error:
							'This change was not made: it names something the owner has said they must not be offered. Do not say which.',
					},
				}
			const { undo } = kitchen.updateRecipe(id, draft)
			ctx.undo(get(t)('domains.kitchen.gardener.toast.recipeChanged', { values: { name: draft.name } }), undo)
			return { output: { changed: { id, name: draft.name } }, touched: [`eden://recipe/${id}`] }
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
							name: answer.text('The thing to buy, without its maker: "butter".'),
							brand: answer.text('The brand to buy, when the stock names one for it; an empty string otherwise.'),
							size: answer.text(
								'The package size to buy, when the stock names one for it: "16 oz"; an empty string otherwise.'
							),
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
					'Use what expires soonest first, so less is wasted. On an evening with an event, keep the meal quick and light. Stock kept under `household` is not food and is never cooked with. Put one shop day where the stock runs out, with what to buy that day. Add a task only for a step that has to happen ahead of a meal, such as defrosting or marinating.',
					notes ? `The owner added: ${notes}` : '',
				]
					.filter(Boolean)
					.join('\n')
			},
			parse: (text) => {
				const parsed = parseJson<{
					days?: { day: string; meals: { name: string; recipeId?: string }[] }[]
					shopDay?: { day: string; items: { name: string; brand?: string; size?: string; qty?: string }[] }
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
						grocery: shop?.items
							?.filter((item) => item.name)
							.map((item) => ({
								name: item.name,
								...(item.brand ? { brand: item.brand } : {}),
								...(item.size ? { size: item.size } : {}),
								qty: item.qty ?? '',
							})),
					},
				}
			},
			maxTokens: 3000,
		},
	},
}

/** Hearth's part of a draft's commit: a drafted grocery list, and the shop list of a plan. */
export async function kitchenCommitDraft(card: DraftCard): Promise<{ undo: () => void } | undefined> {
	if (card.kind === 'grocery') return kitchen.addGroceryItems(card.items, 'manual', kitchen.storeById(card.storeId)?.id)
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
