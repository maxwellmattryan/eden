import { describe, expect, it } from 'vitest'
import { cookPlan, cookTonight, cookedQty, ingredientStatus } from './cook.js'
import type { Recipe, StockItem, StockLocation } from './types.js'

const TODAY = '2026-09-30'
const item = (
	id: string,
	name: string,
	qty: string,
	unit?: string,
	expiry?: string,
	location: StockLocation = 'fridge'
): StockItem => ({
	id,
	name,
	qty,
	unit,
	location,
	expiry,
	source: 'manual',
	sourcedAt: '2026-09-28T10:00:00.000Z',
})
const stock = [
	item('salmon', 'Salmon fillets', '2', undefined, '2026-11-20', 'freezer'),
	item('spinach', 'Spinach', '200', 'g', '2026-10-01'),
	item('miso', 'Miso paste', '400', 'g', '2026-12-15'),
	item('garlic', 'Garlic', '1', 'head', undefined, 'counter'),
	item('tofu', 'Tofu', '400', 'g', '2026-10-03'),
]
const salmon: Recipe = {
	id: 'r-1',
	name: 'Miso-glazed salmon with spinach',
	serves: 2,
	minutes: 25,
	tags: ['weeknight'],
	ingredients: [
		{ name: 'salmon fillets', qty: '2' },
		{ name: 'spinach', qty: '150', unit: 'g' },
		{ name: 'miso paste', qty: '0.1', unit: 'kg' },
		{ name: 'garlic', qty: '2', unit: 'cloves' },
		{ name: 'mirin', qty: '1', unit: 'tbsp' },
		{ name: 'salt', qty: '', note: 'to taste' },
	],
	steps: ['Glaze.', 'Roast.'],
}
const soba: Recipe = {
	id: 'r-2',
	name: 'Soba with tofu',
	serves: 2,
	minutes: 15,
	tags: [],
	ingredients: [
		{ name: 'soba', qty: '200', unit: 'g' },
		{ name: 'tofu', qty: '500', unit: 'g' },
	],
	steps: ['Boil.'],
}
const satay: Recipe = {
	id: 'r-3',
	name: 'Tofu satay',
	serves: 2,
	minutes: 10,
	tags: [],
	ingredients: [
		{ name: 'tofu', qty: '200', unit: 'g' },
		{ name: 'peanut butter', qty: '2', unit: 'tbsp' },
	],
	steps: ['Stir.'],
}

describe('recipes against the stock', () => {
	it('marks each ingredient in stock or missing, and whether there is enough', () => {
		expect(ingredientStatus(salmon, stock).map(({ state, stockId, enough }) => ({ state, stockId, enough }))).toEqual([
			{ state: 'in-stock', stockId: 'salmon', enough: true },
			{ state: 'in-stock', stockId: 'spinach', enough: true },
			{ state: 'in-stock', stockId: 'miso', enough: true },
			{ state: 'in-stock', stockId: 'garlic', enough: undefined },
			{ state: 'missing', stockId: undefined, enough: undefined },
			{ state: 'missing', stockId: undefined, enough: undefined },
		])
		expect(ingredientStatus(soba, stock)[1]).toMatchObject({ state: 'in-stock', enough: false })
	})

	it('plans what cooking takes: subtract where the units agree, ask where they do not, skip the rest', () => {
		expect(
			cookPlan(salmon, stock).map(({ state, stockId, held, after, empty }) => ({ state, stockId, held, after, empty }))
		).toEqual([
			{ state: 'subtract', stockId: 'salmon', held: '2', after: '0', empty: true },
			{ state: 'subtract', stockId: 'spinach', held: '200 g', after: '50 g', empty: false },
			{ state: 'subtract', stockId: 'miso', held: '400 g', after: '300 g', empty: false },
			{ state: 'ask', stockId: 'garlic', held: '1 head', after: undefined, empty: undefined },
			{ state: 'skip', stockId: undefined, held: undefined, after: undefined, empty: undefined },
			{ state: 'skip', stockId: undefined, held: undefined, after: undefined, empty: undefined },
		])
	})

	it('never takes an item below zero, and takes a second ingredient from what the first left', () => {
		expect(cookPlan(soba, stock)[1]).toMatchObject({ state: 'subtract', after: '0 g', afterQty: '0', empty: true })
		const twice = cookPlan(
			{
				ingredients: [
					{ name: 'tofu', qty: '150', unit: 'g' },
					{ name: 'tofu', qty: '100', unit: 'g' },
				],
			},
			stock
		)
		expect(twice.map((line) => [line.held, line.after])).toEqual([
			['400 g', '250 g'],
			['250 g', '150 g'],
		])
		expect(cookedQty({ qty: '400', unit: 'g' }, { name: 'tofu', qty: '0.5', unit: 'lb' })).toBe('173.2')
		expect(cookedQty({ qty: '1', unit: 'head' }, { name: 'garlic', qty: '2', unit: 'cloves' })).toBeNull()
	})

	it('puts first tonight what uses up the expiring stock, then what misses least', () => {
		const picks = cookTonight([soba, satay, salmon], stock, [], TODAY)
		expect(picks.map((pick) => [pick.recipe.id, pick.uses, pick.missing])).toEqual([
			['r-1', ['Spinach'], 2],
			['r-3', [], 1],
			['r-2', [], 1],
		])
	})

	it('leaves out a recipe that names a forbidden word, and all of them when the words could not be read', () => {
		expect(cookTonight([soba, satay, salmon], stock, ['peanut'], TODAY).map((pick) => pick.recipe.id)).toEqual([
			'r-1',
			'r-2',
		])
		expect(cookTonight([soba, satay, salmon], stock, null, TODAY)).toEqual([])
	})
})
