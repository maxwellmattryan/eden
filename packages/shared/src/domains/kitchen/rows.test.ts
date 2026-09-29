import { describe, expect, it } from 'vitest'
import { createEngine, type EngineStorage } from '../../data/engine.js'
import { createIdGenerator, isUlid } from '../../data/ulid.js'
import { kitchenFromRows, kitchenRows, kitchenUris } from './rows.js'
import {
	KITCHEN,
	type GroceryItemPayload,
	type GroceryListPayload,
	type KitchenData,
	type RecipePayload,
	type StockPayload,
} from './types.js'

// the document as the store kept it: UUIDs for what the owner added, sample ids for what was seeded
const document: KitchenData = {
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
	recipes: [{ id: 'r-01', name: 'Dal', serves: 2, minutes: 35, tags: ['quick'] }],
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

function memory(): EngineStorage {
	const map = new Map<string, string>()
	return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => void map.set(key, value) }
}

describe('kitchen rows', () => {
	it('gives every record a new id and keeps everything else', () => {
		const { data, listId, ops } = kitchenRows(document, createIdGenerator())
		const ids = [...data.stock, ...data.recipes, ...data.grocery.items].map((record) => record.id)
		expect([...ids, listId].every((id) => id !== undefined && isUlid(id))).toBe(true)
		expect(new Set(ids).size).toBe(ids.length)

		const strip = ({ id: _id, ...rest }: { id: string }) => rest
		expect(data.stock.map(strip)).toEqual(document.stock.map(strip))
		expect(data.recipes.map(strip)).toEqual(document.recipes.map(strip))
		expect(data.grocery.items.map(strip)).toEqual(document.grocery.items.map(strip))
		expect(data.grocery).toMatchObject({ name: 'This week', store: 'H-E-B', shopDay: '2026-10-03T10:00:00' })

		expect(ops.map((op) => (op.op === 'createEntity' ? op.input.type : op.op))).toEqual([
			KITCHEN.stock,
			KITCHEN.stock,
			KITCHEN.recipe,
			KITCHEN.list,
			KITCHEN.item,
			KITCHEN.item,
		])
		expect(kitchenUris(data, listId)).toHaveLength(ops.length)
	})

	it('reads back from the rows what it wrote, in the same order', () => {
		const engine = createEngine(memory())
		const written = kitchenRows(document, createIdGenerator())
		engine.applyBatch(written.ops)

		const read = kitchenFromRows({
			stock: engine.queryEntities<StockPayload>({ type: KITCHEN.stock }),
			recipes: engine.queryEntities<RecipePayload>({ type: KITCHEN.recipe }),
			lists: engine.queryEntities<GroceryListPayload>({ type: KITCHEN.list }),
			items: engine.queryEntities<GroceryItemPayload>({ type: KITCHEN.item }),
		})
		expect(read).toEqual({ data: written.data, listId: written.listId })
		// an item's row names its list; the item the store holds does not
		expect(read.data.grocery.items.every((item) => !('listId' in item))).toBe(true)
	})

	it('writes no list for a document that never had one', () => {
		const written = kitchenRows(
			{ stock: document.stock, recipes: [], grocery: { name: '', store: '', items: [] } },
			createIdGenerator()
		)
		expect(written.listId).toBeUndefined()
		expect(written.ops).toHaveLength(2)
		expect(kitchenFromRows({ stock: [], recipes: [], lists: [], items: [] })).toEqual({
			listId: undefined,
			data: { stock: [], recipes: [], grocery: { name: '', store: '', items: [] } },
		})
	})

	it('takes a document with parts missing', () => {
		expect(kitchenRows({}, createIdGenerator())).toEqual({
			data: { stock: [], recipes: [], grocery: { name: '', store: '', items: [] } },
			listId: undefined,
			ops: [],
		})
	})

	it('leaves alone the items of another list', () => {
		const engine = createEngine(memory())
		const first = kitchenRows(document, createIdGenerator())
		engine.applyBatch(first.ops)
		const stray = engine.createEntity<GroceryItemPayload>({
			type: KITCHEN.item,
			payload: { listId: '01J9ZQ4M3T8R5V2X7Y6W1B0CDE', name: 'Stray', qty: '', origin: 'manual', done: false },
		})
		const read = kitchenFromRows({
			stock: [],
			recipes: [],
			lists: engine.queryEntities<GroceryListPayload>({ type: KITCHEN.list }),
			items: engine.queryEntities<GroceryItemPayload>({ type: KITCHEN.item }),
		})
		expect(read.data.grocery.items.map((item) => item.id)).not.toContain(stray.id)
		expect(read.data.grocery.items).toHaveLength(2)
	})
})
