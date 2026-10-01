// Where an item goes (product/domains/kitchen.md, "Surfaces"; D-96, D-97): one list per store, and an item added
// without a store is filed where it was last bought. A store remembers what was bought there by normalised name;
// what no store remembers sits on the list with no store until the owner moves it.
import { normaliseName } from './match.js'
import type { Grocery, GroceryStore, GroceryItem, GroceryList } from './types.js'

/** The store an item of this name was last bought at; none when no store remembers it. */
export function storeFor(name: string, stores: readonly GroceryStore[]): GroceryStore | undefined {
	const key = normaliseName(name)
	let found: GroceryStore | undefined
	let latest = ''
	if (!key) return undefined
	for (const store of stores) {
		const at = store.bought?.[key]
		if (at && at > latest) {
			found = store
			latest = at
		}
	}
	return found
}

/** The store, remembering that these were bought there at this time. The same store when no name says anything. */
export function remember(store: GroceryStore, names: readonly string[], at: string): GroceryStore {
	const keys = names.map(normaliseName).filter(Boolean)
	if (!keys.length) return store
	const bought = { ...store.bought }
	for (const key of keys) bought[key] = at
	return { ...store, bought }
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
