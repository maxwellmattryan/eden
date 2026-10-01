import { describe, expect, it } from 'vitest'
import { kitchenExtras } from './formats.js'
import type { KitchenData } from './types.js'

const data: KitchenData = {
	stock: [
		{
			id: '1',
			name: 'Chicken thighs, skin on',
			qty: '600',
			unit: 'g',
			location: 'fridge',
			expiry: '2026-10-01',
			estimated: true,
			category: 'Meat',
			source: 'capture',
			sourcedAt: '2026-09-28T18:40:00',
		},
		{
			id: '2',
			name: 'Rice',
			qty: '2',
			location: 'pantry',
			threshold: 2,
			source: 'manual',
			sourcedAt: '2026-09-29T15:02:11.000Z',
		},
	],
	recipes: [
		{
			id: '3',
			name: 'Dal',
			serves: 2,
			minutes: 35,
			tags: ['quick', 'one pot'],
			ingredients: [
				{ name: 'red lentils', qty: '200', unit: 'g', note: 'rinsed' },
				{ name: 'salt', qty: '' },
			],
			steps: ['Simmer the lentils.', 'Season.'],
			sourceUrl: 'https://example.com/dal',
			tip: 'Better the next day.',
		},
		{ id: '4', name: 'Plain rice', serves: 4, minutes: 20, tags: [], ingredients: [], steps: [] },
	],
	grocery: {
		name: 'This week',
		store: 'H-E-B',
		items: [
			{ id: '5', name: 'Spinach', qty: '1 bag', origin: 'recipe', note: 'Dal', done: true },
			{ id: '6', name: 'Oat milk', qty: '2', store: 'Costco', origin: 'manual', done: false },
		],
	},
}

describe('kitchenExtras', () => {
	const files = Object.fromEntries(kitchenExtras(data).map((file) => [file.path, file.content]))

	it('writes the three files under friendly/', () => {
		expect(Object.keys(files)).toEqual(['friendly/stock.csv', 'friendly/grocery.csv', 'friendly/recipes.md'])
	})

	it('writes the stock as a table', () => {
		expect(files['friendly/stock.csv']).toBe(
			[
				'name,quantity,unit,location,expiry,expiry estimated,low stock,category,source,added',
				'"Chicken thighs, skin on",600,g,fridge,2026-10-01,true,,Meat,capture,2026-09-28T18:40:00',
				'Rice,2,,pantry,,,true,,manual,2026-09-29T15:02:11.000Z',
				'',
			].join('\r\n')
		)
	})

	it('writes the grocery list with the store each item is bought at', () => {
		expect(files['friendly/grocery.csv']).toBe(
			[
				'list,item,quantity,store,origin,note,done',
				'This week,Spinach,1 bag,H-E-B,recipe,Dal,true',
				'This week,Oat milk,2,Costco,manual,,false',
				'',
			].join('\r\n')
		)
	})

	it('writes the recipes as headings', () => {
		expect(files['friendly/recipes.md']).toBe(
			[
				'# Recipes',
				'',
				'## Dal',
				'',
				'- Serves 2',
				'- 35 minutes',
				'- Tags: quick, one pot',
				'- Source: https://example.com/dal',
				'',
				'### Ingredients',
				'',
				'- 200 g red lentils, rinsed',
				'- salt',
				'',
				'### Steps',
				'',
				'1. Simmer the lentils.',
				'2. Season.',
				'',
				'Tip: Better the next day.',
				'',
				'## Plain rice',
				'',
				'- Serves 4',
				'- 20 minutes',
				'',
			].join('\n')
		)
	})

	it('writes the headers alone for a domain with nothing in it', () => {
		const empty = kitchenExtras({ stock: [], recipes: [], grocery: { name: '', store: '', items: [] } })
		expect(empty.map((file) => file.content.split('\n').length)).toEqual([2, 2, 2])
	})
})
