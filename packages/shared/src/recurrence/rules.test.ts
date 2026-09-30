import { describe, expect, it } from 'vitest'
import { isDay, occurrencesBetween, occursOn, parseRecurrence, weekdayOf } from './rules.js'
import type { Recurrence } from './types.js'

// 2026-09-30 is a Wednesday.
const WEDNESDAY = '2026-09-30'

describe('daily', () => {
	it('falls on every day from its start, and on none before', () => {
		const rule: Recurrence = { freq: 'daily', start: WEDNESDAY }
		expect(occursOn(rule, '2026-09-29')).toBe(false)
		expect(occursOn(rule, WEDNESDAY)).toBe(true)
		expect(occursOn(rule, '2026-10-01')).toBe(true)
		expect(occursOn(rule, '2027-02-28')).toBe(true)
	})

	it('falls on every third day with an interval of three', () => {
		const rule: Recurrence = { freq: 'daily', start: WEDNESDAY, interval: 3 }
		expect(occurrencesBetween(rule, '2026-09-28', '2026-10-10')).toEqual([
			'2026-09-30',
			'2026-10-03',
			'2026-10-06',
			'2026-10-09',
		])
	})

	it('stops after its last day with until, that day included', () => {
		const rule: Recurrence = { freq: 'daily', start: WEDNESDAY, until: '2026-10-02' }
		expect(occurrencesBetween(rule, '2026-09-01', '2026-10-31')).toEqual(['2026-09-30', '2026-10-01', '2026-10-02'])
	})

	it('stops after so many occurrences with count, the first included', () => {
		const rule: Recurrence = { freq: 'daily', start: WEDNESDAY, interval: 2, count: 3 }
		expect(occurrencesBetween(rule, '2026-09-01', '2026-10-31')).toEqual(['2026-09-30', '2026-10-02', '2026-10-04'])
	})
})

describe('weekly', () => {
	it('falls on the weekday of its start when it names none', () => {
		const rule: Recurrence = { freq: 'weekly', start: WEDNESDAY }
		expect(occurrencesBetween(rule, '2026-09-28', '2026-10-15')).toEqual(['2026-09-30', '2026-10-07', '2026-10-14'])
	})

	it('falls on the weekdays it names, from its start on', () => {
		const rule: Recurrence = { freq: 'weekly', start: WEDNESDAY, weekdays: ['mo', 'th'] }
		// the Monday of the start's week is before the start
		expect(occursOn(rule, '2026-09-28')).toBe(false)
		expect(occurrencesBetween(rule, '2026-09-28', '2026-10-12')).toEqual([
			'2026-10-01',
			'2026-10-05',
			'2026-10-08',
			'2026-10-12',
		])
	})

	it('counts weeks from Monday with an interval, so a Sunday belongs to the week it ends', () => {
		const rule: Recurrence = { freq: 'weekly', start: WEDNESDAY, weekdays: ['we', 'su'], interval: 2 }
		expect(occurrencesBetween(rule, '2026-09-28', '2026-10-25')).toEqual([
			'2026-09-30',
			'2026-10-04',
			'2026-10-14',
			'2026-10-18',
		])
	})

	it('counts occurrences across weeks with count', () => {
		const rule: Recurrence = { freq: 'weekly', start: WEDNESDAY, weekdays: ['th', 'mo'], count: 3 }
		expect(occurrencesBetween(rule, '2026-09-01', '2026-12-31')).toEqual(['2026-10-01', '2026-10-05', '2026-10-08'])
	})

	it('stops with until', () => {
		const rule: Recurrence = { freq: 'weekly', start: WEDNESDAY, until: '2026-10-13' }
		expect(occurrencesBetween(rule, '2026-09-01', '2026-12-31')).toEqual(['2026-09-30', '2026-10-07'])
	})
})

describe('monthly', () => {
	it('falls on the day of its start each month', () => {
		const rule: Recurrence = { freq: 'monthly', start: '2026-09-15' }
		expect(occursOn(rule, '2026-10-15')).toBe(true)
		expect(occursOn(rule, '2026-10-16')).toBe(false)
		expect(occursOn(rule, '2027-01-15')).toBe(true)
	})

	it('skips a month without the 31st, and never moves to the 30th', () => {
		const rule: Recurrence = { freq: 'monthly', start: '2026-01-31' }
		expect(occurrencesBetween(rule, '2026-01-01', '2026-07-31')).toEqual([
			'2026-01-31',
			'2026-03-31',
			'2026-05-31',
			'2026-07-31',
		])
		expect(occursOn(rule, '2026-02-28')).toBe(false)
		expect(occursOn(rule, '2026-04-30')).toBe(false)
	})

	it('falls on every second month with an interval of two', () => {
		const rule: Recurrence = { freq: 'monthly', start: '2026-09-15', interval: 2 }
		expect(occurrencesBetween(rule, '2026-09-01', '2027-02-28')).toEqual(['2026-09-15', '2026-11-15', '2027-01-15'])
	})

	it('does not count the months it skips towards count', () => {
		const rule: Recurrence = { freq: 'monthly', start: '2026-08-31', count: 3 }
		expect(occurrencesBetween(rule, '2026-08-01', '2027-03-31')).toEqual(['2026-08-31', '2026-10-31', '2026-12-31'])
	})

	it('stops with until', () => {
		const rule: Recurrence = { freq: 'monthly', start: '2026-09-15', until: '2026-11-14' }
		expect(occurrencesBetween(rule, '2026-09-01', '2027-02-28')).toEqual(['2026-09-15', '2026-10-15'])
	})
})

