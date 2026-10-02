import { describe, expect, it } from 'vitest'
import { accentSeeds, seedShare } from './meadow-seeds.js'

describe('seedShare', () => {
	it('keeps a few seeds over a bare meadow, fills with the places saved and levels off', () => {
		expect(seedShare(0)).toBeCloseTo(0.15)
		expect(seedShare(40)).toBeGreaterThan(seedShare(8))
		expect(seedShare(80)).toBeCloseTo(1)
		expect(seedShare(900)).toBe(seedShare(80))
	})
})

describe('accentSeeds', () => {
	it('takes the share of the places that are favourites', () => {
		expect(accentSeeds(100, 20, 5)).toBe(25)
		expect(accentSeeds(100, 20, 0)).toBe(0)
	})
	it('shows one at least while any place is a favourite, and never more than there are seeds', () => {
		expect(accentSeeds(40, 500, 1)).toBe(1)
		expect(accentSeeds(40, 3, 9)).toBe(40)
		expect(accentSeeds(0, 3, 1)).toBe(0)
	})
})
