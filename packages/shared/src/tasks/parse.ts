// The quick-add parser (docs/product/substrate/tasks.md, "Today view"; D-75): a line becomes a todo with a due, a
// routine with a recurrence and a time of day, or a habit with a target. The words come from `vocabulary.ts`; this
// module places them: a weekday is the next one strictly after today, `next week` the first day of the owner's next
// week (D-58), a time alone is today if it is still ahead and else tomorrow, and a timed due is the wall time in
// the owner's zone as an instant. Whatever is left of the line is the title; a line that reads as nothing is the
// title whole. A routine takes its start from the date it names or from today, and a habit takes only its target.
import { addDays, dateIn, instantAt, weekStartOf } from '../dates/days.js'
import { isDay, WEEKDAYS, weekdayOf, type Recurrence } from '../recurrence/index.js'
import type { WeekStart } from '../types/index.js'
import type { HabitTarget } from './types.js'
import { vocabulary, type DayReading, type Language, type Matcher, type RepeatReading } from './vocabulary.js'

export interface ParseContext {
	/** The instant the line is typed at, in milliseconds since the epoch. */
	now: number
	/** The owner's timezone; the device's when absent (until the setting exists, D-27). */
	zone?: string
	weekStart: WeekStart
	lang: Language
}

export interface ParsedTask {
	kind: 'todo' | 'routine' | 'habit'
	title: string
	/** A day, or an instant when the line named a time. */
	due?: string
	/** A routine's time on the owner's clock. */
	timeOfDay?: string
	recurrence?: Recurrence
	target?: HabitTarget
}

interface Reading {
	target?: HabitTarget
	repeat?: RepeatReading
	day?: DayReading
	time?: string
}

/** How far ahead a month and a day are looked for before the line is left as it is: 29 February needs a leap year. */
const YEARS_AHEAD = 8

function placeDay(reading: DayReading, today: string, weekStart: WeekStart): string | null {
	switch (reading.kind) {
		case 'offset':
			return addDays(today, reading.days)
		case 'weekday': {
			const ahead = (WEEKDAYS.indexOf(reading.weekday) - WEEKDAYS.indexOf(weekdayOf(today)) + 7) % 7
			return addDays(today, ahead || 7)
		}
		case 'nextWeek':
			return addDays(weekStartOf(today, weekStart), 7)
		case 'monthDay': {
			const year = Number(today.slice(0, 4))
			const rest = `${String(reading.month).padStart(2, '0')}-${String(reading.date).padStart(2, '0')}`
			for (let y = year; y < year + YEARS_AHEAD; y += 1) {
				const day = `${y}-${rest}`
				if (isDay(day) && day >= today) return day
			}
			return null
		}
		case 'date':
			return reading.day
	}
}

function read(text: string, matchers: readonly Matcher[]): { reading: Reading; rest: string } {
	const reading: Reading = {}
	let rest = text
	for (const matcher of matchers) {
		if (reading[matcher.reads] !== undefined) continue
		const match = matcher.pattern.exec(rest)
		if (!match) continue
		const value = matcher.read(match)
		if (value === null) continue
		Object.assign(reading, { [matcher.reads]: value })
		rest = rest.replace(match[0], ' ')
		// a habit is its target and nothing else: the rest of the line is its title
		if (matcher.reads === 'target') break
	}
	return { reading, rest }
}

export function parseTask(text: string, { now, zone, weekStart, lang }: ParseContext): ParsedTask {
	const line = text.trim()
	const today = dateIn(zone, now)
	const { reading, rest } = read(line, vocabulary(lang))
	const title = rest.replace(/\s+/g, ' ').trim() || line

	if (reading.target) return { kind: 'habit', title, target: reading.target }

	const day = reading.day ? placeDay(reading.day, today, weekStart) : null
	if (reading.repeat) {
		const recurrence: Recurrence = { ...reading.repeat, start: day ?? today }
		return { kind: 'routine', title, recurrence, ...(reading.time ? { timeOfDay: reading.time } : {}) }
	}

	if (reading.time) {
		const on = day ?? (instantAt(today, reading.time, zone) > now ? today : addDays(today, 1))
		return { kind: 'todo', title, due: new Date(instantAt(on, reading.time, zone)).toISOString() }
	}
	return { kind: 'todo', title, ...(day ? { due: day } : {}) }
}
