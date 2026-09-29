import { describe, expect, it } from 'vitest'
import { addDays, dateIn, weekDates, weekStartOf } from './week.js'

describe('dateIn', () => {
	it('gives the calendar date where the place is', () => {
		const instant = Date.parse('2026-09-30T03:30:00Z')
		expect(dateIn('America/Chicago', instant)).toBe('2026-09-29')
		expect(dateIn('Asia/Tokyo', instant)).toBe('2026-09-30')
	})
})

describe('weekDates', () => {
	it('runs Monday to Sunday', () => {
		expect(weekDates('2026-09-30', 'monday')).toEqual([
			'2026-09-28',
			'2026-09-29',
			'2026-09-30',
			'2026-10-01',
			'2026-10-02',
			'2026-10-03',
			'2026-10-04',
		])
	})

	it('runs Sunday to Saturday', () => {
		const week = weekDates('2026-09-30', 'sunday')
		expect(week[0]).toBe('2026-09-27')
		expect(week[6]).toBe('2026-10-03')
	})

	it('keeps a Sunday in the week it ends when the week starts on Monday, and starts one when it starts on Sunday', () => {
		expect(weekStartOf('2026-10-04', 'monday')).toBe('2026-09-28')
		expect(weekStartOf('2026-10-04', 'sunday')).toBe('2026-10-04')
	})

	it('crosses a year', () => {
		expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
		expect(weekStartOf('2027-01-01', 'monday')).toBe('2026-12-28')
	})
})
