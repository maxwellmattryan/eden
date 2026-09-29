import { describe, expect, it } from 'vitest'
import { formatHour, formatTime, formatWeekdayOf } from './index.js'

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
	})
})
