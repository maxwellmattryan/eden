import { describe, expect, it } from 'vitest'
import {
	ago,
	dayOfMonth,
	formatAgo,
	formatDateOf,
	formatHour,
	hourOfDay,
	formatMoment,
	formatTime,
	formatWeekdayOf,
} from './index.js'

const EVENING = '2026-09-30T23:05:00Z'
const MIDNIGHT = '2026-09-30T05:00:00Z'

describe('formatTime', () => {
	it('writes the 24-hour clock in the timezone it is given', () => {
		expect(formatTime(EVENING, { lang: 'en', clock: '24h', timeZone: 'America/Chicago' })).toBe('18:05')
		expect(formatTime(EVENING, { lang: 'en', clock: '24h', timeZone: 'Asia/Tokyo' })).toBe('08:05')
	})

	it('writes the 12-hour clock', () => {
		expect(formatTime(EVENING, { lang: 'en', clock: '12h', timeZone: 'America/Chicago' })).toMatch(/^6:05\sPM$/)
	})

	it('reads midnight as 00:00, never 24:00', () => {
		expect(formatTime(MIDNIGHT, { lang: 'en', clock: '24h', timeZone: 'America/Chicago' })).toBe('00:00')
		expect(formatTime(MIDNIGHT, { lang: 'ja', clock: '24h', timeZone: 'America/Chicago' })).toBe('00:00')
	})

	it('takes an instant in milliseconds', () => {
		expect(formatTime(Date.parse(EVENING), { lang: 'en', clock: '24h', timeZone: 'UTC' })).toBe('23:05')
	})
})

describe('formatMoment', () => {
	it('names the day and the time where the place is', () => {
		expect(formatMoment('2026-10-02T19:00:00-05:00', { lang: 'en', clock: '24h', timeZone: 'America/Chicago' })).toBe(
			'Fri, Oct 2, 19:00'
		)
		expect(formatMoment('2026-10-02T19:00:00-05:00', { lang: 'en', clock: '24h', timeZone: 'Asia/Tokyo' })).toBe(
			'Sat, Oct 3, 09:00'
		)
	})
})

describe('hourOfDay', () => {
	it('reads the hour where the place is, midnight as 0', () => {
		expect(hourOfDay('2026-09-30T23:05:00Z', 'America/Chicago')).toBe(18)
		expect(hourOfDay('2026-09-30T05:00:00Z', 'America/Chicago')).toBe(0)
		expect(hourOfDay('2026-09-30T23:05:00Z', 'Asia/Tokyo')).toBe(8)
	})
})

describe('formatHour', () => {
	it('keeps the minutes on the 24-hour clock and drops them on the 12-hour one', () => {
		expect(formatHour(EVENING, { lang: 'en', clock: '24h', timeZone: 'America/Chicago' })).toBe('18:05')
		expect(formatHour(EVENING, { lang: 'en', clock: '12h', timeZone: 'America/Chicago' })).toMatch(/^6\sPM$/)
	})
})

describe('formatWeekdayOf', () => {
	it('names the weekday of a calendar date', () => {
		expect(formatWeekdayOf('2026-09-30', 'en')).toBe('Wednesday')
		expect(formatWeekdayOf('2026-09-28', 'en')).toBe('Monday')
		expect(formatWeekdayOf('2026-09-30', 'ja')).toBe('水曜日')
		expect(formatWeekdayOf('2026-09-30', 'en', 'short')).toBe('Wed')
		expect(dayOfMonth('2026-10-04')).toBe(4)
	})
})

describe('ago', () => {
	const NOW = Date.parse('2026-09-30T12:00:00Z')
	const before = (ms: number) => NOW - ms

	it('takes the coarsest whole unit that fits', () => {
		expect(ago(before(30 * 1000), NOW)).toEqual({ value: 30, unit: 'second' })
		expect(ago(before(5 * 60 * 1000), NOW)).toEqual({ value: 5, unit: 'minute' })
		expect(ago(before(90 * 60 * 1000), NOW)).toEqual({ value: 1, unit: 'hour' })
		expect(ago(before(26 * 60 * 60 * 1000), NOW)).toEqual({ value: 1, unit: 'day' })
	})

	it('reads an instant ahead of now as zero seconds', () => {
		expect(ago(NOW + 5000, NOW)).toEqual({ value: 0, unit: 'second' })
	})

	it('writes the age in the language given', () => {
		expect(formatAgo(before(5 * 60 * 1000), 'en', NOW)).toBe('5 minutes ago')
		expect(formatAgo(before(60 * 60 * 1000), 'en', NOW)).toBe('1 hour ago')
		expect(formatAgo(before(24 * 60 * 60 * 1000), 'en', NOW)).toBe('yesterday')
		expect(formatAgo(before(30 * 1000), 'en', NOW)).toBe('30 seconds ago')
		expect(formatAgo(NOW, 'en', NOW)).toBe('now')
		expect(formatAgo(before(5 * 60 * 1000), 'ja', NOW)).toBe('5 分前')
	})
})

describe('formatDateOf', () => {
	it('renders the calendar date whatever the timezone', () => {
		expect(formatDateOf('2026-09-29', 'en')).toMatch(/^29 Sept?$|^Sept? 29$/)
		expect(formatDateOf('2026-01-01', 'ja')).toBe('1月1日')
	})
})
