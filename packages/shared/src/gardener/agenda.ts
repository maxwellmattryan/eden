// What a day holds, as the `agenda` tool answers it (docs/product/substrate/tasks.md, "Gardener tools"), pure: the
// calendar's events, the tasks due and done, the routines that fall on the day and what became of each, and, when
// the days asked for reach today, what is overdue and where the habits stand. A day is the owner's: an instant
// belongs to the day their clock read, never to the date its UTC text begins with. Nothing is materialised, as in
// the Today view (`tasks/today.ts`), whose rules these are over a run of days.
import type { EventRow } from '../data/types.js'
import { addDays, dateIn, instantAt, timeIn } from '../dates/days.js'
import { formatWeekdayOf } from '../dates/index.js'
import { occursOn } from '../recurrence/index.js'
import { occurrenceOn, type OccurrenceState } from '../tasks/progress.js'
import { dueDay, dueTime } from '../tasks/rules.js'
import { todayView } from '../tasks/today.js'
import type { Task } from '../tasks/types.js'
import type { WeekStart } from '../types/index.js'

/** The most days one call answers. */
export const AGENDA_DAYS = 31

export type AgendaEventRow = Pick<EventRow, 'id' | 'kind' | 'title' | 'startAt' | 'endAt' | 'allDay' | 'status'>

export interface AgendaEvent {
	id: string
	title: string
	kind: string
	allDay?: true
	/** `HH:MM` on the owner's clock, on the day it starts. */
	start?: string
	/** `HH:MM`, on the day it ends. */
	end?: string
	/** The first and the last day of an event that runs over several. */
	from?: string
	until?: string
	tentative?: true
}

export interface AgendaTask {
	id: string
	title: string
	kind: 'todo' | 'checklist'
	/** The day it was due, on a task listed as overdue. */
	day?: string
	time?: string
	priority?: 'low' | 'high'
	/** A checklist's items done, of how many. */
	items?: { done: number; total: number }
	/** Not done, and its day has passed. */
	overdue?: true
}

export interface AgendaRoutine {
	id: string
	title: string
	time?: string
	state: OccurrenceState
}

export interface AgendaHabit {
	id: string
	title: string
	/** The tally in the period under way, against the target. */
	count: number
	target: number
	per: 'day' | 'week'
	met: boolean
	streak: number
}

export interface AgendaDay {
	day: string
	weekday: string
	events?: AgendaEvent[]
	due?: AgendaTask[]
	routines?: AgendaRoutine[]
	done?: { id: string; title: string }[]
	weather?: unknown
}

export interface Agenda {
	today: string
	days: AgendaDay[]
	/** Not done and due before the first day asked for; only when the days reach today. */
	overdue?: AgendaTask[]
	/** Where each habit stands in its period; only when the days reach today. */
	habits?: AgendaHabit[]
	/** The weather alerts in force now; only when the days reach today. */
	alerts?: unknown[]
}

export interface AgendaInput {
	tasks: readonly Task[]
	events: readonly AgendaEventRow[]
	/** The first day, `YYYY-MM-DD`, and how many days from it. */
	first: string
	days: number
	now: number
	zone: string | undefined
	weekStart: WeekStart
	/** What Sky holds for a day, by `YYYY-MM-DD`, as the caller shaped it. */
	weather?: Readonly<Record<string, unknown>>
	/** The alerts in force now, as the caller shaped them. */
	alerts?: readonly unknown[]
}

/**
 * The stretch of `startAt` to ask the events for, as the store compares it: text against text, an event kept when
 * it ends at or after `from` and starts at or before `to`. A bare date sorts before every instant of that date, so
 * a day on either side takes in every zone's edges and every all-day event of the first and the last day; `agenda`
 * keeps only what falls on the owner's days.
 */
export function agendaWindow(first: string, days: number): { from: string; to: string } {
	return { from: addDays(first, -1), to: addDays(first, days + 1) }
}

const LOCAL = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?$/

/** An event's edge as an instant: a local date and time read in the owner's zone, anything else as it parses. */
function instantOf(value: string, zone: string | undefined): number {
	const local = LOCAL.exec(value)
	return local ? instantAt(local[1]!, local[2]!, zone) : Date.parse(value)
}

interface Span {
	event: AgendaEventRow
	from: string
	until: string
	start: number | null
	end: number | null
}

/** The days an event covers where the owner is. A timed event's end is not part of it: one that ends at midnight ends that evening. */
function spanOf(event: AgendaEventRow, zone: string | undefined): Span[] {
	if (event.allDay) {
		const from = event.startAt.slice(0, 10)
		const until = event.endAt ? event.endAt.slice(0, 10) : from
		return [{ event, from, until: until < from ? from : until, start: null, end: null }]
	}
	const start = instantOf(event.startAt, zone)
	if (Number.isNaN(start)) return []
	const ends = event.endAt ? instantOf(event.endAt, zone) : NaN
	const end = Number.isNaN(ends) ? null : ends
	const from = dateIn(zone, start)
	return [{ event, from, until: end !== null && end > start ? dateIn(zone, end - 1) : from, start, end }]
}

function eventOn({ event, from, until, start, end }: Span, day: string, zone: string | undefined): AgendaEvent {
	return {
		id: event.id,
		title: event.title,
		kind: event.kind,
		...(event.allDay ? { allDay: true as const } : {}),
		...(start !== null && from === day ? { start: timeIn(start, zone) } : {}),
		...(end !== null && until === day ? { end: timeIn(end, zone) } : {}),
		...(from !== until ? { from, until } : {}),
		...(event.status === 'tentative' ? { tentative: true as const } : {}),
	}
}

