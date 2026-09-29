// The calendar week a domain shows (D-58): seven dates from the owner's week start, in the place's timezone.
import type { WeekStart } from '../types/index.js'

const DAY_MS = 24 * 60 * 60 * 1000

/** The calendar date of an instant in a timezone, `YYYY-MM-DD`. */
export function dateIn(timeZone: string, instant: number): string {
	const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
		.formatToParts(new Date(instant))
		.reduce<Record<string, string>>((all, part) => ({ ...all, [part.type]: part.value }), {})
	return `${parts.year}-${parts.month}-${parts.day}`
}

/** Today's date where the place is. */
export function placeToday(timeZone: string, now: number = Date.now()): string {
	return dateIn(timeZone, now)
}

/** A calendar date some days on; negative goes back. */
export function addDays(isoDate: string, days: number): string {
	return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

/** The first day of the week a date falls in. */
export function weekStartOf(isoDate: string, weekStart: WeekStart): string {
	const weekday = new Date(`${isoDate}T00:00:00Z`).getUTCDay()
	const back = weekStart === 'sunday' ? weekday : (weekday + 6) % 7
	return addDays(isoDate, -back)
}

/** The seven dates of the week a date falls in, from the week start. */
export function weekDates(isoDate: string, weekStart: WeekStart): string[] {
	const first = weekStartOf(isoDate, weekStart)
	return Array.from({ length: 7 }, (_, i) => addDays(first, i))
}
