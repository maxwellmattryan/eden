import { describe, expect, it } from 'vitest'
import { browseRecipes, filtering, matchesSearch, NO_FILTERS, recipeTags, searchTerms } from './browse.js'
import { cookTonight } from './cook.js'
import type { Recipe, StockItem } from './types.js'

const recipe = (id: string, name: string, minutes: number, tags: string[], names: string[]): Recipe => ({
	id,
	name,
	serves: 2,
	minutes,
	tags,
	ingredients: names.map((ingredient) => ({ name: ingredient, qty: '1' })),
	steps: [],
})
const item = (id: string, name: string, expiry?: string): StockItem => ({
	id,
	name,
	qty: '1',
	location: 'fridge',
	source: 'manual',
	sourcedAt: '2026-09-30T08:00:00Z',
	...(expiry ? { expiry } : {}),
})

const recipes = [
	recipe('r1', 'Miso-glazed salmon', 25, ['weeknight', 'low-sodium'], ['salmon fillets', 'spinach', 'miso']),
	recipe('r2', 'Black bean tacos', 20, ['weeknight'], ['black beans', 'tortillas']),
	recipe('r3', 'Slow tomato ragù', 180, [], ['tomatoes', 'onion']),
	recipe('r4', 'Toast', 0, [], ['bread']),
]
const stock = [
	item('s1', 'Salmon'),
	item('s2', 'Baby spinach', '2026-10-01'),
	item('s3', 'Miso'),
	item('s4', 'Black beans'),
	item('s5', 'Bread'),
]
const tonight = cookTonight(recipes, stock, [], '2026-09-30')
const ids = (found: Recipe[]) => found.map((entry) => entry.id)

describe('searchTerms and matchesSearch', () => {
	it('reads commas as phrases and spaces as words', () => {
		expect(searchTerms('black beans, Tortillas')).toEqual(['black bean', 'tortilla'])
		expect(searchTerms('salmon spinach')).toEqual(['salmon', 'spinach'])
	})

	it('finds a recipe by its name, a tag or an ingredient, from the start of a word', () => {
		expect(matchesSearch(recipes[0]!, searchTerms('spinach, miso'))).toBe(true)
		expect(matchesSearch(recipes[0]!, searchTerms('low-sodium'))).toBe(true)
		expect(matchesSearch(recipes[2]!, searchTerms('ragu'))).toBe(true)
		expect(matchesSearch(recipes[2]!, searchTerms('tom'))).toBe(true)
		expect(matchesSearch(recipes[2]!, searchTerms('mato'))).toBe(false)
		expect(matchesSearch(recipes[1]!, searchTerms('spinach'))).toBe(false)
	})
})

describe('browseRecipes', () => {
	it('keeps tonight’s order when nothing is asked', () => {
		expect(filtering(NO_FILTERS)).toBe(false)
		expect(ids(browseRecipes(recipes, stock, tonight, NO_FILTERS))[0]).toBe('r1')
		expect(browseRecipes(recipes, stock, tonight, NO_FILTERS)).toHaveLength(4)
	})

	it('filters by what is in stock, by time, by what expires and by tag', () => {
		expect(ids(browseRecipes(recipes, stock, tonight, { ...NO_FILTERS, inStock: true }))).toEqual(['r1', 'r4'])
		expect(ids(browseRecipes(recipes, stock, tonight, { ...NO_FILTERS, maxMinutes: 30 }, 'name'))).toEqual(['r2', 'r1'])
		expect(ids(browseRecipes(recipes, stock, tonight, { ...NO_FILTERS, expiring: true }))).toEqual(['r1'])
		expect(ids(browseRecipes(recipes, stock, tonight, { ...NO_FILTERS, tags: ['weeknight', 'low-sodium'] }))).toEqual([
			'r1',
		])
	})

	it('sorts by name, by time with the untimed last, and by what is missing', () => {
		expect(ids(browseRecipes(recipes, stock, tonight, NO_FILTERS, 'name'))).toEqual(['r2', 'r1', 'r3', 'r4'])
		expect(ids(browseRecipes(recipes, stock, tonight, NO_FILTERS, 'quickest'))).toEqual(['r2', 'r1', 'r3', 'r4'])
		expect(ids(browseRecipes(recipes, stock, tonight, NO_FILTERS, 'missing')).slice(0, 2)).toEqual(['r1', 'r4'])
	})
})

describe('recipeTags', () => {
	it('lists each tag once, the most used first', () => {
		expect(recipeTags(recipes)).toEqual(['weeknight', 'low-sodium'])
	})
})
