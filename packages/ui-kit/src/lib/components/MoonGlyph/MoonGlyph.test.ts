import { describe, expect, it } from 'vitest'
import { litPath, litShare } from './moon.js'

describe('litShare', () => {
	it('is nothing at the new moon, half at the quarters and whole at the full', () => {
		expect(litShare(0)).toBeCloseTo(0)
		expect(litShare(0.25)).toBeCloseTo(0.5)
		expect(litShare(0.5)).toBeCloseTo(1)
		expect(litShare(0.75)).toBeCloseTo(0.5)
		expect(litShare(1)).toBeCloseTo(0)
	})
})

describe('litPath', () => {
	it('draws nothing at the new moon', () => {
		expect(litPath(0, 10, 12)).toBe('')
		expect(litPath(1, 10, 12)).toBe('')
	})

	it('lights the right side while waxing and the left while waning', () => {
		expect(litPath(0.1, 10, 12)).toMatch(/^M12,2 A10,10 0 0 1 12,22 /)
		expect(litPath(0.9, 10, 12)).toMatch(/^M12,2 A10,10 0 0 0 12,22 /)
	})

	it('closes a crescent towards the lit side and a gibbous moon away from it', () => {
		expect(litPath(0.1, 10, 12)).toMatch(/ 0 0 0 12,2 Z$/)
		expect(litPath(0.4, 10, 12)).toMatch(/ 0 0 1 12,2 Z$/)
		expect(litPath(0.9, 10, 12)).toMatch(/ 0 0 1 12,2 Z$/)
		expect(litPath(0.6, 10, 12)).toMatch(/ 0 0 0 12,2 Z$/)
	})

	it('is a straight terminator at the quarters and a whole disc at the full moon', () => {
		expect(litPath(0.25, 10, 12)).toContain('A0,10')
		expect(litPath(0.5, 10, 12)).toContain('A10,10 0 0 1 12,2')
	})

	it('wraps a cycle outside 0 to 1', () => {
		expect(litPath(1.4, 10, 12)).toBe(litPath(0.4, 10, 12))
		expect(litPath(-0.1, 10, 12)).toBe(litPath(0.9, 10, 12))
	})
})
