// What ran out (product/domains/kitchen.md, "What ran out"; D-92): an item used up stays a stock row holding
// nothing, so it can be shown as run out and bought again with its picture, its category and its tip. Stock shows
// the recent ones, the grocery list offers them all, and one nobody bought again is let go in the end.
import { sameItem } from './match.js'
import { isOut } from './quantity.js'
import type { GroceryItem, StockItem } from './types.js'

/** Stock's own list holds what ran out within this many days; "Buy it again" holds the older ones too. */
export const RECENT_DAYS = 7
/** An item that has held nothing for this many days is let go, with its picture. */
export const KEEP_DAYS = 90

const DAY = 86_400_000

/** How many days ago an item ran out; none for one written at nothing with no date. */
function daysOut(item: Pick<StockItem, 'outAt'>, now: number): number {
	const at = item.outAt ? Date.parse(item.outAt) : NaN
	return Number.isFinite(at) ? (now - at) / DAY : 0
}

/** The newest first; the stock's own order among those that ran out together. */
const newestFirst = (a: StockItem, b: StockItem) => (b.outAt ?? '').localeCompare(a.outAt ?? '')

/** An item as it is once it has run out: holding nothing, dated, and with no expiry, since nothing is left to go off. */
export function ranOut(item: StockItem, at: string): StockItem {
	const { expiry: _expiry, estimated: _estimated, ...rest } = item
	return { ...rest, qty: '0', outAt: item.outAt && isOut(item) ? item.outAt : at }
}

/** What Stock shows as run out: within the last `RECENT_DAYS`, the newest first. */
export function recentlyOut(stock: readonly StockItem[], now: number): StockItem[] {
	return stock.filter((item) => isOut(item) && daysOut(item, now) <= RECENT_DAYS).sort(newestFirst)
}

/**
 * "Buy it again": everything that ran out, the newest first, less what is already on a grocery list: the same
 * name, of a brand that can be its own (D-104).
 */
export function buyAgain(
	stock: readonly StockItem[],
	listed: readonly Pick<GroceryItem, 'name' | 'brand'>[]
): StockItem[] {
	return stock.filter((item) => isOut(item) && !listed.some((line) => sameItem(line, item))).sort(newestFirst)
}

/** What is let go: run out more than `KEEP_DAYS` ago and never bought again. */
export function lapsed(stock: readonly StockItem[], now: number): StockItem[] {
	return stock.filter((item) => isOut(item) && daysOut(item, now) > KEEP_DAYS)
}
