// What a parsed line and a stored rule say, as kinds and values a view puts words to: the quick-add chips (the
// title, when, a repeat, a target) and the shape of a recurrence. No words live here; the view translates.
import { WEEKDAYS, type Recurrence, type Weekday, weekdayOf } from '../recurrence/index.js'
import type { ParsedTask } from './parse.js'
import { dueDay, dueTime } from './rules.js'
import type { HabitTarget } from './types.js'

/** A recurrence in the terms a sentence needs: its frequency, its interval and, for a weekly one, its days. */
export interface RepeatDescription {
	freq: Recurrence['freq']
	interval: number
	/** For a weekly rule: the days it falls on, Monday first; the start's day when the rule names none. */
	weekdays: Weekday[]
}

export const WORKDAYS: readonly Weekday[] = ['mo', 'tu', 'we', 'th', 'fr']

export function describeRecurrence(rule: Recurrence): RepeatDescription {
	const named = rule.weekdays?.length ? rule.weekdays : [weekdayOf(rule.start)]
	return {
		freq: rule.freq,
		interval: rule.interval ?? 1,
		weekdays: rule.freq === 'weekly' ? [...WEEKDAYS].filter((day) => named.includes(day)) : [],
	}
}

/** Whether a weekly rule falls on the five working days and no other. */
export function isWorkdays(weekdays: readonly Weekday[]): boolean {
	return weekdays.length === WORKDAYS.length && WORKDAYS.every((day) => weekdays.includes(day))
}

export type TaskChip =
	| { kind: 'title'; title: string }
	| { kind: 'when'; day: string; time: string | null }
	| { kind: 'time'; time: string }
	| { kind: 'repeat'; repeat: RepeatDescription }
	| { kind: 'target'; target: HabitTarget }

/** The chips a parsed line shows before it is saved: the title first, then what was read from it. */
export function taskChips(parsed: ParsedTask, zone: string | undefined): TaskChip[] {
	const chips: TaskChip[] = [{ kind: 'title', title: parsed.title }]
	if (parsed.due) chips.push({ kind: 'when', day: dueDay(parsed.due, zone), time: dueTime(parsed.due, zone) })
	if (parsed.timeOfDay) chips.push({ kind: 'time', time: parsed.timeOfDay })
	if (parsed.recurrence) chips.push({ kind: 'repeat', repeat: describeRecurrence(parsed.recurrence) })
	if (parsed.target) chips.push({ kind: 'target', target: parsed.target })
	return chips
}
