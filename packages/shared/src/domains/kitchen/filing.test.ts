import { describe, expect, it } from 'vitest'
import { fileRows, groceryBlocks, orderStores, remember, reorderStores, storeFor } from './filing.js'
import type { Grocery, GroceryStore, GroceryItem } from './types.js'

const heb: GroceryStore = {
	id: 'heb',
	name: 'H-E-B',
	sells: ['grocery'],
	bought: { milk: '2026-09-20T10:00:00.000Z', lime: '2026-09-27T10:00:00.000Z' },
}
const target: GroceryStore = {
	id: 'target',
	name: 'Target',
	sells: ['grocery', 'home-goods'],
	bought: { milk: '2026-09-25T10:00:00.000Z', 'paper towel': '2026-09-25T10:00:00.000Z' },
}
const item = (name: string, listId: string, done = false): GroceryItem => ({
	id: name,
	name,
	qty: '',
	listId,
	origin: 'manual',
	done,
})

describe('filing a grocery item', () => {
	it('files a name where it was last bought', () => {
		expect(storeFor('Limes', [heb, target])?.id).toBe('heb')
		expect(storeFor('paper towels', [heb, target])?.id).toBe('target')
		// Both remember milk; the later purchase wins, whatever the stores' order.
		expect(storeFor('Milk', [heb, target])?.id).toBe('target')
		expect(storeFor('Milk', [target, heb])?.id).toBe('target')
	})

	it('files nothing for a name no store remembers', () => {
		expect(storeFor('Coffee filters', [heb, target])).toBeUndefined()
		expect(storeFor('', [heb, target])).toBeUndefined()
		expect(storeFor('Limes', [])).toBeUndefined()
		expect(storeFor('Limes', [{ id: 'new', name: 'New', sells: [] }])).toBeUndefined()
	})

	it('remembers what was bought, under the normalised name, without touching the store it was given', () => {
		const at = '2026-10-01T09:00:00.000Z'
		const after = remember(heb, ['Whole Milk', 'Eggs'], at)
		expect(after.bought).toMatchObject({ milk: at, egg: at, lime: '2026-09-27T10:00:00.000Z' })
		expect(heb.bought).not.toHaveProperty('egg')
		expect(storeFor('eggs', [after, target])?.id).toBe('heb')
		expect(remember(heb, [], at)).toBe(heb)
		expect(remember(heb, ['  '], at)).toBe(heb)
	})

	it('groups a batch by store, in the order each store first appears', () => {
		const rows = [{ name: 'Limes' }, { name: 'Coffee filters' }, { name: 'Paper towels' }, { name: 'lime' }]
		expect(fileRows(rows, [heb, target])).toEqual([
			{ storeId: 'heb', rows: [{ name: 'Limes' }, { name: 'lime' }] },
			{ storeId: undefined, rows: [{ name: 'Coffee filters' }] },
			{ storeId: 'target', rows: [{ name: 'Paper towels' }] },
		])
		expect(fileRows([], [heb])).toEqual([])
	})
})

describe("the page's lists", () => {
	const grocery: Grocery = {
		stores: [heb, target],
		lists: [{ id: 'l-heb', storeId: 'heb', shopDay: '2026-10-03T10:00:00' }, { id: 'l-any' }],
		items: [item('Limes', 'l-heb'), item('Ginger', 'l-heb', true), item('Coffee filters', 'l-any')],
	}

	it('shows one list per store in the stores’ order, then what is unfiled', () => {
		const blocks = groceryBlocks(grocery)
		expect(blocks.map((block) => block.store?.name)).toEqual(['H-E-B', 'Target', undefined])
		expect(blocks[0]).toMatchObject({ list: { id: 'l-heb', shopDay: '2026-10-03T10:00:00' }, checked: 1, left: 1 })
		expect(blocks[0]!.items.map((entry) => entry.name)).toEqual(['Limes', 'Ginger'])
		// A store with no list row yet still has its place, holding nothing.
		expect(blocks[1]).toEqual({ store: target, items: [], checked: 0, left: 0 })
		expect(blocks[2]).toMatchObject({ list: { id: 'l-any' }, checked: 0 })
	})

	it('leaves the unfiled list out while it holds nothing', () => {
		const blocks = groceryBlocks({ ...grocery, items: grocery.items.slice(0, 2) })
		expect(blocks).toHaveLength(2)
		expect(groceryBlocks({ stores: [], lists: [], items: [] })).toEqual([])
	})

	it('counts an item whose list or store is gone as unfiled', () => {
		const blocks = groceryBlocks({
			stores: [heb],
			lists: [
				{ id: 'l-heb', storeId: 'heb' },
				{ id: 'l-gone', storeId: 'closed' },
			],
			items: [item('Limes', 'l-heb'), item('Soap', 'l-gone'), item('Tape', 'nowhere')],
		})
		expect(blocks).toHaveLength(2)
		expect(blocks[1]!.store).toBeUndefined()
		expect(blocks[1]!.items.map((entry) => entry.name)).toEqual(['Soap', 'Tape'])
	})
})

describe("the stores' order", () => {
	const costco: GroceryStore = { id: 'costco', name: 'Costco', sells: ['grocery'] }

	it('puts stores by position, and those without one after, as given', () => {
		const ordered = orderStores([costco, { ...heb, position: 1 }, target, { ...target, id: 'first', position: 0 }])
		expect(ordered.map((store) => store.id)).toEqual(['first', 'heb', 'costco', 'target'])
		expect(orderStores([])).toEqual([])
	})

	it('moves a store and numbers every store by where it sits', () => {
		const { stores, changed } = reorderStores([heb, target, costco], 'costco', -1)
		expect(stores.map((store) => [store.id, store.position])).toEqual([
			['heb', 0],
			['costco', 1],
			['target', 2],
		])
		expect(changed).toHaveLength(3)
		// Once numbered, a move writes only the two that swapped.
		const again = reorderStores(stores, 'heb', 1)
		expect(again.stores.map((store) => store.id)).toEqual(['costco', 'heb', 'target'])
		expect(again.changed.map((store) => store.id)).toEqual(['costco', 'heb'])
		expect(heb.position).toBeUndefined()
	})

	it('changes nothing at an end, or for a store that is not there', () => {
		expect(reorderStores([heb, target], 'heb', -1).changed).toEqual([])
		expect(reorderStores([heb, target], 'target', 1).changed).toEqual([])
		expect(reorderStores([heb, target], 'gone', 1)).toEqual({ stores: [heb, target], changed: [] })
	})
})
