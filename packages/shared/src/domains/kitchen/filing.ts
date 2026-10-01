// Where an item goes (product/domains/kitchen.md, "Surfaces"; D-96, D-97): one list per store, and an item added
// without a store is filed where it was last bought. A store remembers what was bought there by normalised name;
// what no store remembers sits on the list with no store until the owner moves it. The same memory holds what
// each thing last cost there (D-105).
import { normaliseBrand, normaliseName } from './match.js'
import type { Bought, Grocery, GroceryStore, GroceryItem, GroceryList } from './types.js'

/** An entry of a store's memory as it is read: a store written before prices holds a bare timestamp. */
export function boughtOf(value: Bought | string | undefined): Bought | undefined {
	return typeof value === 'string' ? { at: value } : value
}

/** A store's memory with every entry in today's shape. */
export function boughtMap(bought: Record<string, Bought | string> | undefined): Record<string, Bought> | undefined {
	if (!bought) return undefined
	return Object.fromEntries(Object.entries(bought).map(([key, value]) => [key, boughtOf(value)!]))
}

/** When an entry's price was learned. */
export const pricedAt = (entry: Bought): string => entry.pricedAt ?? entry.at

/** The store an item of this name was last bought at; none when no store remembers it. */
export function storeFor(name: string, stores: readonly GroceryStore[]): GroceryStore | undefined {
	const key = normaliseName(name)
	let found: GroceryStore | undefined
	let latest = ''
	if (!key) return undefined
	for (const store of stores) {
		const at = boughtOf(store.bought?.[key])?.at
		if (at && at > latest) {
			found = store
			latest = at
		}
	}
	return found
}

/** One thing bought, or put on a store's list: its name, and what is known of what was paid. */
export interface Purchase {
	name: string
	brand?: string
	size?: string
	price?: number
}

/**
 * The store, remembering that these were bought there at this time. The same store when no name says anything. A
 * purchase with a price sets what the thing costs here, with its size and brand, unless the store holds a price
 * learned later (an old receipt read late); one without leaves the price as it was. `at` only moves forward.
 */
export function remember(store: GroceryStore, purchases: readonly Purchase[], at: string): GroceryStore {
	const named = purchases.flatMap((purchase) => {
		const key = normaliseName(purchase.name)
		return key ? [{ key, purchase }] : []
	})
	if (!named.length) return store
	const bought = { ...store.bought }
	for (const { key, purchase } of named) {
		const held = boughtOf(bought[key])
		const latest = held && held.at > at ? held.at : at
		if (purchase.price === undefined || (held?.price !== undefined && pricedAt(held) > at)) {
			// the price, if any, is kept, dated when it was learned once `at` moves past it
			const stale = held?.price !== undefined && pricedAt(held) < latest
			bought[key] = { ...held, at: latest, ...(stale ? { pricedAt: pricedAt(held) } : {}) }
			continue
		}
		bought[key] = {
			at: latest,
			price: purchase.price,
			...(purchase.size ? { size: purchase.size } : {}),
			...(purchase.brand ? { brand: purchase.brand } : {}),
			...(at < latest ? { pricedAt: at } : {}),
		}
	}
	return { ...store, bought }
}

/**
 * The store a receipt names (D-105): "HEB", "H-E-B #123" and "H-E-B plus!" all find H-E-B. The names are compared
 * with case, spaces and punctuation aside, and one may hold the other; of several, the one that shares most.
 */
export function storeNamed(name: string, stores: readonly GroceryStore[]): GroceryStore | undefined {
	const read = normaliseBrand(name)
	if (read.length < 2) return undefined
	let found: GroceryStore | undefined
	let shared = 0
	for (const store of stores) {
		const own = normaliseBrand(store.name)
		if (own.length < 2 || !(read.includes(own) || own.includes(read))) continue
		const length = Math.min(read.length, own.length)
		if (length > shared) {
			found = store
			shared = length
		}
	}
	return found
}

