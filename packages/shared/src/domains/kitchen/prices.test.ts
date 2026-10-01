import { describe, expect, it } from 'vitest'
import { listEstimate, missingEstimate, priceFor, priceNear } from './prices.js'
import type { GroceryStore } from './types.js'

const heb: GroceryStore = {
	id: 'heb',
	name: 'H-E-B',
	sells: ['grocery'],
	bought: {
		butter: { at: '2026-09-20T10:00:00.000Z', price: 4.99, size: '8 oz', brand: 'Kerrygold' },
		lime: { at: '2026-09-27T10:00:00.000Z', price: 0.33 },
		'baby spinach': { at: '2026-09-27T10:00:00.000Z', price: 2.5 },
		'rice vinegar': { at: '2026-09-27T10:00:00.000Z', price: 3.1 },
		egg: { at: '2026-09-27T10:00:00.000Z' },
	},
}
const target: GroceryStore = {
	id: 'target',
	name: 'Target',
	sells: ['grocery', 'home-goods'],
	bought: {
		// listed again on the 30th; the price is from the 25th
		butter: { at: '2026-09-30T10:00:00.000Z', price: 5.29, pricedAt: '2026-09-25T10:00:00.000Z' },
		'paper towel': { at: '2026-09-25T10:00:00.000Z', price: 8 },
	},
}
const stores = [heb, target]
const line = (name: string, qty = '', price?: number) => ({ name, qty, ...(price === undefined ? {} : { price }) })

describe('what things cost in Hearth', () => {
	it('prices a thing at its store, else at the newest price anywhere', () => {
		expect(priceFor('Butter', stores, 'heb')).toMatchObject({ price: 4.99, size: '8 oz', brand: 'Kerrygold' })
		expect(priceFor('Butter', stores, 'target')?.price).toBe(5.29)
		// no store asked: the newest price, by when it was learned and not when the thing was last listed
		expect(priceFor('butter', stores)).toMatchObject({ price: 5.29, at: '2026-09-25T10:00:00.000Z', storeId: 'target' })
		expect(priceFor('Paper towels', stores, 'heb')?.storeId).toBe('target')
	})

	it('has no price for what no store priced', () => {
		expect(priceFor('Eggs', stores, 'heb')).toBeUndefined()
		expect(priceFor('Saffron', stores)).toBeUndefined()
		expect(priceFor('', stores)).toBeUndefined()
		const old = { ...heb, bought: { lime: '2026-09-27T10:00:00.000Z' } } as unknown as GroceryStore
		expect(priceFor('limes', [old])).toBeUndefined()
	})

	it('prices an ingredient by the name it goes by in the shop', () => {
		expect(priceNear('spinach', stores)?.price).toBe(2.5)
		expect(priceNear('limes', stores)?.price).toBe(0.33)
		expect(priceNear('rice', stores)).toBeUndefined()
	})

	it('sums a list, counting what has no price apart', () => {
		const items = [line('Butter'), line('Limes', '6'), line('Eggs', '12'), line('Baby spinach', '200 g')]
		expect(listEstimate(items, stores, 'heb')).toEqual({ total: 9.47, priced: 3, unpriced: 1 })
		// a price the owner typed on the line stands in for the store's
		expect(listEstimate([line('Butter', '2', 6), line('Eggs', '', 3.5)], stores, 'heb')).toEqual({
			total: 15.5,
			priced: 2,
			unpriced: 0,
		})
		expect(listEstimate([], stores)).toEqual({ total: 0, priced: 0, unpriced: 0 })
	})

	it('sums what a recipe is missing, one package of each', () => {
		expect(missingEstimate(['butter', 'spinach', 'saffron'], stores)).toEqual({ total: 7.79, priced: 2, unpriced: 1 })
	})
})
