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
import type { DraftCard } from '@eden/shared/gardener'
import { addDays } from '@eden/shared/dates'
import { LOCATIONS, type StockLocation } from '@eden/shared/domains/kitchen'
import { t } from '@eden/shared/i18n'
import { queryFacts } from '@eden/shared/profile'
import {
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

const JSON_ONLY = 'Answer with JSON only, no prose around it.'

export const kitchenTools: Record<string, ToolHandler> = {
	'suggest-recipes': {
		delegate: {
			prompt: (input) => {
				const count = int(input, 'count', 3, 1, 5)
				const constraints = str(input, 'constraints')
				return [
					`From the stock, the recipes and the owner's preferences in the context, suggest ${count} things to cook.`,
					'Prefer what uses stock that expires soon. Never suggest anything with a listed allergy, restriction or disliked ingredient.',
					constraints ? `Constraints: ${constraints}` : '',
					'Answer as {"suggestions":[{"recipeId":"<id of a listed recipe, or omit>","name":"","minutes":0,"why":"one sentence","uses":["<stock item ids>"]}]}.',
					JSON_ONLY,
				]
					.filter(Boolean)
					.join('\n')
			},
			parse: async (text) => {
				const parsed = parseJson<{ suggestions?: Suggestion[] }>(text)
				const suggestions = safe(parsed?.suggestions ?? [], await forbidden())
				return { output: { suggestions } }
			},
		},
	},
	'storage-tip': {
		delegate: {
			prompt: (input) => {
				const id = str(input, 'stockItemId')
				const name = (id && kitchen.stockById(id)?.name) || str(input, 'name') || 'the item'
				return `How is ${name} best stored, and how long does it typically keep? Answer as {"tip":"two sentences at most","shelfLifeDays":0}. ${JSON_ONLY}`
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
			prompt: () =>
				[
					'List every grocery item in this photo as stock rows.',
					'Answer as {"rows":[{"name":"","qty":"1","unit":"","location":"fridge|freezer|pantry|counter","daysUntilExpiry":0}]}.',
					'Give daysUntilExpiry only where you can estimate it from the kind of food.',
					JSON_ONLY,
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
				return { output: { rows: rows.length }, card: { kind: 'capture', rows } }
			},
			maxTokens: 2000,
		},
	},
	'draft-grocery-list': {
		delegate: {
			prompt: (input) => {
				const recipes = ((input as { forRecipeIds?: unknown })?.forRecipeIds as string[] | undefined)
					?.map((id) => kitchen.recipeById(id)?.name)
					.filter(Boolean)
				const days = int(input, 'days', 7, 1, 14)
				const notes = str(input, 'notes')
				return [
					`Draft a grocery list for the next ${days} days from the stock, the recipes and the list in the context.`,
					recipes?.length ? `Cook: ${recipes.join(', ')}.` : '',
					'Leave out what is in stock and what is already on the list.',
					notes ? `Notes: ${notes}` : '',
					'Answer as {"items":[{"name":"","qty":"","note":""}]}.',
					JSON_ONLY,
				]
					.filter(Boolean)
					.join('\n')
			},
			parse: (text) => {
				const parsed = parseJson<{ items?: { name?: string; qty?: string; note?: string }[] }>(text)
				const items = (parsed?.items ?? []).flatMap((item) =>
					item.name ? [{ name: item.name, qty: item.qty ?? '', note: item.note || undefined }] : []
				)
				return { output: { items }, card: { kind: 'grocery', items } }
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
			const { items, undo } = kitchen.addStockRows(rows)
			if (items.length)
				ctx.undo(get(t)('domains.kitchen.stock.toast.addedMany', { values: { count: items.length } }), undo)
			return {
				output: { ids: items.map((item) => item.id) },
				touched: items.map((item) => `eden://stock-item/${item.id}`),
			}
		},
	},
	'plan-week': {
		delegate: {
			prompt: (input, ctx) => {
				const from = str(input, 'from') ?? ctx.today
				const days = int(input, 'days', 7, 1, 14)
				const notes = str(input, 'notes')
				return [
					`Plan meals from ${from} for ${days} days from the stock, the recipes, the events and the tasks in the context.`,
					'Use what expires soon first, keep evenings with events light, and put one shop day where the stock runs out.',
					notes ? `Notes: ${notes}` : '',
					'Answer as {"days":[{"day":"YYYY-MM-DD","meals":[{"name":"","recipeId":"<listed id or omit>"}]}],"shopDay":{"day":"YYYY-MM-DD","items":[{"name":"","qty":""}]},"tasks":[{"title":"","due":"YYYY-MM-DD"}]}.',
					JSON_ONLY,
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
				const meals = (parsed?.days ?? []).filter((day) => day.day && Array.isArray(day.meals))
				const tasks = (parsed?.tasks ?? []).filter((task) => task.title)
				const shop = parsed?.shopDay
				return {
					output: parsed ?? { error: 'no plan' },
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
