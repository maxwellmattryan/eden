import { describe, expect, it } from 'vitest'
import { accentSparks, emberShare } from './hearth-embers.js'

describe('emberShare', () => {
	it('glows over an empty larder, burns fuller with the stock and levels off', () => {
		expect(emberShare(0)).toBeCloseTo(0.2)
		expect(emberShare(30)).toBeGreaterThan(emberShare(10))
		expect(emberShare(60)).toBeCloseTo(1)
		expect(emberShare(400)).toBe(emberShare(60))
	})
})

describe('accentSparks', () => {
	it('takes the share of the stock that is expiring', () => {
		expect(accentSparks(100, 20, 5)).toBe(25)
		expect(accentSparks(100, 20, 0)).toBe(0)
	})
	it('shows one at least while anything is expiring, and never more than there are sparks', () => {
		expect(accentSparks(40, 500, 1)).toBe(1)
		expect(accentSparks(40, 3, 9)).toBe(40)
		expect(accentSparks(0, 3, 1)).toBe(0)
	})
})
