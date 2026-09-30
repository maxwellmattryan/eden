import { describe, expect, it } from 'vitest'
import { snoozeTargets } from './snooze.js'

const CHICAGO = 'America/Chicago'
const at = (iso: string) => Date.parse(iso)

describe('snoozeTargets', () => {
	it('offers later today as the next full hour plus two, and tomorrow and next week as days', () => {
		// Wednesday 2026-09-30 at 11:50 in Chicago
		expect(snoozeTargets('2026-09-30', at('2026-09-30T16:50:00Z'), CHICAGO, 'monday')).toEqual({
			later: '2026-09-30T19:00:00.000Z',
			tomorrow: '2026-10-01',
			nextWeek: '2026-10-05',
		})
	})

	it('offers later today from the top of the hour too', () => {
		expect(snoozeTargets('2026-09-30', at('2026-09-30T16:00:00Z'), CHICAGO, 'monday').later).toBe(
			'2026-09-30T19:00:00.000Z'
		)
	})

	it('keeps the time of day of a timed due on the new day', () => {
		const targets = snoozeTargets('2026-09-28T20:00:00.000Z', at('2026-09-30T16:50:00Z'), CHICAGO, 'monday')
		expect(targets.tomorrow).toBe('2026-10-01T20:00:00.000Z')
		expect(targets.nextWeek).toBe('2026-10-05T20:00:00.000Z')
	})

	it('has no later today once that would cross midnight', () => {
		const targets = snoozeTargets('2026-09-30', at('2026-10-01T02:10:00Z'), CHICAGO, 'monday')
		expect(targets.later).toBeUndefined()
		expect(targets.tomorrow).toBe('2026-10-01')
		// 20:59 still has one: 23:00
		expect(snoozeTargets('2026-09-30', at('2026-10-01T01:59:00Z'), CHICAGO, 'monday').later).toBe(
			'2026-10-01T04:00:00.000Z'
		)
	})

	it('takes next week from the owner week start', () => {
		expect(snoozeTargets(null, at('2026-09-30T16:50:00Z'), CHICAGO, 'sunday').nextWeek).toBe('2026-10-04')
		// on a Sunday with a Monday start, next week is tomorrow
		expect(snoozeTargets(null, at('2026-10-04T16:50:00Z'), CHICAGO, 'monday').nextWeek).toBe('2026-10-05')
	})

	it('works out the day where the owner is', () => {
		// 02:50Z on the 30th is the 29th evening in Chicago and the 30th morning in Tokyo
		expect(snoozeTargets(null, at('2026-09-30T02:50:00Z'), CHICAGO, 'monday').tomorrow).toBe('2026-09-30')
		expect(snoozeTargets(null, at('2026-09-30T02:50:00Z'), 'Asia/Tokyo', 'monday').tomorrow).toBe('2026-10-01')
	})

	it('keeps a wall time across the day the clocks change', () => {
		// Saturday 2026-10-31 in Chicago; the clocks go back on the Sunday
		const targets = snoozeTargets('2026-10-30T20:00:00.000Z', at('2026-10-31T16:50:00Z'), CHICAGO, 'monday')
		expect(targets.tomorrow).toBe('2026-11-01T21:00:00.000Z')
		expect(targets.nextWeek).toBe('2026-11-02T21:00:00.000Z')
	})
})
