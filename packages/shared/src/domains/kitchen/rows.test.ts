import { describe, expect, it } from 'vitest'
import { createEngine, type EngineStorage } from '../../data/engine.js'
import { createIdGenerator, isUlid } from '../../data/ulid.js'
import { kitchenFromRows, kitchenRows, kitchenUris } from './rows.js'
import { groceryBlocks } from './filing.js'
import {
	KITCHEN,
	type GroceryItemPayload,
	type GroceryListPayload,
	type GroceryStorePayload,
	type KitchenData,
	type LegacyGrocery,
	type RecipePayload,
	type StockPayload,
} from './types.js'

// the document as the store kept it: UUIDs for what the owner added, sample ids for what was seeded, and one
// grocery list with a name and a default store
const document: Omit<KitchenData, 'grocery'> & { grocery: LegacyGrocery } = {
	stock: [
		{
			id: 'st-01',
			name: 'Chicken thighs',
			qty: '600',
			unit: 'g',
			location: 'fridge',
			expiry: '2026-10-01',
			tip: 'Keep on the lowest shelf.',
			source: 'sample',
			sourcedAt: '2026-09-28T18:40:00',
		},
		{
			id: '9f1c2a34-5b6d-4e7f-8a9b-0c1d2e3f4a5b',
			name: 'Rice',
			qty: '2',
			unit: 'kg',
			location: 'pantry',
			source: 'manual',
			sourcedAt: '2026-09-29T15:02:11.000Z',
		},
	],
	recipes: [
		{
			id: 'r-01',
			name: 'Dal',
			serves: 2,
			minutes: 35,
			tags: ['quick'],
			ingredients: [{ name: 'red lentils', qty: '200', unit: 'g' }],
			steps: ['Simmer the lentils.'],
		},
	],
	grocery: {
		name: 'This week',
		store: 'H-E-B',
		shopDay: '2026-10-03T10:00:00',
		items: [
			{ id: 'g-01', name: 'Spinach', qty: '1 bag', origin: 'recipe', note: 'Dal', done: true },
			{ id: 'g-02', name: 'Oat milk', qty: '2', store: 'Costco', origin: 'manual', done: false },
		],
	},
}

/** Today's shape, as the sample data has it: two stores, a list each, and one item not filed. */
const today: KitchenData = {
	stock: [],
	recipes: [],
	grocery: {
		stores: [
			{ id: 'gs-01', name: 'H-E-B', sells: ['grocery'], bought: { lime: '2026-09-27T10:00:00.000Z' } },
			{ id: 'gs-02', name: 'Target', sells: ['grocery', 'home-goods'] },
		],
		lists: [
			{ id: 'gl-01', storeId: 'gs-01', shopDay: '2026-10-03T10:00:00' },
			{ id: 'gl-02', storeId: 'gs-02' },
			{ id: 'gl-00' },
		],
		items: [
			{ id: 'g-01', listId: 'gl-01', name: 'Limes', qty: '4', origin: 'recipe', done: false },
			{ id: 'g-04', listId: 'gl-02', name: 'Paper towels', qty: '', origin: 'manual', done: false },
			{ id: 'g-05', listId: 'gl-00', name: 'Coffee filters', qty: '', origin: 'manual', done: false },
		],
	},
}

function memory(): EngineStorage {
	const map = new Map<string, string>()
	return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => void map.set(key, value) }
}

const read = (engine: ReturnType<typeof createEngine>) =>
	kitchenFromRows({
		stock: engine.queryEntities<StockPayload>({ type: KITCHEN.stock }),
		recipes: engine.queryEntities<RecipePayload>({ type: KITCHEN.recipe }),
		stores: engine.queryEntities<GroceryStorePayload>({ type: KITCHEN.store }),
		lists: engine.queryEntities<GroceryListPayload>({ type: KITCHEN.list }),
		items: engine.queryEntities<GroceryItemPayload>({ type: KITCHEN.item }),
	})

