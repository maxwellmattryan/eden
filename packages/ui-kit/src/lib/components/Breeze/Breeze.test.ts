import { describe, expect, it } from 'vitest'
import { parseMs, specksFor } from './Breeze.svelte'

describe('parseMs', () => {
	it('reads milliseconds and seconds', () => {
		expect(parseMs('700ms')).toBe(700)
		expect(parseMs(' 700ms')).toBe(700)
		expect(parseMs('.7s')).toBe(700)
		expect(parseMs('0ms')).toBe(0)
		expect(parseMs('0s')).toBe(0)
	})
	it('treats a missing or unreadable value as 0, so nothing plays', () => {
		expect(parseMs('')).toBe(0)
		expect(parseMs('none')).toBe(0)
	})
})

describe('specksFor', () => {
	it('is deterministic and stays inside the square', () => {
		const a = specksFor(5, 28)
		expect(a).toEqual(specksFor(5, 28))
		expect(a).toHaveLength(5)
		for (const s of a) {
			expect(s.x).toBeGreaterThanOrEqual(0)
			expect(s.x).toBeLessThanOrEqual(28)
		}
		expect(a.at(-1)?.delay).toBe(180)
	})
	it('copes with a tiny square and a zero count', () => {
		expect(specksFor(0, 28)).toEqual([])
		expect(specksFor(3, 8).every((s) => Number.isFinite(s.x))).toBe(true)
	})
})
