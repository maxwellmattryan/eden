import { describe, expect, it } from 'vitest'
import { streakSpeed, windVector } from './sky-field.js'

describe('windVector', () => {
	it('points where the wind blows to, north up', () => {
		const west = windVector(270)
		expect(west.x).toBeCloseTo(1)
		expect(west.y).toBeCloseTo(0)
		const north = windVector(0)
		expect(north.x).toBeCloseTo(0)
		expect(north.y).toBeCloseTo(1)
	})
})

describe('streakSpeed', () => {
	it('drifts in a calm, quickens with the wind and levels off in a gale', () => {
		expect(streakSpeed(0)).toBe(10)
		expect(streakSpeed(40)).toBeGreaterThan(streakSpeed(10))
		expect(streakSpeed(200)).toBe(streakSpeed(90))
	})
})
