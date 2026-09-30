import { describe, expect, it } from 'vitest'
import { estimateBefore, estimateCost, formatCost, formatUsd } from './estimate.js'

const sonnet = { input: 2, output: 10, cacheRead: 0.2 }

describe('estimates', () => {
	it('prices a usage from the row, the cached input at the cache price', () => {
		expect(estimateCost({ tokensIn: 1_000_000, tokensOut: 0, cacheRead: 0 }, sonnet)).toBe(2)
		expect(estimateCost({ tokensIn: 0, tokensOut: 1_000_000, cacheRead: 0 }, sonnet)).toBe(10)
		expect(estimateCost({ tokensIn: 0, tokensOut: 0, cacheRead: 1_000_000 }, sonnet)).toBe(0.2)
		expect(estimateCost({ tokensIn: 12_000, tokensOut: 800, cacheRead: 30_000 }, sonnet)).toBeCloseTo(0.038, 6)
	})

	it('estimates the most a request may cost before it is sent', () => {
		expect(estimateBefore(12_000, 4_000, sonnet)).toBeCloseTo(0.064, 6)
		expect(estimateBefore(0, 0, sonnet)).toBe(0)
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