/**
 * A store's row as a model is sent it: its name, what it sells, its note and when it was shopped. What it
 * remembers is left out, being long and of no use to a list's draft, with its picture, its place among the
 * stores and its address, which is the owner's own (D-101).
 */
export function storeForPack<T extends { payload: unknown }>(row: T): T {
	const { bought: _bought, photo: _photo, position: _position, place, ...payload } = row.payload as GroceryStore
	const { address: _address, ...where } = place ?? {}
	return { ...row, payload: { ...payload, ...(Object.keys(where).length ? { place: where } : {}) } }
}

/** The stores in the owner's order (D-101): by `position`, and those without one after, in the order given. */
export function orderStores<T extends Pick<GroceryStore, 'position'>>(stores: readonly T[]): T[] {
	return stores
		.map((store, at) => ({ store, at }))
		.sort((a, b) => (a.store.position ?? Infinity) - (b.store.position ?? Infinity) || a.at - b.at)
		.map((entry) => entry.store)
}

/**
 * The stores with one moved `delta` places, every one numbered by where it now sits, and those whose number
 * changed, which are the rows to write. Nothing changes for a store that is not there or already at that end.
 */
export function reorderStores(
	stores: readonly GroceryStore[],
	id: string,
	delta: number
): { stores: GroceryStore[]; changed: GroceryStore[] } {
	const from = stores.findIndex((store) => store.id === id)
	const to = Math.max(0, Math.min(stores.length - 1, from + delta))
	if (from < 0 || to === from) return { stores: [...stores], changed: [] }
	const moved = [...stores]
	moved.splice(to, 0, ...moved.splice(from, 1))
	const changed: GroceryStore[] = []
	const numbered = moved.map((store, position) => {
		if (store.position === position) return store
		const next = { ...store, position }
		changed.push(next)
		return next
	})
	return { stores: numbered, changed }
}

/** A batch of rows by where each is filed, in the order each store first appears; no `storeId` is the unfiled list. */
export function fileRows<T extends { name: string }>(
	rows: readonly T[],
	stores: readonly GroceryStore[]
): { storeId: string | undefined; rows: T[] }[] {
	const groups: { storeId: string | undefined; rows: T[] }[] = []
	for (const row of rows) {
		const storeId = storeFor(row.name, stores)?.id
		const group = groups.find((entry) => entry.storeId === storeId)
		if (group) group.rows.push(row)
		else groups.push({ storeId, rows: [row] })
	}
	return groups
}

/** One list as the page shows it. */
export interface GroceryBlock {
	/** The store; none for the unfiled list. */
	store?: GroceryStore
	/** The store's list row; none until its first item or shop day. */
	list?: GroceryList
	items: GroceryItem[]
	/** How many of the items are checked off. */
	checked: number
	/** How many are still to buy. */
	left: number
}

/**
 * The page's lists: one per store, in the stores' order, whether or not it holds anything, then the unfiled list
 * while it holds something. An item whose list is gone, or whose list names a store that is gone, counts as unfiled.
 */
export function groceryBlocks(grocery: Grocery): GroceryBlock[] {
	const block = (items: GroceryItem[], store?: GroceryStore, list?: GroceryList): GroceryBlock => ({
		...(store ? { store } : {}),
		...(list ? { list } : {}),
		items,
		checked: items.filter((item) => item.done).length,
		left: items.filter((item) => !item.done).length,
	})
	const known = new Set(grocery.stores.map((store) => store.id))
	const filed = new Map<string, string>()
	for (const list of grocery.lists) if (list.storeId && known.has(list.storeId)) filed.set(list.id, list.storeId)

	const blocks = grocery.stores.map((store) =>
		block(
			grocery.items.filter((item) => filed.get(item.listId) === store.id),
			store,
			grocery.lists.find((list) => list.storeId === store.id)
		)
	)
	const unfiled = grocery.items.filter((item) => !filed.has(item.listId))
	if (unfiled.length) {
		blocks.push(
			block(
				unfiled,
				undefined,
				grocery.lists.find((list) => !list.storeId)
			)
		)
	}
	return blocks
}
