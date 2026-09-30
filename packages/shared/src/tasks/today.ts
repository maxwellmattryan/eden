// The Today view (docs/product/substrate/tasks.md, "Today view"; D-75) as a pure function of the live tasks, the
// instant, the owner's zone and the week start: the four sections in their order, the counts the Garden tile shows
// and its top three. Nothing is materialised: a routine is on the list because its recurrence falls today, a habit
// every day, a todo because its due day is today or has passed.
import { dateIn, timeIn } from '../dates/days.js'
import { occursOn } from '../recurrence/index.js'
import type { WeekStart } from '../types/index.js'
import { occurrenceOn, streakOn, tallyOn } from './progress.js'
import { dueDay, dueTime, isOverdue } from './rules.js'
import type { HabitTarget, Task } from './types.js'

export type TodaySection = 'overdue' | 'due' | 'routines' | 'habits'
export const TODAY_SECTIONS: readonly TodaySection[] = ['overdue', 'due', 'routines', 'habits']

export interface TodayItem {
	task: Task
	section: TodaySection
	/** The day a todo or a checklist is or was due. */
	day: string | null
	/** Its time on the owner's clock, `HH:MM`: a due's, or a routine's time of day. */
	time: string | null
	/** Timed for today, and that time has passed. */
	late: boolean
	/** A routine's occurrence today: done stays on the list, struck through. */
	done: boolean
	doneAt: string | null
	/** A checklist's items done, and how many there are. */
	items: { done: number; total: number } | null
	/** A habit's tally in the period under way against its target, and its streak. */
	tally: { count: number; target: HabitTarget; met: boolean; streak: number } | null
}

export interface TodayView {
	/** Today, in the zone. */
	day: string
	sections: Record<TodaySection, TodayItem[]>
	counts: { overdue: number; due: number }
	/** The first three of what is overdue, due and on the routines, for the Garden tile. */
	top: TodayItem[]
}

const TOP = 3
const PRIORITY = { high: 0, none: 1, low: 2 } as const

const item = (task: Task, section: TodaySection, fields: Partial<TodayItem> = {}): TodayItem => ({
	task,
	section,
	day: null,
	time: null,
	late: false,
	done: false,
	doneAt: null,
	items: null,
	tally: null,
	...fields,
})

const itemsOf = (task: Task) =>
	task.items.length ? { done: task.items.filter((entry) => entry.done).length, total: task.items.length } : null

/** Timed ones first by their time, then by priority, then in the order they were made. */
function byTimeThenPriority(a: TodayItem, b: TodayItem): number {
	if (a.time !== b.time) return a.time === null ? 1 : b.time === null ? -1 : a.time.localeCompare(b.time)
	return PRIORITY[a.task.priority] - PRIORITY[b.task.priority] || a.task.id.localeCompare(b.task.id)
}

export function todayView(
	tasks: readonly Task[],
	now: number,
	zone: string | undefined,
	weekStart: WeekStart
): TodayView {
	const day = dateIn(zone, now)
	const clock = timeIn(now, zone)
	const sections: Record<TodaySection, TodayItem[]> = { overdue: [], due: [], routines: [], habits: [] }

	for (const task of tasks) {
		if (task.kind === 'todo' || task.kind === 'checklist') {
			if (task.done || task.due === null) continue
			const dueOn = dueDay(task.due, zone)
			const time = dueTime(task.due, zone)
			if (isOverdue(task, day, zone)) {
				sections.overdue.push(item(task, 'overdue', { day: dueOn, time, items: itemsOf(task) }))
			} else if (dueOn === day) {
				const late = time !== null && Date.parse(task.due) <= now
				sections.due.push(item(task, 'due', { day: dueOn, time, late, items: itemsOf(task) }))
			}
		} else if (task.kind === 'routine') {
			// a routine whose rule cannot be read shows every day, so it can still be done, skipped or deleted
			if (task.recurrence && !occursOn(task.recurrence, day)) continue
			const { state, doneAt } = occurrenceOn(task.progress, day)
			if (state === 'skipped') continue
			// a routine past its time is late, never overdue: it stays here, and tomorrow's occurrence is its own
			const time = task.timeOfDay
			const late = state === 'open' && time !== null && time <= clock
			sections.routines.push(item(task, 'routines', { time, late, done: state === 'done', doneAt }))
		} else if (task.kind === 'habit' && task.target) {
			const count = tallyOn(task.progress, task.target, day, weekStart)
			const streak = streakOn(task.progress, task.target, task.grace, day, weekStart)
			const tally = { count, target: task.target, met: count >= task.target.count, streak }
			sections.habits.push(item(task, 'habits', { tally }))
		}
	}

	sections.overdue.sort((a, b) => (a.day ?? '').localeCompare(b.day ?? '') || byTimeThenPriority(a, b))
	sections.due.sort(byTimeThenPriority)
	sections.routines.sort(byTimeThenPriority)
	sections.habits.sort((a, b) => a.task.id.localeCompare(b.task.id))

	return {
		day,
		sections,
		counts: { overdue: sections.overdue.length, due: sections.due.length },
		top: [...sections.overdue, ...sections.due, ...sections.routines].slice(0, TOP),
	}
}
