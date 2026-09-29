import { describe, expect, it } from 'vitest'
import { isResourceId, parseUri, toUri } from './uri.js'

describe('uri', () => {
	it('formats and parses an entity URI', () => {
		const uri = toUri('stock-item', '01J9ZQ4M3T8R5V2X7Y6W1B0CDE')
		expect(uri).toBe('eden://stock-item/01J9ZQ4M3T8R5V2X7Y6W1B0CDE')
		expect(parseUri(uri)).toEqual({ type: 'stock-item', id: '01J9ZQ4M3T8R5V2X7Y6W1B0CDE' })
	})

	it('refuses what is not one', () => {
		for (const bad of [
			'stock-item/01J9ZQ4M3T8R5V2X7Y6W1B0CDE',
			'http://stock-item/01J9ZQ4M3T8R5V2X7Y6W1B0CDE',
			'eden://Stock/01J9ZQ4M3T8R5V2X7Y6W1B0CDE',
			'eden://stock-item/st-01',
			'eden://stock-item',
			'eden://stock-item/01J9ZQ4M3T8R5V2X7Y6W1B0CDE/more',
		]) {
			expect(parseUri(bad), bad).toBeNull()
		}
	})

	it('takes kebab-case resource ids without a dot', () => {
		for (const good of ['recipe', 'stock-item', 'air-quality', 'v2-thing']) expect(isResourceId(good), good).toBe(true)
		for (const bad of ['', 'Recipe', 'kitchen.recipe', 'stock_item', '-recipe', 'recipe-', 'a--b', '2fa']) {
			expect(isResourceId(bad), bad).toBe(false)
		}
	})
})
