import { describe, expect, it } from 'vitest'
import { formatIngredient, parseGrocery, parseIngredient, parseStock } from './parse.js'

describe("Hearth's line parsers", () => {
	it('reads a stock line into a name, an amount and a place', () => {
		expect(parseStock('2 lb chicken thighs fridge')).toEqual({
			name: 'chicken thighs',
			qty: '2',
			unit: 'lb',
			location: 'fridge',
		})
		expect(parseStock('LMNT citrus 9 packets')).toEqual({
			name: 'LMNT citrus',
			qty: '9',
			unit: 'packets',
			location: undefined,
		})
		expect(parseStock('eggs 12')).toEqual({ name: 'eggs', qty: '12', unit: undefined, location: undefined })
		expect(parseStock('milk')).toEqual({ name: 'milk', qty: '1', unit: undefined, location: undefined })
	})

	it('does not take the start of a word for a unit', () => {
		expect(parseStock('2 lemons')).toMatchObject({ name: 'lemons', qty: '2', unit: undefined })
		expect(parseStock('3 garlic heads counter')).toMatchObject({ name: 'garlic heads', qty: '3', location: 'counter' })
		expect(parseStock('1 l milk')).toMatchObject({ name: 'milk', qty: '1', unit: 'l' })
	})

	it('reads a grocery line', () => {
		expect(parseGrocery('4 limes')).toEqual({ name: 'limes', qty: '4' })
		expect(parseGrocery('500 g spinach')).toEqual({ name: 'spinach', qty: '500 g' })
		expect(parseGrocery('paper towels')).toEqual({ name: 'paper towels', qty: '' })
		expect(parseGrocery('7up 6 cans')).toMatchObject({ qty: '7' })
	})

	it('reads an ingredient as a page prints it', () => {
		expect(parseIngredient('1 1/2 cups short-grain rice, rinsed')).toEqual({
			name: 'short-grain rice',
			qty: '1 1/2',
			unit: 'cups',
			note: 'rinsed',
		})
		expect(parseIngredient('2 tbsp of soy sauce')).toEqual({ name: 'soy sauce', qty: '2', unit: 'tbsp' })
		expect(parseIngredient('- 3 cloves garlic, minced')).toEqual({
			name: 'garlic',
			qty: '3',
			unit: 'cloves',
			note: 'minced',
		})
		expect(parseIngredient('Salt, to taste')).toEqual({ name: 'Salt', qty: '', note: 'to taste' })
		expect(parseIngredient('2 eggs')).toEqual({ name: 'eggs', qty: '2' })
	})

	it('prints an ingredient back as it reads it', () => {
		for (const line of ['1 1/2 cups short-grain rice, rinsed', '2 tbsp soy sauce', 'Salt, to taste', '2 eggs']) {
			expect(formatIngredient(parseIngredient(line))).toBe(line)
		}
	})
})
