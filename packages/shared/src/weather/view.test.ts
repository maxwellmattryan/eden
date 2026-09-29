import { describe, expect, it } from 'vitest'
import raw from './fixtures/open-meteo.json'
import type { DayReading } from './model.js'
import { normalizeOpenMeteo, type OpenMeteoResponse } from './providers/open-meteo.js'
import { airCategory, hoursFrom, mergeDays, todayOf, weekHasGap, weekOf } from './view.js'

const forecast = normalizeOpenMeteo(raw as OpenMeteoResponse)
/** Tuesday 2026-09-29 in Austin. */
const now = forecast.current.time

describe('weekOf', () => {
	it('shows the calendar week from Monday, today second, the day before observed', () => {
		const week = weekOf(forecast, 'monday', now)
		expect(week.map((row) => row.date)).toEqual([
			'2026-09-28',
			'2026-09-29',
			'2026-09-30',
			'2026-10-01',
			'2026-10-02',
			'2026-10-03',
			'2026-10-04',
		])
		expect(week.map((row) => row.today)).toEqual([false, true, false, false, false, false, false])
		expect(week[0]!.day?.observed).toBe(true)
		expect(week[1]!.day?.observed).toBe(false)
		expect(week.every((row) => row.day)).toBe(true)
	})

	it('shows the calendar week from Sunday, today third', () => {
		const week = weekOf(forecast, 'sunday', now)
		expect(week[0]!.date).toBe('2026-09-27')
		expect(week[2]!.today).toBe(true)
		expect(week.every((row) => row.day)).toBe(true)
	})

	it('finds today by the date, not the position, when the mirror is a day old', () => {
		const tomorrow = now + 24 * 60 * 60 * 1000
		expect(todayOf(forecast, tomorrow)?.date).toBe('2026-09-30')
		expect(weekOf(forecast, 'monday', tomorrow)[2]!.today).toBe(true)
	})

	it('keeps seven rows when the forecast has no reading for one', () => {
		const week = weekOf({ ...forecast, days: forecast.days.slice(7) }, 'monday', now)
		expect(week).toHaveLength(7)
		expect(week[0]!.day).toBeUndefined()
	})
})

describe('hoursFrom', () => {
	it('starts at the hour the instant falls in', () => {
		const hours = hoursFrom(forecast, now, 12)
		expect(hours).toHaveLength(12)
		expect(hours[0]!.time).toBeLessThanOrEqual(now)
		expect(hoursFrom(forecast, now + 3 * 60 * 60 * 1000, 12)[0]!.time).toBe(hours[3]!.time)
	})
})

describe('mergeDays', () => {
	const day = (date: string, hi: number): DayReading => ({ ...forecast.days[0]!, date, hi })
	const next = [day('2026-09-28', 3), day('2026-09-30', 4)]

	it('fills the days a newer forecast lacks, gaps included, and prefers the newer reading', () => {
		const merged = mergeDays([day('2026-09-27', 1), day('2026-09-28', 2), day('2026-09-29', 5)], next, '2026-09-01')
		expect(merged.map((d) => [d.date, d.hi])).toEqual([
			['2026-09-27', 1],
			['2026-09-28', 3],
			['2026-09-29', 5],
			['2026-09-30', 4],
		])
	})

	it('drops what is older than the first date kept and what lies past the newer forecast', () => {
		const merged = mergeDays([day('2026-09-20', 1), day('2026-10-09', 2)], next, '2026-09-23')
		expect(merged.map((d) => d.date)).toEqual(['2026-09-28', '2026-09-30'])
	})
})

describe('weekHasGap', () => {
	it('is false for a whole week and true when a day has no reading', () => {
		expect(weekHasGap(forecast, 'monday', now)).toBe(false)
		expect(weekHasGap({ ...forecast, days: forecast.days.slice(7) }, 'monday', now)).toBe(true)
	})
})

describe('airCategory', () => {
	it('follows the US index bands', () => {
		expect(airCategory(40)).toBe('good')
		expect(airCategory(51)).toBe('moderate')
		expect(airCategory(101)).toBe('sensitive')
		expect(airCategory(151)).toBe('unhealthy')
		expect(airCategory(201)).toBe('very-unhealthy')
		expect(airCategory(301)).toBe('hazardous')
	})
})
