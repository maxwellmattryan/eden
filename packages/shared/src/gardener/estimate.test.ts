import { describe, expect, it } from 'vitest'
import {
	cacheWritePrice,
	estimateBefore,
	estimateCost,
	formatCost,
	formatUsd,
	SEARCH_RESULT_TOKENS,
} from './estimate.js'

const sonnet = { input: 2, output: 10, cacheRead: 0.2 }

describe('estimates', () => {
	it('prices a usage from the row, the cached input at the cache price', () => {
		expect(estimateCost({ tokensIn: 1_000_000, tokensOut: 0, cacheRead: 0 }, sonnet)).toBe(2)
		expect(estimateCost({ tokensIn: 0, tokensOut: 1_000_000, cacheRead: 0 }, sonnet)).toBe(10)
		expect(estimateCost({ tokensIn: 0, tokensOut: 0, cacheRead: 1_000_000 }, sonnet)).toBe(0.2)
		expect(estimateCost({ tokensIn: 12_000, tokensOut: 800, cacheRead: 30_000 }, sonnet)).toBeCloseTo(0.038, 6)
	})

	it('prices what was written to the cache at its own rate, a quarter over the input where the row has none', () => {
		expect(cacheWritePrice(sonnet)).toBe(2.5)
		expect(cacheWritePrice({ ...sonnet, cacheWrite: 4 })).toBe(4)
		expect(estimateCost({ tokensIn: 0, tokensOut: 0, cacheRead: 0, cacheWrite: 1_000_000 }, sonnet)).toBe(2.5)
		expect(
			estimateCost({ tokensIn: 0, tokensOut: 0, cacheRead: 0, cacheWrite: 1_000_000 }, { ...sonnet, cacheWrite: 4 })
		).toBe(4)
		// a usage that names no cache write wrote none
		expect(estimateCost({ tokensIn: 1_000_000, tokensOut: 0, cacheRead: 0 }, sonnet)).toBe(2)
	})

	it('estimates the most a request may cost before it is sent', () => {
		expect(estimateBefore(12_000, 4_000, sonnet)).toBeCloseTo(0.064, 6)
		expect(estimateBefore(0, 0, sonnet)).toBe(0)
	})

	it('charges each web search its fee, on top of the tokens (D-132)', () => {
		const searching = { ...sonnet, search: 0.01 }
		// the fee is for the search, not per million
		expect(estimateCost({ tokensIn: 0, tokensOut: 0, cacheRead: 0, searches: 3 }, searching)).toBeCloseTo(0.03, 9)
		expect(estimateCost({ tokensIn: 1_000_000, tokensOut: 0, cacheRead: 0, searches: 2 }, searching)).toBeCloseTo(
			2.02,
			9
		)
		// a row from before searches were priced costs one at nothing, and a usage that names none ran none
		expect(estimateCost({ tokensIn: 0, tokensOut: 0, cacheRead: 0, searches: 3 }, sonnet)).toBe(0)
		expect(estimateCost({ tokensIn: 0, tokensOut: 0, cacheRead: 0 }, searching)).toBe(0)
	})

	it('estimates a searching request at every search it may make and what their results add to the input', () => {
		const searching = { ...sonnet, search: 0.01 }
		const plain = estimateBefore(2_000, 1_000, searching)
		const withFive = estimateBefore(2_000, 1_000, searching, 5)
		const results = (5 * SEARCH_RESULT_TOKENS * searching.input) / 1_000_000
		expect(withFive).toBeCloseTo(plain + 5 * 0.01 + results, 9)
		expect(estimateBefore(2_000, 1_000, searching, 0)).toBe(plain)
	})

	it('formats USD to two decimals and small amounts in cents', () => {
		expect(formatUsd(2.84)).toBe('2.84')
		expect(formatUsd(2.845)).toBe('2.85')
		expect(formatUsd(0)).toBe('0.00')
		expect(formatCost(0.011)).toBe('1.1 ¢')
		expect(formatCost(0.0004)).toBe('0.0 ¢')
		expect(formatCost(0.42)).toBe('42 ¢')
		expect(formatCost(2.84)).toBe('$2.84')
		expect(formatCost(1)).toBe('$1.00')
	})
})