describe('yearly', () => {
	it('falls on the day and month of its start each year', () => {
		const rule: Recurrence = { freq: 'yearly', start: WEDNESDAY }
		expect(occursOn(rule, '2027-09-30')).toBe(true)
		expect(occursOn(rule, '2027-10-30')).toBe(false)
		expect(occursOn(rule, '2027-09-29')).toBe(false)
	})

	it('falls on every second year with an interval of two', () => {
		const rule: Recurrence = { freq: 'yearly', start: WEDNESDAY, interval: 2 }
		expect(occursOn(rule, '2027-09-30')).toBe(false)
		expect(occursOn(rule, '2028-09-30')).toBe(true)
	})

	it('falls on 29 February in leap years only, and never on the 28th', () => {
		const rule: Recurrence = { freq: 'yearly', start: '2024-02-29' }
		expect(occursOn(rule, '2025-02-28')).toBe(false)
		expect(occursOn(rule, '2025-03-01')).toBe(false)
		expect(occursOn(rule, '2028-02-29')).toBe(true)
	})

	it('counts only the years it falls in towards count', () => {
		const rule: Recurrence = { freq: 'yearly', start: '2024-02-29', count: 2 }
		expect(occursOn(rule, '2028-02-29')).toBe(true)
		expect(occursOn(rule, '2032-02-29')).toBe(false)
	})

	it('stops with until', () => {
		const rule: Recurrence = { freq: 'yearly', start: WEDNESDAY, until: '2027-09-29' }
		expect(occursOn(rule, WEDNESDAY)).toBe(true)
		expect(occursOn(rule, '2027-09-30')).toBe(false)
	})
})

describe('parseRecurrence', () => {
	it('reads a stored rule', () => {
		expect(parseRecurrence({ freq: 'weekly', start: WEDNESDAY, weekdays: ['mo', 'th'], interval: 2 })).toEqual({
			freq: 'weekly',
			start: WEDNESDAY,
			weekdays: ['mo', 'th'],
			interval: 2,
		})
		expect(parseRecurrence({ freq: 'daily', start: WEDNESDAY, until: '2026-12-31', count: 5 })).toEqual({
			freq: 'daily',
			start: WEDNESDAY,
			until: '2026-12-31',
			count: 5,
		})
	})

	it('reads what is malformed as null', () => {
		for (const bad of [
			null,
			undefined,
			'daily',
			[],
			{},
			{ freq: 'hourly', start: WEDNESDAY },
			{ freq: 'daily' },
			{ freq: 'daily', start: '2026-02-30' },
			{ freq: 'daily', start: '30 Sep' },
			{ freq: 'daily', start: WEDNESDAY, interval: 0 },
			{ freq: 'daily', start: WEDNESDAY, interval: 1.5 },
			{ freq: 'weekly', start: WEDNESDAY, weekdays: ['monday'] },
			{ freq: 'weekly', start: WEDNESDAY, weekdays: 'mo' },
			{ freq: 'daily', start: WEDNESDAY, until: 'later' },
			{ freq: 'daily', start: WEDNESDAY, count: -1 },
		]) {
			expect(parseRecurrence(bad)).toBeNull()
		}
	})
})

describe('weekdayOf and isDay', () => {
	it('name the weekday of a date', () => {
		expect(weekdayOf(WEDNESDAY)).toBe('we')
		expect(weekdayOf('2026-10-04')).toBe('su')
		expect(weekdayOf('2026-10-05')).toBe('mo')
		expect(weekdayOf('1969-12-31')).toBe('we')
	})

	it('take only real calendar dates', () => {
		expect(isDay('2028-02-29')).toBe(true)
		expect(isDay('2026-02-29')).toBe(false)
		expect(isDay('2026-9-30')).toBe(false)
		expect(isDay(20260930)).toBe(false)
	})
})
