// Hearth on the scheduler (product/domains/kitchen.md, "Signals and notifications"; docs/engineering/signals.md). Each
// morning it reads the stock and, when something is expiring, emits `stock.expiring`, once a day, and when something
// is at or under its low-stock threshold, emits `stock.low`, once a week. On the morning of a store's shop day it
// emits `grocery.shop-day`, once for that store's list and the day (D-98). The rules in the manifest turn the first
// into an inbox card and the last into a card and an OS notification.
//
// The handlers read the rows, not the app's store, which is not loaded until a Hearth page is opened. A shop day is
// a field of its list until it is an Event (kitchen.md), so the reminder is one one-shot, set to the earliest
// morning among the lists as they are stored: when the shell starts, whenever a list changes under it, and again
// once a morning's reminders have been said.
import { queryEntities } from '../../data/client.js'
import { toUri } from '../../data/uri.js'
import { todayIso } from '../../dates/index.js'
import { cancelSchedule, setSchedule } from '../../scheduler/client.js'
import { emit, onSchedule } from '../../signals/runtime.js'
import { weekStartOf } from '../../dates/days.js'
import { parseStamp } from '../../data/hlc.js'
import type { Entity } from '../../data/types.js'
import { expiringDigest, lowDigest, nextShopMorning, reminderMorning } from './digest.js'
import {
	KITCHEN,
	type GroceryItemPayload,
	type GroceryListPayload,
	type GroceryStorePayload,
	type StockPayload,
} from './types.js'

/** The repeating schedule the manifest declares. */
export const MORNING_SCHEDULE = 'kitchen.morning'
/** The one-shot for the next morning a list's shop day falls on. */
export const SHOP_DAY_SCHEDULE = 'kitchen.shop-day'

/** A list's shop day and when it was last set: its row changes only when its shop day or its store does. */
const reminded = (list: Entity<GroceryListPayload>) => ({
	shopDay: list.payload.shopDay,
	setAt: parseStamp(list.updatedAt)?.wallMs,
})

/**
 * Sets the shop-day reminder for the earliest morning among the lists' shop days, or takes it back when no list has
 * one to come. A morning already past today is due at once, and the signal's key keeps it to one reminder a list.
 * With `after`, that day's reminders have been said and only a later day counts.
 */
export async function ensureShopDay(today = todayIso(), after?: string): Promise<void> {
	const lists = await queryEntities<GroceryListPayload>({ type: KITCHEN.list })
	const morning = nextShopMorning(lists.map(reminded), today, after)
	if (morning) await setSchedule(SHOP_DAY_SCHEDULE, morning.at)
	else await cancelSchedule(SHOP_DAY_SCHEDULE)
}

async function emitExpiring(today = todayIso()): Promise<void> {
	const stock = await queryEntities<StockPayload>({ type: KITCHEN.stock })
	const digest = expiringDigest(
		stock.map((row) => ({ ...row.payload, id: row.id })),
		today
	)
	if (digest) await emit('stock.expiring', { ...digest }, { dedupeKey: today })
}

/** What is low is said once a week: the morning's check emits it under the week's key, and a second one is dropped. */
async function emitLow(today = todayIso()): Promise<void> {
	const stock = await queryEntities<StockPayload>({ type: KITCHEN.stock })
	const digest = lowDigest(stock.map((row) => ({ ...row.payload, id: row.id })))
	if (digest) await emit('stock.low', { ...digest }, { dedupeKey: weekStartOf(today, 'monday') })
}

/**
 * Says each store's list whose shop day is today, then sets the reminder for the next day one falls on. A reminder
 * that comes due on another day than any list's (the app was closed, the day was moved) says nothing.
 */
async function emitShopDay(today = todayIso()): Promise<void> {
	const [stores, lists, items] = await Promise.all([
		queryEntities<GroceryStorePayload>({ type: KITCHEN.store }),
		queryEntities<GroceryListPayload>({ type: KITCHEN.list }),
		queryEntities<GroceryItemPayload>({ type: KITCHEN.item }),
	])
	for (const list of lists) {
		const store = stores.find((entry) => entry.id === list.payload.storeId)
		if (!store || reminderMorning(reminded(list))?.day !== today) continue
		const count = items.filter((item) => item.payload.listId === list.id && !item.payload.done).length
		await emit(
			'grocery.shop-day',
			{ uris: [toUri(KITCHEN.list, list.id)], count, store: store.payload.name },
			{ dedupeKey: `${list.id}:${today}` }
		)
	}
	await ensureShopDay(today, today)
}

/** Binds Hearth to its schedules; the shell calls it once when it starts, and the answer unbinds. */
export function bindKitchenSignals(): () => void {
	const stops = [
		onSchedule(MORNING_SCHEDULE, async () => {
			await emitExpiring()
			await emitLow()
		}),
		onSchedule(SHOP_DAY_SCHEDULE, () => emitShopDay()),
	]
	void ensureShopDay().catch(() => null)
	return () => stops.forEach((stop) => stop())
}