describe('kitchen rows', () => {
	it('gives every record a new id and keeps everything else', () => {
		const { data, ops } = kitchenRows(today, createIdGenerator())
		const { stores, lists, items } = data.grocery
		const ids = [...stores, ...lists, ...items].map((record) => record.id)
		expect(ids.every(isUlid)).toBe(true)
		expect(new Set(ids).size).toBe(ids.length)

		// A list still names its store and an item its list, under their new ids.
		expect(stores.map((store) => store.name)).toEqual(['H-E-B', 'Target'])
		expect(stores[0]!.bought).toEqual({ lime: '2026-09-27T10:00:00.000Z' })
		expect(lists.map((list) => list.storeId)).toEqual([stores[0]!.id, stores[1]!.id, undefined])
		expect(lists[0]!.shopDay).toBe('2026-10-03T10:00:00')
		expect(items.map((item) => item.listId)).toEqual(lists.map((list) => list.id))
		expect(items.map((item) => item.name)).toEqual(['Limes', 'Paper towels', 'Coffee filters'])

		expect(ops.map((op) => (op.op === 'createEntity' ? op.input.type : op.op))).toEqual([
			KITCHEN.store,
			KITCHEN.store,
			KITCHEN.list,
			KITCHEN.list,
			KITCHEN.list,
			KITCHEN.item,
			KITCHEN.item,
			KITCHEN.item,
		])
		expect(kitchenUris(data)).toHaveLength(ops.length)
	})

	it('reads back from the rows what it wrote, in the same order', () => {
		const engine = createEngine(memory())
		const written = kitchenRows({ ...today, stock: document.stock, recipes: document.recipes }, createIdGenerator())
		engine.applyBatch(written.ops)
		expect(read(engine)).toEqual(written.data)
	})

	it('leaves out an item whose list is not in the data', () => {
		const { data } = kitchenRows(
			{ grocery: { ...today.grocery, items: [{ ...today.grocery.items[0]!, listId: 'nowhere' }] } },
			createIdGenerator()
		)
		expect(data.grocery.items).toEqual([])
	})

	it('splits the old document’s one list into a list per store', () => {
		const { data, ops } = kitchenRows(document, createIdGenerator())
		const strip = ({ id: _id, ...rest }: { id: string }) => rest
		expect(data.stock.map(strip)).toEqual(document.stock.map(strip))
		expect(data.recipes.map(strip)).toEqual(document.recipes.map(strip))

		const { stores, lists, items } = data.grocery
		expect(stores.map(strip)).toEqual([
			{ name: 'H-E-B', sells: ['grocery'] },
			{ name: 'Costco', sells: ['grocery'] },
		])
		// The list's shop day stays with its default store; its name is gone.
		expect(lists.map(strip)).toEqual([
			{ storeId: stores[0]!.id, shopDay: '2026-10-03T10:00:00' },
			{ storeId: stores[1]!.id },
		])
		expect(items.map(strip)).toEqual([
			{ name: 'Spinach', qty: '1 bag', origin: 'recipe', note: 'Dal', done: true, listId: lists[0]!.id },
			{ name: 'Oat milk', qty: '2', origin: 'manual', done: false, listId: lists[1]!.id },
		])
		expect(kitchenUris(data)).toHaveLength(ops.length)
	})

	it('puts the old document’s items under no store when it named none', () => {
		const { data } = kitchenRows(
			{
				grocery: {
					name: 'This week',
					store: '',
					items: [{ id: 'a', name: 'Tape', qty: '', origin: 'manual', done: false }],
				},
			},
			createIdGenerator()
		)
		expect(data.grocery.stores).toEqual([])
		expect(data.grocery.lists).toHaveLength(1)
		expect(data.grocery.lists[0]!.storeId).toBeUndefined()
		expect(data.grocery.items[0]!.listId).toBe(data.grocery.lists[0]!.id)
	})

	it('writes no list for a document that never had one', () => {
		const written = kitchenRows(
			{ stock: document.stock, recipes: [], grocery: { name: '', store: '', items: [] } },
			createIdGenerator()
		)
		expect(written.data.grocery).toEqual({ stores: [], lists: [], items: [] })
		expect(written.ops).toHaveLength(2)
		expect(kitchenFromRows({ stock: [], recipes: [], stores: [], lists: [], items: [] })).toEqual({
			stock: [],
			recipes: [],
			grocery: { stores: [], lists: [], items: [] },
		})
	})

	it('takes a document with parts missing', () => {
		expect(kitchenRows({}, createIdGenerator())).toEqual({
			data: { stock: [], recipes: [], grocery: { stores: [], lists: [], items: [] } },
			ops: [],
		})
	})

	it('reads a recipe written before it held its lines with both lists empty', () => {
		const engine = createEngine(memory())
		const old = engine.createEntity<RecipePayload>({
			type: KITCHEN.recipe,
			payload: { name: 'Plain rice', serves: 4, minutes: 20, tags: [] },
		})
		expect(read(engine).recipes).toEqual([
			{ id: old.id, name: 'Plain rice', serves: 4, minutes: 20, tags: [], ingredients: [], steps: [] },
		])
	})

	it('keeps an item whose list is gone, as one not filed', () => {
		const engine = createEngine(memory())
		engine.applyBatch(kitchenRows(today, createIdGenerator()).ops)
		const stray = engine.createEntity<GroceryItemPayload>({
			type: KITCHEN.item,
			payload: { listId: '01J9ZQ4M3T8R5V2X7Y6W1B0CDE', name: 'Stray', qty: '', origin: 'manual', done: false },
		})
		const { grocery } = read(engine)
		expect(grocery.items.map((item) => item.id)).toContain(stray.id)
		const unfiled = groceryBlocks(grocery).find((block) => !block.store)
		// Two ids made in the same millisecond by two generators have no set order.
		expect(unfiled?.items.map((item) => item.name).sort()).toEqual(['Coffee filters', 'Stray'])
	})
})
