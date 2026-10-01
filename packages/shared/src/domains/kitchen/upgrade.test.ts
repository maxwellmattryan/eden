import { describe, expect, it } from 'vitest'
import { createEngine, type EngineStorage } from '../../data/engine.js'
import { createIdGenerator } from '../../data/ulid.js'
import { storeFor } from './filing.js'
import {
	KITCHEN,
	type GroceryStore,
	type GroceryStorePayload,
	type GroceryItemPayload,
	type GroceryListPayload,
} from './types.js'
import { groceryUpgrade } from './upgrade.js'

const NOW = '2026-10-01T12:00:00.000Z'

function memory(): EngineStorage {
	const map = new Map<string, string>()
	return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => void map.set(key, value) }
}

/** An engine holding rows as they were written before there was a list per store. */
function workspace() {
	const engine = createEngine(memory())
	const newId = createIdGenerator()
	const list = (payload: object) => engine.createEntity({ id: newId(), type: KITCHEN.list, payload }).id
	const item = (listId: string, name: string, fields: object = {}) =>
		engine.createEntity({
			id: newId(),
			type: KITCHEN.item,
			payload: { name, qty: '', origin: 'manual', done: false, listId, ...fields },
		}).id
	const read = () => ({
		stores: engine.queryEntities<GroceryStorePayload>({ type: KITCHEN.store }),
		lists: engine.queryEntities<GroceryListPayload>({ type: KITCHEN.list }),
		items: engine.queryEntities<GroceryItemPayload>({ type: KITCHEN.item }),
	})
	const upgrade = () => {
		const ops = groceryUpgrade(read(), newId, NOW)
		if (ops.length) engine.applyBatch(ops)
		return ops
	}
	return { engine, list, item, read, upgrade }
}

describe('the grocery rows from before a list per store', () => {
	it('makes a store of every store named and gives each its list', () => {
		const { list, item, read, upgrade } = workspace()
		const old = list({ name: 'H-E-B Saturday', store: 'H-E-B', shopDay: '2026-10-03T10:00:00' })
		const limes = item(old, 'Limes', { qty: '4', origin: 'recipe', note: 'tacos' })
		const ginger = item(old, 'Ginger', { done: true })
		const towels = item(old, 'Paper towels', { store: 'Costco' })
		upgrade()

		const { stores, lists, items } = read()
		expect(stores.map((store) => store.payload.name)).toEqual(['H-E-B', 'Costco'])
		expect(stores.every((store) => store.payload.sells.join() === 'grocery')).toBe(true)
		const [heb, costco] = stores

		// The old list keeps its row and its shop day, and loses its name.
		expect(lists).toHaveLength(2)
		expect(lists.find((row) => row.id === old)?.payload).toEqual({ storeId: heb!.id, shopDay: '2026-10-03T10:00:00' })
		const other = lists.find((row) => row.id !== old)!
		expect(other.payload).toEqual({ storeId: costco!.id })

		const byId = new Map(items.map((row) => [row.id, row.payload]))
		expect(byId.get(limes)).toEqual({
			name: 'Limes',
			qty: '4',
			origin: 'recipe',
			note: 'tacos',
			done: false,
			listId: old,
		})
		expect(byId.get(ginger)).toMatchObject({ done: true, listId: old })
		expect(byId.get(towels)).toMatchObject({ name: 'Paper towels', listId: other.id })
		expect(items.every((row) => !('store' in row.payload))).toBe(true)
	})

	it('has each store remember what its list held', () => {
		const { list, item, read, upgrade } = workspace()
		const old = list({ name: '', store: 'H-E-B' })
		item(old, 'Limes')
		item(old, 'Paper towels', { store: 'Costco' })
		upgrade()

		const stores = read().stores.map((row) => ({ ...row.payload, id: row.id })) as GroceryStore[]
		expect(stores[0]!.bought).toEqual({ lime: { at: NOW } })
		expect(storeFor('paper towel', stores)?.name).toBe('Costco')
	})

	it('does nothing the second time', () => {
		const { list, item, read, upgrade } = workspace()
		const old = list({ name: 'This week', store: 'H-E-B' })
		item(old, 'Limes')
		item(old, 'Soap', { store: 'Target' })
		expect(upgrade().length).toBeGreaterThan(0)
		const once = read()
		expect(upgrade()).toEqual([])
		expect(read()).toEqual(once)
	})

	it('leaves rows already in today’s shape alone', () => {
		const { engine, list, item, upgrade } = workspace()
		const store = engine.createEntity({ type: KITCHEN.store, payload: { name: 'H-E-B', sells: ['grocery'] } })
		item(list({ storeId: store.id }), 'Limes')
		item(list({}), 'Tape')
		expect(upgrade()).toEqual([])
	})

	it('keeps a list with no default store as the unfiled list', () => {
		const { list, item, read, upgrade } = workspace()
		const old = list({ name: 'This week', store: '', shopDay: '2026-10-03T10:00:00' })
		const tape = item(old, 'Tape')
		const soap = item(old, 'Soap', { store: 'Target' })
		upgrade()

		const { stores, lists, items } = read()
		expect(stores.map((store) => store.payload.name)).toEqual(['Target'])
		expect(stores[0]!.payload.bought).toEqual({ soap: { at: NOW } })
		expect(lists.find((row) => row.id === old)?.payload).toEqual({ shopDay: '2026-10-03T10:00:00' })
		expect(items.find((row) => row.id === tape)?.payload.listId).toBe(old)
		const target = lists.find((row) => row.payload.storeId === stores[0]!.id)!
		expect(items.find((row) => row.id === soap)?.payload.listId).toBe(target.id)
	})

	it('reads two spellings of one store as one, the first spelling kept', () => {
		const { list, item, read, upgrade } = workspace()
		const old = list({ name: '', store: 'H-E-B' })
		item(old, 'Soap', { store: 'Target ' })
		item(old, 'Tape', { store: 'target' })
		item(old, 'Limes', { store: 'h-e-b' })
		upgrade()

		const { stores, lists, items } = read()
		expect(stores.map((store) => store.payload.name)).toEqual(['H-E-B', 'Target'])
		expect(lists).toHaveLength(2)
		expect(items.filter((row) => row.payload.listId === old).map((row) => row.payload.name)).toEqual(['Limes'])
	})

	it('empties a second list for the same store into the first, and uses a store that is already there', () => {
		const { engine, list, item, read, upgrade } = workspace()
		const known = engine.createEntity({
			type: KITCHEN.store,
			payload: { name: 'H-E-B', sells: ['grocery'], bought: { lime: '2026-09-01T10:00:00.000Z' } },
		})
		const first = list({ name: 'This week', store: 'H-E-B' })
		const second = list({ name: 'Next week', store: 'h-e-b', shopDay: '2026-10-10T10:00:00' })
		item(first, 'Limes')
		const eggs = item(second, 'Eggs')
		upgrade()

		const { stores, lists, items } = read()
		expect(stores).toHaveLength(1)
		// What the store already remembered stands; what the lists held is added.
		// a memory from before prices is left as it was written, and reads as an entry all the same
		expect(stores[0]!.payload.bought).toEqual({ lime: '2026-09-01T10:00:00.000Z', egg: { at: NOW } })
		expect(lists.map((row) => row.id)).toEqual([first])
		expect(lists[0]!.payload).toEqual({ storeId: known.id })
		expect(items.find((row) => row.id === eggs)?.payload.listId).toBe(first)
		expect(engine.queryEntities({ type: KITCHEN.list, includeDeleted: true }).map((row) => row.id)).toContain(second)
	})
})
