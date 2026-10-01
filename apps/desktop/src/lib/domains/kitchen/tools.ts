// Hearth's tool handlers (product/domains/kitchen.md, "Gardener tools"; docs/engineering/gardener.md, "Tools"): what
// each declared tool does with what the model sends. The model-backed ones hand the runtime a prompt and read the
// answer back; the plain ones write through the store. Every recipe suggestion passes the local safety filter
// before it is shown, whatever the model saw (D-25). The rows a delegated request reads come from the pack, built
// from the tool's declared reads; a prompt names what it wants of them and nothing more.
import { open } from '@tauri-apps/plugin-dialog'
import { readFile } from '@tauri-apps/plugin-fs'
import { get } from 'svelte/store'
import type { CaptureRow } from '@eden/ui-kit'
import { attach, newId } from '@eden/shared/data'
import { answer, type DraftCard } from '@eden/shared/gardener'
import { addDays } from '@eden/shared/dates'
import { LOCATIONS, type StockLocation } from '@eden/shared/domains/kitchen'
import { t } from '@eden/shared/i18n'
import { queryFacts } from '@eden/shared/profile'
import {
	DRAFTED,
	int,
	parseJson,
	str,
	type ToolContext,
	type ToolHandler,
	type ToolImage,
	type ToolResult,
} from '$lib/shell/gardener/types'
import { kitchen } from './store.svelte.js'

interface Suggestion {
	recipeId?: string
	name: string
	minutes?: number
	why: string
	uses?: string[]
}

const IMAGE_TYPES: Record<string, ToolImage['mediaType']> = {
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	png: 'image/png',
	webp: 'image/webp',
	gif: 'image/gif',
}

/** What the owner must never be offered: allergens and restrictions, read locally and never sent (D-25). */
async function forbidden(): Promise<string[]> {
	try {
		const facts = await queryFacts({ types: ['allergy', 'medical-dietary-restriction', 'disliked-ingredient'] })
		return facts.flatMap((fact) => {
			const value = fact.value as { substance?: string } | string
			const word = typeof value === 'string' ? value : value?.substance
			return word ? [word.toLowerCase()] : []
		})
	} catch {
		return []
	}
}

/** Drops every suggestion that names a forbidden word anywhere in what it says or uses. */
function safe(suggestions: Suggestion[], words: string[]): Suggestion[] {
	if (!words.length) return suggestions
	const names = (id: string) => kitchen.stockById(id)?.name ?? ''
	return suggestions.filter((suggestion) => {
		const text = [suggestion.name, suggestion.why, ...(suggestion.uses ?? []).map(names)].join(' ').toLowerCase()
		return !words.some((word) => text.includes(word))
	})
}

function location(value: unknown): StockLocation {
	return typeof value === 'string' && (LOCATIONS as readonly string[]).includes(value)
		? (value as StockLocation)
		: 'pantry'
}

async function pickImage(): Promise<ToolImage | undefined> {
	const path = await open({
		multiple: false,
		directory: false,
		filters: [{ name: 'Images', extensions: Object.keys(IMAGE_TYPES) }],
	})
	if (typeof path !== 'string') return undefined
	const bytes = await readFile(path)
	const extension = path.split('.').pop()?.toLowerCase() ?? ''
	const mediaType = IMAGE_TYPES[extension] ?? 'image/jpeg'
	const digest = await crypto.subtle.digest('SHA-256', bytes)
	const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
	const blob = new Blob([bytes], { type: mediaType })
	const { width, height } = await new Promise<{ width: number; height: number }>((resolve) => {
		const url = URL.createObjectURL(blob)
		const image = new Image()
		image.onload = () => {
			URL.revokeObjectURL(url)
			resolve({ width: image.naturalWidth, height: image.naturalHeight })
		}
		image.onerror = () => {
			URL.revokeObjectURL(url)
			resolve({ width: 0, height: 0 })
		}
		image.src = url
	})
	let binary = ''
	for (const byte of bytes) binary += String.fromCharCode(byte)
	return { data: btoa(binary), mediaType, hash, width, height, path }
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
				const suggestions = safe(all, await forbidden()).map(({ recipeId, ...rest }) =>
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
			image: () => pickImage(),
			schema: answer.object({
				rows: answer.list(
					answer.object({
						name: answer.text('The item, named as a shopper would name it.'),
						qty: answer.text('The amount alone: 2, 500, 1.'),
						unit: answer.text('The unit of the amount: g, ml, bunch, tin; an empty string for a plain count.'),
						location: answer.oneOf(LOCATIONS, 'Where this kind of food is normally kept.'),
						daysUntilExpiry: answer.integer(
							'How many days this kind of food typically keeps from today; 0 when that cannot be estimated.'
						),
					})
				),
			}),
			prompt: () =>
				[
					'List every grocery item you can see in this photo, one row each. The owner checks the rows before they are added to their stock.',
					'When you cannot tell what something is, leave it out: a wrong row costs the owner more than a missing one.',
				].join('\n'),
			parse: (text, _input, ctx) => {
				const parsed = parseJson<{ rows?: Record<string, unknown>[] }>(text)
				const rows: CaptureRow[] = (parsed?.rows ?? []).flatMap((row) => {
					const name = str(row, 'name')
					if (!name) return []
					const days = typeof row.daysUntilExpiry === 'number' ? Math.round(row.daysUntilExpiry) : undefined
					return [
						{
							id: newId(),
							name,
							qty: str(row, 'qty') ?? '1',
							unit: str(row, 'unit'),
							location: location(row.location),
							expiry: days && days > 0 ? addDays(ctx.today, days) : undefined,
							estimated: days !== undefined && days > 0,
						},
					]
				})
				if (!rows.length)
					return {
						output: { error: 'No grocery items could be read from the photo. Tell the owner; they can try another.' },
					}
				return { output: { status: 'drafted', rows: rows.length, note: DRAFTED }, card: { kind: 'capture', rows } }
			},
			maxTokens: 2000,
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

/** Hearth's part of a draft's commit: the grocery items, the captured stock with its photo, a plan's shop list. */
export async function kitchenCommitDraft(card: DraftCard): Promise<{ undo: () => void } | undefined> {
	if (card.kind === 'grocery') return kitchen.addGroceryItems(card.items)
	if (card.kind === 'plan') return card.grocery?.length ? kitchen.addGroceryItems(card.grocery) : undefined
	if (card.kind !== 'capture') return undefined
	const { items, undo } = kitchen.addStockRows(
		card.rows.map((row) => ({
			name: row.name,
			qty: String(row.qty),
			unit: row.unit,
			location: row.location,
			expiry: row.expiry,
			estimated: row.estimated,
		})),
		'capture'
	)
	if (card.path && items.length) {
		// the photo joins the stock it made (D-13); a photo that cannot be attached leaves the rows standing
		try {
			await attach({
				kind: 'haul-photo',
				path: card.path,
				links: items.map((item) => ({ uri: `eden://stock-item/${item.id}`, relation: 'from' as const })),
			})
		} catch {
			// nothing to do: the rows are there, the photo is not
		}
	}
	return { undo }
}

/** What Hearth's quick actions write, by id; `capture-haul` is the tool itself, run from the panel. */
export const kitchenQuickActions = {
	'add-to-grocery': (value: string) => kitchen.addGrocery(value),
}

export type { ToolContext, ToolResult }
