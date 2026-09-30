import { describe, expect, it } from 'vitest'
import { addDays, dateIn, instantAt, timeIn, weekStartOf } from './days.js'

const CHICAGO = 'America/Chicago'
const TOKYO = 'Asia/Tokyo'
const iso = (instant: number) => new Date(instant).toISOString()

describe('instantAt', () => {
	it('reads a wall time in the zone it is given', () => {
		expect(iso(instantAt('2026-09-30', '15:00', CHICAGO))).toBe('2026-09-30T20:00:00.000Z')
		expect(iso(instantAt('2026-09-30', '15:00', TOKYO))).toBe('2026-09-30T06:00:00.000Z')
		expect(iso(instantAt('2026-09-30', '15:00', 'UTC'))).toBe('2026-09-30T15:00:00.000Z')
	})

	it('reads midnight as the start of the day', () => {
		expect(iso(instantAt('2026-09-30', '00:00', CHICAGO))).toBe('2026-09-30T05:00:00.000Z')
		expect(iso(instantAt('2026-09-30', '00:00', TOKYO))).toBe('2026-09-29T15:00:00.000Z')
	})

	it('keeps the winter offset before the clocks go forward and the summer one after', () => {
		// America/Chicago goes forward on 2026-03-08, from 02:00 to 03:00
		expect(iso(instantAt('2026-03-08', '01:59', CHICAGO))).toBe('2026-03-08T07:59:00.000Z')
		expect(iso(instantAt('2026-03-08', '03:00', CHICAGO))).toBe('2026-03-08T08:00:00.000Z')
		expect(iso(instantAt('2026-03-07', '15:00', CHICAGO))).toBe('2026-03-07T21:00:00.000Z')
		expect(iso(instantAt('2026-03-09', '15:00', CHICAGO))).toBe('2026-03-09T20:00:00.000Z')
	})

	it('reads a time the clocks skip as the same time after the jump', () => {
		const skipped = instantAt('2026-03-08', '02:30', CHICAGO)
		expect(iso(skipped)).toBe('2026-03-08T08:30:00.000Z')
		expect(timeIn(skipped, CHICAGO)).toBe('03:30')
	})

	it('reads a time the clocks repeat as the earlier of the two', () => {
		// America/Chicago goes back on 2026-11-01, from 02:00 to 01:00
		expect(iso(instantAt('2026-11-01', '01:30', CHICAGO))).toBe('2026-11-01T06:30:00.000Z')
		expect(iso(instantAt('2026-11-01', '02:00', CHICAGO))).toBe('2026-11-01T08:00:00.000Z')
		expect(iso(instantAt('2026-11-01', '00:30', CHICAGO))).toBe('2026-11-01T05:30:00.000Z')
	})

	it('has no jump to cross where the clocks never change', () => {
		expect(iso(instantAt('2026-03-08', '02:30', TOKYO))).toBe('2026-03-07T17:30:00.000Z')
		expect(iso(instantAt('2026-03-08', '02:30', 'UTC'))).toBe('2026-03-08T02:30:00.000Z')
		expect(iso(instantAt('2026-11-01', '01:30', TOKYO))).toBe('2026-10-31T16:30:00.000Z')
	})
})

describe('timeIn and dateIn', () => {
	it('read an instant back as the zone sees it', () => {
		const instant = Date.parse('2026-09-30T03:30:00Z')
		expect([dateIn(CHICAGO, instant), timeIn(instant, CHICAGO)]).toEqual(['2026-09-29', '22:30'])
		expect([dateIn(TOKYO, instant), timeIn(instant, TOKYO)]).toEqual(['2026-09-30', '12:30'])
		expect([dateIn('UTC', instant), timeIn(instant, 'UTC')]).toEqual(['2026-09-30', '03:30'])
	})

	it('read midnight as 00:00, never 24:00', () => {
		expect(timeIn(Date.parse('2026-09-30T05:00:00Z'), CHICAGO)).toBe('00:00')
	})

	it('round-trip through instantAt on the days the clocks change', () => {
		for (const [day, time] of [
			['2026-03-08', '12:00'],
			['2026-11-01', '12:00'],
			['2026-11-01', '23:59'],
		] as const) {
			const instant = instantAt(day, time, CHICAGO)
			expect([dateIn(CHICAGO, instant), timeIn(instant, CHICAGO)]).toEqual([day, time])
		}
	})
})

describe('addDays and weekStartOf', () => {
	it('count calendar days, whatever the clocks do', () => {
		expect(addDays('2026-03-07', 1)).toBe('2026-03-08')
		expect(addDays('2026-03-08', 1)).toBe('2026-03-09')
		expect(addDays('2026-11-01', -1)).toBe('2026-10-31')
	})

	it('find the week a day falls in from either start', () => {
		expect(weekStartOf('2026-09-30', 'monday')).toBe('2026-09-28')
		expect(weekStartOf('2026-09-30', 'sunday')).toBe('2026-09-27')
	})
})
