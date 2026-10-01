// Hearth on the scheduler (product/domains/kitchen.md, "Signals and notifications"; docs/engineering/signals.md). Each
// morning it reads the stock and, when something is expiring, emits `stock.expiring`, once a day, and when something
// is at or under its low-stock threshold, emits `stock.low`, once a week. On the morning of
// the grocery list's shop day it emits `grocery.shop-day`, once for the list and the day. The rules in the manifest
// turn the first into an inbox card and the second into a card and an OS notification.
//
// The handlers read the rows, not the app's store, which is not loaded until a Hearth page is opened. The shop day
// is a field of the list until it is an Event (kitchen.md), so its reminder is a one-shot set from the list as it
// is stored: when the shell starts, and whenever the list is replaced under it.
import { queryEntities } from '../../data/client.js'
import { toUri } from '../../data/uri.js'
import { todayIso } from '../../dates/index.js'
import { cancelSchedule, setSchedule } from '../../scheduler/client.js'
import { emit, onSchedule } from '../../signals/runtime.js'
import { weekStartOf } from '../../dates/days.js'
import { expiringDigest, lowDigest, shopDayMorning } from './digest.js'
import { KITCHEN, type GroceryItemPayload, type GroceryListPayload, type StockPayload } from './types.js'

/** The repeating schedule the manifest declares. */
export const MORNING_SCHEDULE = 'kitchen.morning'
/** The one-shot for the morning of the list's shop day. */
export const SHOP_DAY_SCHEDULE = 'kitchen.shop-day'

/**
 * Sets the shop-day reminder for the morning of the list's shop day, or takes it back when the list has none or the
 * day has passed. A morning already past today is due at once, and the signal's key keeps it to one reminder.
 */
export async function ensureShopDay(today = todayIso()): Promise<void> {
	const [list] = await queryEntities<GroceryListPayload>({ type: KITCHEN.list })
	const morning = shopDayMorning(list?.payload.shopDay)
	if (morning && morning.day >= today) await setSchedule(SHOP_DAY_SCHEDULE, morning.at)
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

/** A reminder that comes due on another day than the list's shop day (the app was closed, the day was moved) says nothing. */
async function emitShopDay(today = todayIso()): Promise<void> {
	const [[list], items] = await Promise.all([
		queryEntities<GroceryListPayload>({ type: KITCHEN.list }),
		queryEntities<GroceryItemPayload>({ type: KITCHEN.item }),
	])
	if (!list || shopDayMorning(list.payload.shopDay)?.day !== today) return
	const count = items.filter((item) => item.payload.listId === list.id && !item.payload.done).length
	await emit('grocery.shop-day', { uris: [toUri(KITCHEN.list, list.id)], count }, { dedupeKey: `${list.id}:${today}` })
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
