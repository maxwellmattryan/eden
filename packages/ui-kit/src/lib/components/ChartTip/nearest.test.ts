import { describe, expect, it } from 'vitest'
import { nearestIndex } from './nearest.js'

describe('nearestIndex', () => {
	it('finds the place nearest the pointer, the first of two equally near', () => {
		const places = [10, 30, 50]
		expect(nearestIndex(places, 0)).toBe(0)
		expect(nearestIndex(places, 19)).toBe(0)
		expect(nearestIndex(places, 20)).toBe(0)
		expect(nearestIndex(places, 21)).toBe(1)
		expect(nearestIndex(places, 44)).toBe(2)
		expect(nearestIndex(places, 900)).toBe(2)
	})

	it('answers -1 when there is nothing to read', () => {
		expect(nearestIndex([], 12)).toBe(-1)
	})
})
