import { describe, expect, it } from 'vitest'
import { moonAt, nextPhase } from './ephemeris.js'

const DAY_MS = 24 * 60 * 60 * 1000

describe('nextPhase', () => {
	it('finds the full moons the almanac lists, within a day', () => {
		// 2026-10-26 04:12 UTC and 2025-01-13 22:27 UTC
		const october = nextPhase('full', Date.UTC(2026, 8, 30))
		expect(Math.abs(october - Date.UTC(2026, 9, 26, 4, 12))).toBeLessThan(DAY_MS)
		const january = nextPhase('full', Date.UTC(2025, 0, 1))
		expect(Math.abs(january - Date.UTC(2025, 0, 13, 22, 27))).toBeLessThan(DAY_MS)
	})

	it('finds a new moon the almanac lists, within a day', () => {
		// 2026-10-10 15:50 UTC
		const found = nextPhase('new', Date.UTC(2026, 8, 30))
		expect(Math.abs(found - Date.UTC(2026, 9, 10, 15, 50))).toBeLessThan(DAY_MS)
	})

	it('is always after the instant asked from, and within one cycle', () => {
		const from = Date.UTC(2026, 8, 30, 9)
		for (const phase of ['new', 'first-quarter', 'full', 'last-quarter'] as const) {
			const found = nextPhase(phase, from)
			expect(found).toBeGreaterThan(from)
			expect(found - from).toBeLessThanOrEqual(29.6 * DAY_MS)
			expect(nextPhase(phase, found)).toBeGreaterThan(found)
		}
	})

	it('lands where moonAt reads the phase', () => {
		const from = Date.UTC(2026, 8, 30)
		expect(moonAt(nextPhase('full', from)).cycle).toBeCloseTo(0.5, 2)
		expect(moonAt(nextPhase('full', from)).phase).toBe('full')
		expect(moonAt(nextPhase('first-quarter', from)).cycle).toBeCloseTo(0.25, 2)
		expect(moonAt(nextPhase('last-quarter', from)).cycle).toBeCloseTo(0.75, 2)
		expect(moonAt(nextPhase('new', from)).illumination).toBe(0)
	})
})
