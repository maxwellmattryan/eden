// A Task as the frontend reads it (docs/product/substrate/tasks.md; D-75). The row's `recurrence`, `target` and
// `progress` are JSON the crate holds without reading; their shapes are these, and what is malformed reads as `null`.
import type { TaskItem, TaskKind, TaskRow } from '../data/types.js'
import { isDay, parseRecurrence, type Recurrence } from '../recurrence/index.js'

/** What a habit aims for: so many times in a day or a week. */
export interface HabitTarget {
	count: number
	per: 'day' | 'week'
}

/** What happened on one day: a routine done (the instant) or skipped, a habit's tally. */
export interface DayProgress {
	done?: string
	skipped?: true
	count?: number
}

/** A routine's and a habit's days, by `YYYY-MM-DD`. Occurrences are computed; only what the owner did is kept. */
export interface TaskProgress {
	days: Record<string, DayProgress>
}

/** A task row with its JSON fields read. */
export interface Task {
	id: string
	uri: string
	kind: TaskKind
	title: string
	notes: string | null
	/** A date (`YYYY-MM-DD`) or an instant; a routine's and a habit's stay `null`. */
	due: string | null
	priority: 'none' | 'low' | 'high'
	/** A routine's time on the owner's clock, `HH:MM`. */
	timeOfDay: string | null
	recurrence: Recurrence | null
	items: TaskItem[]
	target: HabitTarget | null
	/** The missed periods in a row a habit's streak survives. */
	grace: number
	streak: number
	progress: TaskProgress
	done: boolean
	completedAt: string | null
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value)
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1

/** Whether a string is a time of day, `HH:MM`. */
export function isTime(value: unknown): value is string {
	return typeof value === 'string' && TIME.test(value)
}

/** Reads a stored target, or `null`. */
export function parseTarget(value: unknown): HabitTarget | null {
	if (!isObject(value) || !isCount(value.count)) return null
	return value.per === 'day' || value.per === 'week' ? { count: value.count, per: value.per } : null
}

/** Reads stored progress, or `null`. A day that is not a date, or holds nothing readable, is left out. */
export function parseProgress(value: unknown): TaskProgress | null {
	if (!isObject(value) || !isObject(value.days)) return null
	const days: TaskProgress['days'] = {}
	for (const [day, entry] of Object.entries(value.days)) {
		if (!isDay(day) || !isObject(entry)) continue
		const read: DayProgress = {
			...(typeof entry.done === 'string' ? { done: entry.done } : {}),
			...(entry.skipped === true ? { skipped: true as const } : {}),
			...(isCount(entry.count) ? { count: entry.count } : {}),
		}
		if (Object.keys(read).length) days[day] = read
	}
	return { days }
}

function parseItems(value: unknown): TaskItem[] {
	if (!Array.isArray(value)) return []
	return value.flatMap((item) =>
		isObject(item) && typeof item.text === 'string' ? [{ text: item.text, done: item.done === true }] : []
	)
}

/** Narrows a row to a task: the JSON fields read, and an empty list or an empty record where there is none. */
export function toTask(row: TaskRow): Task {
	return {
		id: row.id,
		uri: row.uri,
		kind: row.kind,
		title: row.title,
		notes: row.notes,
		due: row.due,
		priority: row.priority,
		timeOfDay: isTime(row.timeOfDay) ? row.timeOfDay : null,
		recurrence: parseRecurrence(row.recurrence),
		items: parseItems(row.items),
		target: parseTarget(row.target),
		grace: isCount(row.grace) ? row.grace : 0,
		streak: row.streak,
		progress: parseProgress(row.progress) ?? { days: {} },
		done: row.done,
		completedAt: row.completedAt,
	}
}
