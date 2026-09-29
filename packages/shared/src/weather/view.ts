// What the page shows of a forecast at an instant: pure, so the week's layout and the strip are tested without a store.
import type { WeekStart } from '../types/index.js'
import type { AirCategory, DayReading, Forecast, HourReading } from './model.js'
import { placeToday, weekDates } from './week.js'

const HOUR_MS = 60 * 60 * 1000

/** One row of the calendar week: its date, the reading when the forecast holds one, and whether it is today. */
export interface WeekDay {
	date: string
	today: boolean
	day: DayReading | undefined
}

/** The day the forecast holds for today where the place is. */
export function todayOf(forecast: Forecast, now: number): DayReading | undefined {
	const today = placeToday(forecast.timeZone, now)
	return forecast.days.find((day) => day.date === today)
}

/** The calendar week today falls in, from the week start (D-58): always seven rows, a row without a reading included. */
export function weekOf(forecast: Forecast, weekStart: WeekStart, now: number): WeekDay[] {
	const today = placeToday(forecast.timeZone, now)
	return weekDates(today, weekStart).map((date) => ({
		date,
		today: date === today,
		day: forecast.days.find((day) => day.date === date),
	}))
}

/** The hours from the one the instant falls in. */
export function hoursFrom(forecast: Forecast, now: number, count: number): HourReading[] {
	const start = forecast.hours.findIndex((hour) => hour.time + HOUR_MS > now)
	return start < 0 ? [] : forecast.hours.slice(start, start + count)
}

/**
 * The newer forecast's days with the days it lacks filled from another set (the mirror before it, or the default
 * provider's observed days), from a first date on: the past of the week survives a provider's gaps, and the mirror
 * never grows without end.
 */
export function mergeDays(fill: DayReading[], next: DayReading[], from: string): DayReading[] {
	const held = new Set(next.map((day) => day.date))
	const last = next[next.length - 1]?.date
	const kept = fill.filter((day) => !held.has(day.date) && (last === undefined || day.date < last))
	return [...kept, ...next]
		.filter((day) => day.date >= from)
		.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

/** Whether the calendar week has a row without a reading. */
export function weekHasGap(forecast: Forecast, weekStart: WeekStart, now: number): boolean {
	return weekOf(forecast, weekStart, now).some((row) => !row.day)
}

/** The US index's category (AirNow's breakpoints). */
export function airCategory(usAqi: number): AirCategory {
	if (usAqi <= 50) return 'good'
	if (usAqi <= 100) return 'moderate'
	if (usAqi <= 150) return 'sensitive'
	if (usAqi <= 200) return 'unhealthy'
	if (usAqi <= 300) return 'very-unhealthy'
	return 'hazardous'
}
