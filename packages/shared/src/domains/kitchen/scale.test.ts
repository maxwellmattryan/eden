import { describe, expect, it } from 'vitest'
import { scalable, scaledIngredients, scaleQty } from './scale.js'

describe('scaleQty', () => {
	it('says spoons, cups and counts in kitchen fractions', () => {
		expect(scaleQty('1', 'cup', 0.5)).toBe('1/2')
		expect(scaleQty('1 1/2', 'cups', 2)).toBe('3')
		expect(scaleQty('3', '', 0.5)).toBe('1 1/2')
		expect(scaleQty('1', 'tbsp', 1 / 3)).toBe('1/3')
		expect(scaleQty('½', 'tsp', 3)).toBe('1 1/2')
	})

	it('says grams and millilitres in round numbers', () => {
		expect(scaleQty('250', 'g', 1.5)).toBe('375')
		expect(scaleQty('125', 'ml', 1 / 3)).toBe('42')
		expect(scaleQty('5', 'g', 0.5)).toBe('2.5')
	})

	it('leaves what it cannot read as a single number', () => {
		expect(scaleQty('', undefined, 2)).toBe('')
		expect(scaleQty('a pinch', undefined, 2)).toBe('a pinch')
		expect(scaleQty('2-3', 'cloves', 2)).toBe('2-3')
		expect(scaleQty('2', 'cups', 1)).toBe('2')
	})
})

describe('scaledIngredients', () => {
	const recipe = {
		serves: 4,
		ingredients: [
			{ name: 'flour', qty: '500', unit: 'g' },
			{ name: 'eggs', qty: '2' },
			{ name: 'salt', qty: '', note: 'to taste' },
		],
	}

	it('multiplies each amount by the servings asked for over the servings written', () => {
		expect(scaledIngredients(recipe, 2).map((line) => line.qty)).toEqual(['250', '1', ''])
		expect(scaledIngredients(recipe, 6).map((line) => line.qty)).toEqual(['750', '3', ''])
	})

	it('hands back the recipe’s own lines at its own servings', () => {
		expect(scaledIngredients(recipe, 4)).toBe(recipe.ingredients)
	})

	it('leaves a recipe that does not scale as written', () => {
		const loaf = { ...recipe, scales: false }
		expect(scalable(loaf)).toBe(false)
		expect(scaledIngredients(loaf, 8)).toBe(loaf.ingredients)
	})
})
