// The grocery rows from before there was a list per store (D-96), brought to today's shape. A list then had a name
// and a default store, both free text, and an item could name another store. Each store named becomes a store of its
// own with a list; the old list keeps its id and becomes its default store's, so its shop day and its reminder hold;
// an item that named another store moves to that store's list. The answer is the writes, and none once it is done.
import { toUri, type BatchOp, type Entity } from '../../data/index.js'
import { normaliseName } from './match.js'
import {
	KITCHEN,
	type GroceryOrigin,
	type Grocery,
	type GroceryStorePayload,
	type GroceryItemPayload,
	type GroceryListPayload,
	type LegacyGrocery,
} from './types.js'

/** A list row as it was: a name and a default store beside the shop day. */
interface OldListPayload {
	name?: string
	store?: string
	storeId?: string
	shopDay?: string
}
/** An item row as it was: it may name a store of its own. */
interface OldItemPayload {
	name: string
	qty: string
	listId: string
	store?: string
	origin: GroceryOrigin
	note?: string
	done: boolean
}

const isOld = (payload: OldListPayload) => 'name' in payload || 'store' in payload
/** Two spellings that differ only in case or outer spaces name one store. */
const keyOf = (name: string) => name.trim().toLowerCase()

export function groceryUpgrade(
	rows: {
		stores: readonly Entity<GroceryStorePayload>[]
		lists: readonly Entity<OldListPayload>[]
		items: readonly Entity<OldItemPayload>[]
	},
	newId: () => string,
	now: string
): BatchOp[] {
	const old = rows.lists.filter((list) => isOld(list.payload))
	if (!old.length) return []

	// the stores by name and the list each has, as they stand; the unfiled list under ''
	const storeIds = new Map(rows.stores.map((store) => [keyOf(store.payload.name), store.id]))
	const listOf = new Map<string, string>()
	for (const list of rows.lists) {
		if (!isOld(list.payload) && !listOf.has(list.payload.storeId ?? '')) listOf.set(list.payload.storeId ?? '', list.id)
	}
	const madeStores = new Map<string, GroceryStorePayload>()
	const bought = new Map<string, Record<string, string>>()
	const ops: BatchOp[] = []
	const later: BatchOp[] = []

	const storeNamed = (name: string): string => {
		const known = storeIds.get(keyOf(name))
		if (known) return known
		const id = newId()
		storeIds.set(keyOf(name), id)
		madeStores.set(id, { name: name.trim(), sells: ['grocery'] })
		return id
	}
	const listFor = (storeId: string): string => {
		const known = listOf.get(storeId)
		if (known) return known
		const id = newId()
		listOf.set(storeId, id)
		later.push({
			op: 'createEntity',
			input: { id, type: KITCHEN.list, payload: { storeId } satisfies GroceryListPayload },
		})
		return id
	}

	for (const list of old) {
		const { store = '', shopDay } = list.payload
		const home = store.trim() ? storeNamed(store) : ''
		// the first list a store has keeps its row; a later one for the same store empties into it and goes
		if (listOf.has(home)) {
			later.push({ op: 'delete', uri: toUri(KITCHEN.list, list.id) })
		} else {
			listOf.set(home, list.id)
			const payload: GroceryListPayload = { ...(home ? { storeId: home } : {}), ...(shopDay ? { shopDay } : {}) }
			later.push({ op: 'updateEntity', id: list.id, payload })
		}
		for (const item of rows.items.filter((row) => row.payload.listId === list.id)) {
			const { store: named = '', ...rest } = item.payload
			const storeId = named.trim() ? storeNamed(named) : home
			const listId = storeId ? listFor(storeId) : listOf.get('')!
			if (storeId) {
				const key = normaliseName(rest.name)
				if (key) bought.set(storeId, { ...bought.get(storeId), [key]: now })
			}
			if ('store' in item.payload || listId !== rest.listId) {
				later.push({ op: 'updateEntity', id: item.id, payload: { ...rest, listId } satisfies GroceryItemPayload })
			}
		}
	}

	// the stores first, each remembering what its list holds, so a list never names a store that is not there
	for (const [id, payload] of madeStores) {
		const memory = bought.get(id)
		ops.push({
			op: 'createEntity',
			input: { id, type: KITCHEN.store, payload: memory ? { ...payload, bought: memory } : payload },
		})
	}
	for (const store of rows.stores) {
		const memory = bought.get(store.id)
		if (memory) {
			const payload: GroceryStorePayload = { ...store.payload, bought: { ...memory, ...store.payload.bought } }
			ops.push({ op: 'updateEntity', id: store.id, payload })
		}
	}
	return [...ops, ...later]
}

/**
 * The old document's one list in today's shape: a store and a list for every store it names, the default store's
 * first, and the unfiled list when an item has no store. The ids are placeholders; the rows take new ones.
 */
export function groceryFromLegacy(old: LegacyGrocery): Grocery {
	const grocery: Grocery = { stores: [], lists: [], items: [] }
	const listFor = (name: string): string => {
		const key = keyOf(name)
		if (!key) {
			const unfiled = grocery.lists.find((list) => !list.storeId)
			if (unfiled) return unfiled.id
			grocery.lists.push({ id: 'list:' })
			return 'list:'
		}
		let store = grocery.stores.find((entry) => keyOf(entry.name) === key)
		if (!store) {
			store = { id: `store:${key}`, name: name.trim(), sells: ['grocery'] }
			grocery.stores.push(store)
			grocery.lists.push({ id: `list:${key}`, storeId: store.id })
		}
		return `list:${key}`
	}
	const home = old.store ?? ''
	const items = old.items ?? []
	if (keyOf(home) || old.shopDay || items.length) {
		const id = listFor(home)
		if (old.shopDay) grocery.lists.find((list) => list.id === id)!.shopDay = old.shopDay
	}
	for (const { store, ...item } of items) grocery.items.push({ ...item, listId: listFor(store?.trim() ? store : home) })
	return grocery
}
