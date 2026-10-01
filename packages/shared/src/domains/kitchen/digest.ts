// What Hearth says on its schedules (product/domains/kitchen.md, "Signals and notifications"), as pure functions of
// the rows: the morning's digest of what is expiring, and the morning a shop day's reminder is for. `signals.ts`
// binds them to the scheduler.
import { toUri } from '../../data/uri.js'
import { daysUntil } from '../../dates/index.js'
import { onDay } from '../../scheduler/rules.js'
import { isLow } from './quantity.js'
import { KITCHEN, type StockItem } from './types.js'

/** Dated on or before the day after tomorrow counts as expiring (the mockup's "on or before Friday" on a Wednesday). */
export const SOON_DAYS = 2
/** When a morning's reminder comes, on the local clock; the manifest's `morning` schedule is declared at the same. */
export const MORNING = '08:00'
/** A payload names things and carries a few fields: past this many, the digest says how many more. */
const MAX_URIS = 20

/** How near the digest's items are: all of them alike, or `soon` when they differ. */
export type ExpiringWhen = 'past' | 'today' | 'tomorrow' | 'soon'

/** The payload of `stock.expiring`: what the rule's line is written from. */
export interface ExpiringDigest {
	uris: string[]
	count: number
	/** The items the line does not name. */
	more: number
	first: string
	second?: string
	when: ExpiringWhen
}

function whenOf(days: number): ExpiringWhen {
	return days < 0 ? 'past' : days === 0 ? 'today' : days === 1 ? 'tomorrow' : 'soon'
}

/** Whether an item counts as expiring on a day: dated, and no later than `SOON_DAYS` after it. */
export function expiresSoon(item: Pick<StockItem, 'expiry'>, today?: string): boolean {
	return !!item.expiry && daysUntil(item.expiry, today) <= SOON_DAYS
}

/** The digest of what is expiring on a day, the nearest first, or `null` when nothing is. */
export function expiringDigest(stock: readonly StockItem[], today: string): ExpiringDigest | null {
	const expiring = stock
		.filter((item) => expiresSoon(item, today))
		.sort((a, b) => (a.expiry ?? '').localeCompare(b.expiry ?? '') || a.name.localeCompare(b.name))
	const [first, second] = expiring
	if (!first) return null
	const whens = new Set(expiring.map((item) => whenOf(daysUntil(item.expiry ?? today, today))))
	return {
		uris: expiring.slice(0, MAX_URIS).map((item) => toUri(KITCHEN.stock, item.id)),
		count: expiring.length,
		more: expiring.length - 1,
		first: first.name,
		...(second ? { second: second.name } : {}),
		when: whens.size === 1 ? whenOf(daysUntil(first.expiry ?? today, today)) : 'soon',
	}
}

/** The payload of `stock.low`: what is at or under its threshold, by name. */
export interface LowDigest {
	uris: string[]
	count: number
	/** The items the line does not name. */
	more: number
	first: string
	second?: string
}

/** The digest of what is low, by name, or `null` when nothing is. */
export function lowDigest(stock: readonly StockItem[]): LowDigest | null {
	const low = stock.filter((item) => isLow(item)).sort((a, b) => a.name.localeCompare(b.name))
	const [first, second] = low
	if (!first) return null
	return {
		uris: low.slice(0, MAX_URIS).map((item) => toUri(KITCHEN.stock, item.id)),
		count: low.length,
		more: low.length - 1,
		first: first.name,
		...(second ? { second: second.name } : {}),
	}
}

/**
 * The morning of a list's shop day: the day, and the instant the local clock reads `MORNING` on it. `null` for a
 * list with no shop day, or one that is not a date.
 */
export function shopDayMorning(shopDay: string | undefined): { day: string; at: number } | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(shopDay ?? '')
	if (!match) return null
	const [day, year, month, date] = match
	const midnight = new Date(Number(year), Number(month) - 1, Number(date))
	if (Number.isNaN(midnight.getTime()) || midnight.getDate() !== Number(date)) return null
	return { day, at: onDay(midnight.getTime(), MORNING) }
}

/**
 * The morning a list's reminder is for. A shop day set once its morning had passed has none: the owner has just said
 * when they are going, and a reminder would only say it back.
 */
export function reminderMorning(list: { shopDay?: string; setAt?: number }): { day: string; at: number } | null {
	const morning = shopDayMorning(list.shopDay)
	return morning && !(list.setAt !== undefined && list.setAt > morning.at) ? morning : null
}

/**
 * The next reminder among the lists: the earliest morning that is today or later, or `null` when no list has one.
 * With `after`, only a day later than it counts: what the reminder is set to once that day's has been said.
 */
export function nextShopMorning(
	lists: readonly { shopDay?: string; setAt?: number }[],
	today: string,
	after?: string
): { day: string; at: number } | null {
	let next: { day: string; at: number } | null = null
	for (const list of lists) {
		const morning = reminderMorning(list)
		if (!morning || morning.day < today || (after && morning.day <= after)) continue
		if (!next || morning.at < next.at) next = morning
	}
	return next
}
