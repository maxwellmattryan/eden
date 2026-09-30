// The calendar week a domain shows (D-58): seven dates from the owner's week start, in the place's timezone.
import { addDays, dateIn, weekStartOf } from '../dates/days.js'
import type { WeekStart } from '../types/index.js'

// The day helpers are the shared ones (`dates/days.ts`); Sky's API keeps their names.
export { addDays, dateIn, weekStartOf }

/** Today's date where the place is. */
export function placeToday(timeZone: string, now: number = Date.now()): string {
	return dateIn(timeZone, now)
}

/** The seven dates of the week a date falls in, from the week start. */
export function weekDates(isoDate: string, weekStart: WeekStart): string[] {
	const first = weekStartOf(isoDate, weekStart)
	return Array.from({ length: 7 }, (_, i) => addDays(first, i))
}
