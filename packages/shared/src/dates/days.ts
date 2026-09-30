// Calendar days and wall-clock times in a timezone: what Sky's week and the tasks' due days are worked out with. A
// day is `YYYY-MM-DD` and a time `HH:MM`; an instant is milliseconds since the epoch. The zone is an IANA name, or
// `undefined` for the device's. Nothing here reads the clock: the instant is always a parameter, so a test chooses
// the day and the zone.
import type { WeekStart } from '../types/index.js'

const DAY_MS = 24 * 60 * 60 * 1000
const MINUTE_MS = 60 * 1000

/** One formatter per zone: making one is the slow part, and a view asks for many days at once. */
const formatters = new Map<string, Intl.DateTimeFormat>()
function formatterFor(zone: string | undefined): Intl.DateTimeFormat {
	const key = zone ?? ''
	let formatter = formatters.get(key)
	if (!formatter) {
		formatter = new Intl.DateTimeFormat('en-CA', {
			timeZone: zone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			hourCycle: 'h23',
		})
		formatters.set(key, formatter)
	}
	return formatter
}

/** What the zone's clock and calendar read at an instant. */
function wallIn(zone: string | undefined, instant: number): { day: string; time: string } {
	const parts: Record<string, string> = {}
	for (const part of formatterFor(zone).formatToParts(new Date(instant))) parts[part.type] = part.value
	return { day: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` }
}

/** The calendar date of an instant in a timezone, `YYYY-MM-DD`. */
export function dateIn(timeZone: string | undefined, instant: number): string {
	return wallIn(timeZone, instant).day
}

/** The time of an instant on a timezone's clock, `HH:MM`. */
export function timeIn(instant: number, timeZone: string | undefined): string {
	return wallIn(timeZone, instant).time
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

/**
 * The instant a timezone's clock reads a time on a day. A time the clocks skip reads as the same time after the jump
 * (02:30 becomes 03:30 on the day they go forward), and a time they repeat as the earlier of the two, which is how
 * the platform's `Date` reads both.
 */
export function instantAt(day: string, time: string, timeZone: string | undefined): number {
	const wall = Date.parse(`${day}T${time}:00Z`)
	// the zone's offset a day before and a day after: they differ only when the clocks change in between
	const before = wall - offsetAt(wall - DAY_MS, timeZone)
	const after = wall - offsetAt(wall + DAY_MS, timeZone)
	const reads = (instant: number) => {
		const at = wallIn(timeZone, instant)
		return at.day === day && at.time === time
	}
	const earlier = Math.min(before, after)
	const later = Math.max(before, after)
	if (reads(earlier)) return earlier
	if (reads(later)) return later
	// skipped: the offset from before the jump carries the time past it
	return before
}

/** How far the zone's wall clock is ahead of UTC at an instant, in milliseconds. */
function offsetAt(instant: number, timeZone: string | undefined): number {
	const at = wallIn(timeZone, instant)
	const minute = Math.floor(instant / MINUTE_MS) * MINUTE_MS
	return Date.parse(`${at.day}T${at.time}:00Z`) - minute
}
