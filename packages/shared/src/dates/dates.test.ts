import { describe, expect, it } from 'vitest'
import { dayOfMonth, formatHour, hourOfDay, formatMoment, formatTime, formatWeekdayOf } from './index.js'

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
