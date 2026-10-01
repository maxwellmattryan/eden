// A task as the Gardener drafts it (docs/product/substrate/tasks.md, "Gardener tools"), pure: the fields a draft
// card carries, the recurrence a model's plain words for one become, and the row the draft creates when the owner
// keeps it. The kind follows what the draft holds, as a line added on Today does (`parse.ts`): a target makes a
// habit, a recurrence a routine, and anything else a todo.
import type { TaskInput } from '../data/types.js'
import { instantAt } from '../dates/days.js'
import { isDay, parseRecurrence, type Frequency, type Recurrence } from '../recurrence/index.js'
import { isTime, type HabitTarget } from './types.js'

export interface DraftTask {
	title: string
	/** The day a todo is due, `YYYY-MM-DD`; with none it lands on today when kept. A routine starts on it. */
	due?: string
	/** `HH:MM` on the owner's clock: part of a todo's due, a routine's time of day. */
	timeOfDay?: string
	priority?: 'low' | 'high'
	notes?: string
	/** With it the draft is a routine. */
	recurrence?: Recurrence
	/** With it the draft is a habit. */
	target?: HabitTarget
}

/** How often a drafted routine repeats, in the words a tool's input uses. */
export const REPEAT_EVERY = ['day', 'week', 'month', 'year'] as const

const FREQUENCY: Record<(typeof REPEAT_EVERY)[number], Frequency> = {
	day: 'daily',
	week: 'weekly',
	month: 'monthly',
	year: 'yearly',
}

/**
 * The recurrence a tool's `repeat` means, from the day it starts on: `{ every, interval?, weekdays? }`. `null` for
 * anything that does not read as one, so a rule is never half applied.
 */
export function repeatOf(input: unknown, start: string): Recurrence | null {
	if (typeof input !== 'object' || input === null || Array.isArray(input)) return null
	const { every, interval, weekdays } = input as Record<string, unknown>
	const freq = typeof every === 'string' ? FREQUENCY[every as keyof typeof FREQUENCY] : undefined
	if (!freq) return null
	return parseRecurrence({
		freq,
		start,
		...(interval !== undefined && interval !== null ? { interval } : {}),
		// the days of the week belong to a weekly rule alone
		...(freq === 'weekly' && weekdays !== undefined && weekdays !== null ? { weekdays } : {}),
	})
}

/**
 * The row a kept draft creates. A todo with no day is due today, as a line added on Today is, and its time is part
 * of its due; a routine and a habit have no due, and a routine keeps its time of day.
 */
export function taskFromDraft(draft: DraftTask, today: string, zone: string | undefined): TaskInput {
	const time = isTime(draft.timeOfDay) ? draft.timeOfDay : undefined
	const notes = draft.notes ? { notes: draft.notes } : {}
	if (draft.target) return { kind: 'habit', title: draft.title, target: draft.target, ...notes }
	if (draft.recurrence)
		return {
			kind: 'routine',
			title: draft.title,
			recurrence: draft.recurrence,
			...(time ? { timeOfDay: time } : {}),
			...notes,
		}
	const day = isDay(draft.due) ? draft.due : today
	return {
		kind: 'todo',
		title: draft.title,
		due: time ? new Date(instantAt(day, time, zone)).toISOString() : day,
		priority: draft.priority ?? 'none',
		...notes,
	}
}