/** All-day events first, then what runs on from an earlier day, then by the time each starts. */
const byStart = (a: AgendaEvent, b: AgendaEvent) =>
	Number(!a.allDay) - Number(!b.allDay) || (a.start ?? '').localeCompare(b.start ?? '') || a.id.localeCompare(b.id)

const PRIORITY = { high: 0, none: 1, low: 2 } as const

function taskOf(task: Task, zone: string | undefined, today: string): AgendaTask & { rank: number } {
	const time = task.due ? dueTime(task.due, zone) : null
	const late = task.due !== null && dueDay(task.due, zone) < today
	return {
		id: task.id,
		title: task.title,
		kind: task.kind === 'checklist' ? 'checklist' : 'todo',
		...(time ? { time } : {}),
		...(task.priority !== 'none' ? { priority: task.priority } : {}),
		...(task.items.length
			? { items: { done: task.items.filter((item) => item.done).length, total: task.items.length } }
			: {}),
		...(late ? { overdue: true as const } : {}),
		rank: PRIORITY[task.priority],
	}
}

/** Timed ones first by their time, then by priority, then in the order they were made. */
const byTime = (a: { time?: string; rank?: number; id: string }, b: { time?: string; rank?: number; id: string }) => {
	if (a.time !== b.time) return a.time === undefined ? 1 : b.time === undefined ? -1 : a.time.localeCompare(b.time)
	return (a.rank ?? 0) - (b.rank ?? 0) || a.id.localeCompare(b.id)
}

const unranked = ({ rank: _rank, ...task }: AgendaTask & { rank: number }): AgendaTask => task

/** The days asked for, each with what it holds; a list with nothing in it is left out. */
export function agenda(input: AgendaInput): Agenda {
	const { tasks, events, first, now, zone, weekStart } = input
	const count = Math.min(AGENDA_DAYS, Math.max(1, Math.round(input.days)))
	const today = dateIn(zone, now)
	const range = Array.from({ length: count }, (_, i) => addDays(first, i))
	const last = range.at(-1) ?? first
	const reachesToday = first <= today && today <= last
	const within = (day: string) => day >= first && day <= last

	const spans = events.filter((event) => event.status !== 'cancelled').flatMap((event) => spanOf(event, zone))
	const due = new Map<string, (AgendaTask & { rank: number })[]>()
	const done = new Map<string, { id: string; title: string }[]>()
	const overdue: (AgendaTask & { rank: number })[] = []
	const push = <T>(map: Map<string, T[]>, day: string, value: T) => map.set(day, [...(map.get(day) ?? []), value])

	for (const task of tasks) {
		if (task.kind !== 'todo' && task.kind !== 'checklist') continue
		if (task.done) {
			const at = task.completedAt ? Date.parse(task.completedAt) : NaN
			const day = Number.isNaN(at) ? undefined : dateIn(zone, at)
			if (day && within(day)) push(done, day, { id: task.id, title: task.title })
			continue
		}
		if (task.due === null) continue
		const day = dueDay(task.due, zone)
		if (within(day)) push(due, day, taskOf(task, zone, today))
		else if (reachesToday && day < first) overdue.push({ ...taskOf(task, zone, today), day })
	}

	const routines = tasks.filter((task) => task.kind === 'routine')
	const days = range.map((day): AgendaDay => {
		const on = spans
			.filter((span) => span.from <= day && day <= span.until)
			.map((span) => eventOn(span, day, zone))
			.sort(byStart)
		const falls = routines
			// a routine whose rule cannot be read is on today alone, where it can still be done, skipped or deleted
			.filter((task) => (task.recurrence ? occursOn(task.recurrence, day) : day === today))
			.map((task) => ({
				id: task.id,
				title: task.title,
				...(task.timeOfDay ? { time: task.timeOfDay } : {}),
				state: occurrenceOn(task.progress, day).state,
			}))
			.sort(byTime)
		const dueOn = [...(due.get(day) ?? [])].sort(byTime).map(unranked)
		const doneOn = done.get(day) ?? []
		const weather = input.weather?.[day]
		return {
			day,
			weekday: formatWeekdayOf(day, 'en'),
			...(on.length ? { events: on } : {}),
			...(dueOn.length ? { due: dueOn } : {}),
			...(falls.length ? { routines: falls } : {}),
			...(doneOn.length ? { done: doneOn } : {}),
			...(weather !== undefined ? { weather } : {}),
		}
	})

	const habits: AgendaHabit[] = reachesToday
		? todayView(tasks, now, zone, weekStart).sections.habits.flatMap(({ task, tally }) =>
				tally
					? [
							{
								id: task.id,
								title: task.title,
								count: tally.count,
								target: tally.target.count,
								per: tally.target.per,
								met: tally.met,
								streak: tally.streak,
							},
						]
					: []
			)
		: []
	const sorted = overdue.sort((a, b) => (a.day ?? '').localeCompare(b.day ?? '') || byTime(a, b)).map(unranked)

	return {
		today,
		days,
		...(sorted.length ? { overdue: sorted } : {}),
		...(habits.length ? { habits } : {}),
		...(reachesToday && input.alerts?.length ? { alerts: [...input.alerts] } : {}),
	}
}
