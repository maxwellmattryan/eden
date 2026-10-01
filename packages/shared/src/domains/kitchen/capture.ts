// Capture a haul, the part that is not a model's (product/domains/kitchen.md, "Capture a haul"; D-13, D-86): the
// draft rows read from what the model answered, each checked against the stock it would merge into, and what a
// merge leaves of the item it lands on. Everything here is local and the same every time: the model reads the
// photos, the app decides what merges.
import { addDays } from '../../dates/days.js'
import { mergeTarget } from './match.js'
import { add, formatAmount, parseAmount } from './quantity.js'
import { CATEGORIES, LOCATIONS, type CaptureMode, type StockItem, type StockLocation } from './types.js'

/** Where an item is in a photo, as fractions of the photo's width and height from its top left corner. */
export interface PhotoBox {
	left: number
	top: number
	right: number
	bottom: number
}

/** One row of a haul on the capture sheet, before it is stock. */
export interface HaulRow {
	id: string
	name: string
	qty: string
	unit?: string
	location: StockLocation
	/** An ISO date. */
	expiry?: string
	/** The expiry was guessed from the kind of food, not read from a label. */
	estimated?: boolean
	/** One of `CATEGORIES`. */
	category?: string
	/** A tip worth keeping with the item (D-87). */
	tip?: string
	/** The stock item this row would be added to, as the sheet names it, and whether it will be. */
	merge?: { id: string; name: string; on: boolean }
	/** The photo the item is seen in, counted from 1 among the files as they were given, and where in it (D-90). */
	seen?: { file: number; box: PhotoBox }
	/** The item's picture, cut from that photo: a small image as a data URL, kept with the item on commit. */
	image?: string
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/** The answer gives a box in thousandths of the photo; one too small to show anything, or most of the photo, is none. */
const BOX_UNITS = 1000
const MIN_SIDE = 0.03
const MAX_AREA = 0.85

/** The box a row's answer names, as fractions, or nothing when it names none worth cutting out. */
export function photoBox(raw: unknown): PhotoBox | undefined {
	const box = raw as Record<string, unknown> | null
	const edge = (key: string) => (typeof box?.[key] === 'number' ? Math.min(1, Math.max(0, box[key] / BOX_UNITS)) : NaN)
	const [left, top, right, bottom] = [edge('left'), edge('top'), edge('right'), edge('bottom')]
	if (![left, top, right, bottom].every(Number.isFinite)) return undefined
	const width = right - left
	const height = bottom - top
	if (width < MIN_SIDE || height < MIN_SIDE || width * height > MAX_AREA) return undefined
	return { left, top, right, bottom }
}

/** How the sheet names the item a row merges into: its name and what it holds, "Eggs (8)". */
export function mergeLabel(item: Pick<StockItem, 'name' | 'qty' | 'unit'>): string {
	return `${item.name} (${item.unit ? `${item.qty} ${item.unit}` : item.qty})`
}

/**
 * A row with its merge worked out again, after its name, its location, its quantity or its unit changed. A row
 * that still lands on the same item keeps the owner's choice; one that lands on another, or on none, starts over.
 */
export function remerge(row: HaulRow, stock: readonly StockItem[]): HaulRow {
	const target = mergeTarget(row, stock)
	const { merge, ...rest } = row
	if (!target) return rest
	return { ...rest, merge: { id: target.id, name: mergeLabel(target), on: merge?.id === target.id ? merge.on : true } }
}

/**
 * The rows of a haul from the model's answer (`{ rows: [...] }`, the shape `capture-haul` holds it to). A row with
 * no name is dropped; a location or a category the answer made up falls back; an expiry is the date read from a
 * label when there is one, else today plus the days this kind of food keeps, marked estimated.
 */
export function haulRows(
	parsed: unknown,
	ctx: { today: string; stock: readonly StockItem[]; newId: () => string; mode?: CaptureMode }
): HaulRow[] {
	const rows = (parsed as { rows?: unknown } | null)?.rows
	if (!Array.isArray(rows)) return []
	return rows.flatMap((raw: Record<string, unknown> | null) => {
		const name = text(raw?.name)
		if (!raw || !name) return []
		const location = (LOCATIONS as readonly string[]).includes(text(raw.location))
			? (text(raw.location) as StockLocation)
			: 'pantry'
		const category = (CATEGORIES as readonly string[]).includes(text(raw.category)) ? text(raw.category) : undefined
		const printed = text(raw.expiryDate)
		const days = typeof raw.daysUntilExpiry === 'number' ? Math.round(raw.daysUntilExpiry) : 0
		// what is already on the shelf was not bought today: only a date read from a label is kept for it (D-89)
		const estimate = ctx.mode === 'stock' ? 0 : days
		const expiry = ISO_DAY.test(printed) ? printed : estimate > 0 ? addDays(ctx.today, estimate) : undefined
		const file = typeof raw.photo === 'number' ? Math.round(raw.photo) : 0
		const box = file > 0 ? photoBox(raw.box) : undefined
		const qty = typeof raw.qty === 'number' ? String(raw.qty) : text(raw.qty)
		const row: HaulRow = {
			id: ctx.newId(),
			name,
			qty: parseAmount(qty) ? qty : '1',
			...(text(raw.unit) ? { unit: text(raw.unit) } : {}),
			location,
			...(expiry ? { expiry } : {}),
			...(expiry && !ISO_DAY.test(printed) ? { estimated: true } : {}),
			...(category ? { category } : {}),
			...(text(raw.tip) ? { tip: text(raw.tip) } : {}),
			...(box ? { seen: { file, box } } : {}),
		}
		return [remerge(row, ctx.stock)]
	})
}

/**
 * What a stock item holds once a row has merged into it: the two quantities together in the item's own unit (or,
 * taking stock, the row's quantity alone), the earlier of the two expiries (what was there goes off first), and the
 * row's category and tip where the item had none. `null` when the quantities cannot be added, which `mergeTarget`
 * rules out for a row it matched.
 */
export function mergeInto(item: StockItem, row: HaulRow, mode: CaptureMode = 'haul'): StockItem | null {
	const held = parseAmount(item.qty, item.unit)
	const added = parseAmount(row.qty, row.unit)
	// a haul adds to what was there; taking stock says what is there now, in the item's own unit (D-89)
	const sum = held && added ? add(mode === 'stock' ? { ...held, value: 0 } : held, added) : null
	if (!sum) return null
	const rowFirst = !!row.expiry && (!item.expiry || row.expiry < item.expiry)
	const expiry = rowFirst ? row.expiry : item.expiry
	const estimated = rowFirst ? row.estimated : item.estimated
	const { expiry: _expiry, estimated: _estimated, ...rest } = item
	return {
		...rest,
		qty: formatAmount(sum).qty,
		...(expiry ? { expiry } : {}),
		...(expiry && estimated ? { estimated: true } : {}),
		...(item.category || !row.category ? {} : { category: row.category }),
		...(item.tip || !row.tip ? {} : { tip: row.tip }),
	}
}
