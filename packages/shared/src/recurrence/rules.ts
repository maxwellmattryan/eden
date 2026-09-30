// The rules of a recurrence, as pure functions of calendar days: whether it falls on a day, and the days it falls on
// in a range. Occurrences are computed and never stored (D-75). Monthly and yearly follow RRULE: a month without the
// day (the 31st, 29 February) is skipped, never moved. A weekly interval counts weeks from Monday whatever the
// owner's week starts on, so a rule means the same days on every device.
import { FREQUENCIES, WEEKDAYS, type Recurrence, type Weekday } from './types.js'

const DAY_MS = 24 * 60 * 60 * 1000
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** A day as a count of days since the epoch, or `NaN` when it is not a date. */
function dayNumber(day: string): number {
	return isDay(day) ? Date.parse(`${day}T00:00:00Z`) / DAY_MS : NaN
}

function fromDayNumber(days: number): string {
	return new Date(days * DAY_MS).toISOString().slice(0, 10)
}

/** Whether a string is a real calendar date, `YYYY-MM-DD`. */
export function isDay(value: unknown): value is string {
	if (typeof value !== 'string' || !DATE.test(value)) return false
	const instant = Date.parse(`${value}T00:00:00Z`)
	return !Number.isNaN(instant) && new Date(instant).toISOString().slice(0, 10) === value
}

function parts(day: string): { year: number; month: number; date: number } {
	const match = DATE.exec(day)
	return { year: Number(match?.[1]), month: Number(match?.[2]), date: Number(match?.[3]) }
}

/** How many days a month has; `month` from 1. */
function daysIn(year: number, month: number): number {
	return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** The weekday of a calendar date, Monday first. */
function weekdayIndex(days: number): number {
	// the epoch was a Thursday
	return (((days + 3) % 7) + 7) % 7
}

/** The day of the week a calendar date falls on. */
export function weekdayOf(day: string): Weekday {
	return WEEKDAYS[weekdayIndex(dayNumber(day))] ?? 'mo'
}

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1

/** Reads a stored recurrence. What is malformed reads as `null`: a rule is never half applied. */
export function parseRecurrence(value: unknown): Recurrence | null {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
	const { freq, start, interval, weekdays, until, count } = value as Record<string, unknown>
	if (!FREQUENCIES.includes(freq as Recurrence['freq']) || !isDay(start)) return null
	if (interval !== undefined && !isCount(interval)) return null
	if (until !== undefined && !isDay(until)) return null
	if (count !== undefined && !isCount(count)) return null
	if (weekdays !== undefined) {
		if (!Array.isArray(weekdays) || !weekdays.every((day) => WEEKDAYS.includes(day as Weekday))) return null
	}
	return {
		freq: freq as Recurrence['freq'],
		start,
		...(interval !== undefined ? { interval } : {}),
		...(weekdays !== undefined && weekdays.length ? { weekdays: weekdays as Weekday[] } : {}),
		...(until !== undefined ? { until } : {}),
		...(count !== undefined ? { count } : {}),
	}
}

/** The days of the week a weekly rule falls on, Monday first, as indexes. */
function weekdaysOf(rule: Recurrence, start: number): number[] {
	const named = [...new Set((rule.weekdays ?? []).map((day) => WEEKDAYS.indexOf(day)))].filter((i) => i >= 0)
	return named.length ? named.sort((a, b) => a - b) : [weekdayIndex(start)]
}

/**
 * Which occurrence of the rule a day is, the first being 1, before `until` and `count` are looked at; `null` when
 * the rule does not fall on the day.
 */
function ordinalOf(rule: Recurrence, day: string): number | null {
	const start = dayNumber(rule.start)
	const at = dayNumber(day)
	if (Number.isNaN(start) || Number.isNaN(at) || at < start) return null
	const interval = rule.interval ?? 1

	if (rule.freq === 'daily') {
		const days = at - start
		return days % interval === 0 ? days / interval + 1 : null
	}

	if (rule.freq === 'weekly') {
		const days = weekdaysOf(rule, start)
		const weekday = weekdayIndex(at)
		if (!days.includes(weekday)) return null
		const weeks = (at - weekday - (start - weekdayIndex(start))) / 7
		if (weeks % interval !== 0) return null
		const first = weekdayIndex(start)
		const upTo = days.filter((d) => d <= weekday).length
		if (weeks === 0) return days.filter((d) => d >= first && d <= weekday).length
		return days.filter((d) => d >= first).length + (weeks / interval - 1) * days.length + upTo
	}

	const from = parts(rule.start)
	const to = parts(day)
	if (to.date !== from.date) return null

	if (rule.freq === 'monthly') {
		const months = (to.year - from.year) * 12 + (to.month - from.month)
		if (months % interval !== 0) return null
		// the months without the day are not occurrences, so they are not counted either
		let ordinal = 0
		for (let step = 0; step <= months; step += interval) {
			const month = from.month - 1 + step
			if (daysIn(from.year + Math.floor(month / 12), (month % 12) + 1) >= from.date) ordinal += 1
		}
		return ordinal
	}

	if (to.month !== from.month) return null
	const years = to.year - from.year
	if (years % interval !== 0) return null
	let ordinal = 0
	for (let step = 0; step <= years; step += interval) {
		if (daysIn(from.year + step, from.month) >= from.date) ordinal += 1
	}
	return ordinal
}

/** Whether the rule falls on a day. */
export function occursOn(rule: Recurrence, day: string): boolean {
	const ordinal = ordinalOf(rule, day)
	if (ordinal === null) return false
	if (rule.until !== undefined && day > rule.until) return false
	return rule.count === undefined || ordinal <= rule.count
}

/** The days the rule falls on from one day to another, both included, in order. */
export function occurrencesBetween(rule: Recurrence, from: string, to: string): string[] {
	const first = Math.max(dayNumber(from), dayNumber(rule.start))
	const last = Math.min(dayNumber(to), rule.until === undefined ? Infinity : dayNumber(rule.until))
	const days: string[] = []
	if (Number.isNaN(first) || Number.isNaN(last)) return days
	for (let at = first; at <= last; at += 1) {
		const day = fromDayNumber(at)
		if (occursOn(rule, day)) days.push(day)
	}
	return days
}
