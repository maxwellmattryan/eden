// The rules of a task (docs/product/substrate/tasks.md; D-75), pure. When a task is due, in the owner's zone; what
// overdue means; what each thing the owner does on Today changes in the row, as the fields it sets, so the store
// shows the change, writes the same fields and keeps the way back; and the two signals an owner's action emits. The
// Today view (`today.ts`) reads these; the parser (`parse.ts`) makes the input a new task is created from.
import type { TaskInput, TaskItem, TaskKind } from '../data/types.js'
import { dateIn, instantAt, timeIn } from '../dates/days.js'
import type { SubstrateSignal } from '../signals/types.js'
import type { WeekStart } from '../types/index.js'
import type { ParsedTask } from './parse.js'
import { addTally, markDone, markSkipped, periodStart, reopenDay, streakOn, tallyOn } from './progress.js'
import type { Task, TaskProgress } from './types.js'

/** The fields an action on Today, or an edit, sets; the same keys as a patch of the row. */
export type TaskChange = Partial<
	Pick<
		Task,
		'title' | 'notes' | 'priority' | 'timeOfDay' | 'due' | 'done' | 'completedAt' | 'items' | 'progress' | 'streak'
	>
>

/** What an edit may rewrite of a task; a field left out stays as it is. */
export interface TaskEdit {
	title?: string
	/** The day it moves to, `YYYY-MM-DD`: a todo's or a checklist's. */
	due?: string
	/** `HH:MM` on the owner's clock, or an empty string for no time. */
	timeOfDay?: string
	priority?: Task['priority']
	/** An empty string clears them. */
	notes?: string
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/** Whether a due is a day alone, with no time. */
export function isDateOnly(due: string): boolean {
	return DATE_ONLY.test(due)
}

/** The day a due falls on, in the zone: the date itself, or the instant's day where the owner is. */
export function dueDay(due: string, zone: string | undefined): string {
	return isDateOnly(due) ? due : dateIn(zone, Date.parse(due))
}

/** The time of a due on the zone's clock, `HH:MM`, or `null` for a day alone. */
export function dueTime(due: string, zone: string | undefined): string | null {
	return isDateOnly(due) ? null : timeIn(Date.parse(due), zone)
}

/** The same due moved to another day: a day stays a day, and a time keeps its time of day on the new one. */
export function moveDue(due: string | null, day: string, zone: string | undefined): string {
	if (due === null || isDateOnly(due)) return day
	return new Date(instantAt(day, timeIn(Date.parse(due), zone), zone)).toISOString()
}

/** Overdue: a todo or a checklist that is not done and was due on a day before today. A timed task due today is not. */
export function isOverdue(task: Task, today: string, zone: string | undefined): boolean {
	if (task.kind !== 'todo' && task.kind !== 'checklist') return false
	return !task.done && task.due !== null && dueDay(task.due, zone) < today
}

/** The row a line added on Today creates: a todo with no date is due today; a routine's and a habit's due stay null. */
export function addedToday(parsed: ParsedTask, today: string): TaskInput {
	return {
		kind: parsed.kind,
		title: parsed.title,
		...(parsed.kind === 'todo' ? { due: parsed.due ?? today } : {}),
		...(parsed.timeOfDay ? { timeOfDay: parsed.timeOfDay } : {}),
		...(parsed.recurrence ? { recurrence: parsed.recurrence } : {}),
		...(parsed.target ? { target: parsed.target } : {}),
	}
}

/** Done: a todo or a checklist whole (every item with it), a routine's occurrence on the day. */
export function completion(task: Task, day: string, at: string): TaskChange {
	if (task.kind === 'routine') return { progress: markDone(task.progress, day, at) }
	const items: TaskItem[] = task.items.map((item) => ({ ...item, done: true }))
	return { done: true, completedAt: at, ...(task.items.length ? { items } : {}) }
}

/** Skipped today: the routine's occurrence, which leaves the list without counting against it. */
export function skip(task: Task, day: string): TaskChange {
	return { progress: markSkipped(task.progress, day) }
}

/**
 * Open again: a routine's occurrence on the day, done or skipped, and a todo or a checklist that was done, with
 * every item of the checklist open, since Done finished them all.
 */
export function reopened(task: Task, day: string): TaskChange {
	if (task.kind === 'routine') return { progress: reopenDay(task.progress, day) }
	const items: TaskItem[] = task.items.map((item) => ({ ...item, done: false }))
	return { done: false, completedAt: null, ...(task.items.length ? { items } : {}) }
}

/**
 * An edit as the fields it sets. A todo's and a checklist's time is part of its due, so a new day keeps the time
 * it had and a new time keeps its day, today when it had none; a routine's time is its own field and it has no
 * due, and a habit has neither. What does not apply to the task's kind is left out.
 */
export function edited(task: Task, edit: TaskEdit, today: string, zone: string | undefined): TaskChange {
	const change: TaskChange = {}
	if (edit.title?.trim()) change.title = edit.title.trim()
	if (edit.notes !== undefined) change.notes = edit.notes.trim() || null
	if (edit.priority !== undefined) change.priority = edit.priority
	if (task.kind === 'routine') {
		if (edit.timeOfDay !== undefined) change.timeOfDay = edit.timeOfDay || null
		return change
	}
	if (task.kind === 'habit' || (edit.due === undefined && edit.timeOfDay === undefined)) return change
	const day = edit.due ?? (task.due ? dueDay(task.due, zone) : today)
	const time = edit.timeOfDay ?? (task.due ? dueTime(task.due, zone) : null)
	change.due = time ? new Date(instantAt(day, time, zone)).toISOString() : day
	return change
}

/** One more on the habit's tally today, with its streak recomputed and written beside it. */
export function tallied(task: Task, day: string, weekStart: WeekStart): TaskChange {
	const progress: TaskProgress = addTally(task.progress, day)
	const streak = task.target ? streakOn(progress, task.target, task.grace, day, weekStart) : task.streak
	return { progress, streak }
}

/** The way back from a change: the same fields as the task holds them now. */
export function inverseOf(task: Task, change: TaskChange): TaskChange {
	const back: TaskChange = {}
	for (const key of Object.keys(change) as (keyof TaskChange)[]) {
		Object.assign(back, { [key]: task[key] })
	}
	return back
}

/** The most of a title a signal carries: a long one could otherwise pass the payload's limit. */
export const SIGNAL_TITLE_CHARS = 200

/** What a task signal is emitted as: its name, the payload its readers get, and the key that makes it once. */
export interface TaskSignal {
	name: SubstrateSignal
	payload: { uris: [string]; kind: TaskKind; day: string; title: string }
	dedupeKey: string
}

/** Whether a habit's target is met on the day, by its progress. */
export function targetMet(task: Task, day: string, weekStart: WeekStart): boolean {
	return task.target !== null && tallyOn(task.progress, task.target, day, weekStart) >= task.target.count
}

/**
 * The signal for an owner's action (D-75): `task.created` when a task is made, keyed by its id; `task.completed`
 * when a todo, a checklist or a routine is done, keyed by the id and the day, and when a habit meets its target,
 * keyed by the id and the first day of the period, so a second tally that period changes nothing. An undo retracts
 * nothing: the signal said what happened, and a repeat the same day is dropped by its key.
 */
export function taskSignal(name: SubstrateSignal, task: Task, day: string, weekStart: WeekStart): TaskSignal {
	const period = task.kind === 'habit' && task.target ? periodStart(task.target, day, weekStart) : day
	return {
		name,
		payload: { uris: [task.uri], kind: task.kind, day, title: [...task.title].slice(0, SIGNAL_TITLE_CHARS).join('') },
		dedupeKey: name === 'task.created' ? task.id : `${task.id}:${period}`,
	}
}
