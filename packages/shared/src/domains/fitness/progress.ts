// What Vigor works out of its rows (D-177): the streak, the daily weights and their seven-day average, this week's
// sessions and the next one. Pure: today, the clock and the week start arrive as parameters, so a test chooses them.
// A day is `YYYY-MM-DD`; an instant is an ISO timestamp, read in the device's zone unless one is given.
import { addDays, dateIn, instantAt, weekStartOf } from '../../dates/days.js'
import type { WeekStart } from '../../types/index.js'
import type { BodyMetric, PlannedSession, WorkoutLog } from './types.js'

/** The instant a zone's clock (the device's when none is given) reads a time on a day, as an ISO timestamp. */
export function startAtOf(day: string, time: string, timeZone?: string): string {
	return new Date(instantAt(day, time, timeZone)).toISOString()
}

/** The day an instant falls on in a zone (the device's when none is given). */
export function dayOf(instant: string, timeZone?: string): string {
	return dateIn(timeZone, Date.parse(instant))
}

/**
 * The workout logs in the unbroken run of calendar weeks, from the week start, that each hold at least one log, ending
 * at the current week. The current week does not break the run while it is still empty. No logs, no streak.
 */
export function streak(logs: readonly Pick<WorkoutLog, 'date'>[], weekStart: WeekStart, today: string): number {
	const perWeek = new Map<string, number>()
	for (const log of logs) {
		if (log.date > today) continue
		const week = weekStartOf(log.date, weekStart)
		perWeek.set(week, (perWeek.get(week) ?? 0) + 1)
	}
	let week = weekStartOf(today, weekStart)
	if (!perWeek.has(week)) week = addDays(week, -7)
	let count = 0
	while (perWeek.has(week)) {
		count += perWeek.get(week)!
		week = addDays(week, -7)
	}
	return count
}

export interface DailyWeight {
	day: string
	/** kg. */
	value: number
	/** When it was taken: the last one logged that day. */
	at: string
}

/** The weight of each day that has one, the last one logged that day, oldest first. */
export function dailyWeights(metrics: readonly BodyMetric[], timeZone?: string): DailyWeight[] {
	const byDay = new Map<string, DailyWeight>()
	for (const metric of metrics) {
		if (metric.kind !== 'weight') continue
		const day = dayOf(metric.at, timeZone)
		const held = byDay.get(day)
		if (!held || Date.parse(metric.at) >= Date.parse(held.at))
			byDay.set(day, { day, value: metric.value, at: metric.at })
	}
	return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day))
}

/**
 * The mean of the daily weights over the seven calendar days ending at the latest one; days without a weight are
 * skipped. Nothing without a weight.
 */
export function sevenDayAverage(weights: readonly Pick<DailyWeight, 'day' | 'value'>[]): number | undefined {
	const latest = weights.reduce<string | undefined>(
		(last, weight) => (!last || weight.day > last ? weight.day : last),
		undefined
	)
	if (!latest) return undefined
	const from = addDays(latest, -6)
	const window = weights.filter((weight) => weight.day >= from && weight.day <= latest)
	return window.reduce((sum, weight) => sum + weight.value, 0) / window.length
}

/** A planned session done: a log names it. */
export function isDone(session: Pick<PlannedSession, 'id'>, logs: readonly Pick<WorkoutLog, 'sessionId'>[]): boolean {
	return logs.some((log) => log.sessionId === session.id)
}

export interface WeekSession {
	id: string
	title: string
	day: string
	/** The planned instant; none for a log. */
	startAt?: string
	done: boolean
}

/**
 * This calendar week's sessions, from the week start: every log of the week, done, and every planned session of the
 * week that no log names, planned. In day order.
 */
export function weekSessions(
	logs: readonly WorkoutLog[],
	sessions: readonly PlannedSession[],
	weekStart: WeekStart,
	today: string,
	timeZone?: string
): { sessions: WeekSession[]; done: number; total: number } {
	const from = weekStartOf(today, weekStart)
	const to = addDays(from, 6)
	const inWeek = (day: string) => day >= from && day <= to
	const done: WeekSession[] = logs
		.filter((log) => inWeek(log.date))
		.map((log) => ({ id: log.id, title: log.title, day: log.date, done: true }))
	const planned: WeekSession[] = sessions
		.filter((session) => !isDone(session, logs))
		.map((session) => ({
			id: session.id,
			title: session.title,
			day: dayOf(session.startAt, timeZone),
			startAt: session.startAt,
			done: false,
		}))
		.filter((session) => inWeek(session.day))
	const all = [...done, ...planned].sort(
		(a, b) => a.day.localeCompare(b.day) || (a.startAt ?? '').localeCompare(b.startAt ?? '')
	)
	return { sessions: all, done: done.length, total: all.length }
}

/** The planned sessions still to come that no log names, soonest first. */
export function upcomingSessions(
	sessions: readonly PlannedSession[],
	now: number,
	logs: readonly Pick<WorkoutLog, 'sessionId'>[] = []
): PlannedSession[] {
	return sessions
		.filter((session) => Date.parse(session.startAt) >= now && !isDone(session, logs))
		.sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))
}

/** The next planned session still to come, or nothing. */
export function nextSession(
	sessions: readonly PlannedSession[],
	now: number,
	logs: readonly Pick<WorkoutLog, 'sessionId'>[] = []
): PlannedSession | undefined {
	return upcomingSessions(sessions, now, logs)[0]
}

/** The session planned for a template on a day that no log names yet: what a log of that day is done for. */
export function sessionFor(
	sessions: readonly PlannedSession[],
	templateId: string | undefined,
	day: string,
	logs: readonly Pick<WorkoutLog, 'sessionId'>[],
	timeZone?: string
): PlannedSession | undefined {
	if (!templateId) return undefined
	return sessions.find(
		(session) => session.templateId === templateId && dayOf(session.startAt, timeZone) === day && !isDone(session, logs)
	)
}
