// What a routine and a habit keep of their days (docs/product/substrate/tasks.md; D-75), as pure functions over
// `progress`: a routine's occurrence on a day is done, skipped or open; a habit tallies by day and is measured over
// its period, a day or the owner's week (D-58). Every change answers a new progress; nothing here writes.
import { addDays, weekStartOf } from '../dates/days.js'
import type { WeekStart } from '../types/index.js'
import type { DayProgress, HabitTarget, TaskProgress } from './types.js'

export type OccurrenceState = 'open' | 'done' | 'skipped'

/** How a routine's occurrence on a day stands. */
export function occurrenceOn(progress: TaskProgress, day: string): { state: OccurrenceState; doneAt: string | null } {
	const entry = progress.days[day]
	if (entry?.done) return { state: 'done', doneAt: entry.done }
	if (entry?.skipped) return { state: 'skipped', doneAt: null }
	return { state: 'open', doneAt: null }
}

function withDay(progress: TaskProgress, day: string, entry: DayProgress): TaskProgress {
	const days = { ...progress.days }
	if (Object.keys(entry).length) days[day] = entry
	else delete days[day]
	return { days }
}

/** The day marked done at an instant; a skip on that day is lifted. */
export function markDone(progress: TaskProgress, day: string, at: string): TaskProgress {
	const { skipped: _skipped, ...rest } = progress.days[day] ?? {}
	return withDay(progress, day, { ...rest, done: at })
}

/** The day marked skipped; nothing done that day is kept. */
export function markSkipped(progress: TaskProgress, day: string): TaskProgress {
	const { done: _done, ...rest } = progress.days[day] ?? {}
	return withDay(progress, day, { ...rest, skipped: true })
}

/** The day open again: neither done nor skipped. */
export function reopenDay(progress: TaskProgress, day: string): TaskProgress {
	const { done: _done, skipped: _skipped, ...rest } = progress.days[day] ?? {}
	return withDay(progress, day, rest)
}

/** One more on the day's tally. */
export function addTally(progress: TaskProgress, day: string, by = 1): TaskProgress {
	const entry = progress.days[day] ?? {}
	const count = Math.max(0, (entry.count ?? 0) + by)
	const { count: _count, ...rest } = entry
	return withDay(progress, day, count ? { ...rest, count } : rest)
}

/** The first day of the period a day falls in: the day itself, or its week from the owner's start. */
export function periodStart(target: HabitTarget, day: string, weekStart: WeekStart): string {
	return target.per === 'week' ? weekStartOf(day, weekStart) : day
}

const periodDays = (target: HabitTarget) => (target.per === 'week' ? 7 : 1)

/** The tally of the period that starts on a day. */
function tallyFrom(progress: TaskProgress, start: string, days: number): number {
	let total = 0
	for (let i = 0; i < days; i += 1) total += progress.days[addDays(start, i)]?.count ?? 0
	return total
}

/** The tally of the period a day falls in. */
export function tallyOn(progress: TaskProgress, target: HabitTarget, day: string, weekStart: WeekStart): number {
	return tallyFrom(progress, periodStart(target, day, weekStart), periodDays(target))
}

/**
 * The streak on a day: the periods in a row with the target met, counted back from the period under way. That
 * period counts once it is met and does not break the streak while it is not, as it is not over. Before it, up to
 * `grace` missed periods in a row are forgiven; one more ends the streak. Nothing before the first day tallied counts.
 */
export function streakOn(
	progress: TaskProgress,
	target: HabitTarget,
	grace: number,
	day: string,
	weekStart: WeekStart
): number {
	const tallied = Object.entries(progress.days)
		.filter(([, entry]) => entry.count)
		.map(([at]) => at)
		.sort()
	const first = tallied[0]
	if (!first) return 0
	const days = periodDays(target)
	const floor = periodStart(target, first, weekStart)
	const current = periodStart(target, day, weekStart)
	let streak = 0
	let missed = 0
	for (let start = current; start >= floor; start = addDays(start, -days)) {
		if (tallyFrom(progress, start, days) >= target.count) {
			streak += 1
			missed = 0
		} else if (start !== current) {
			missed += 1
			if (missed > grace) break
		}
	}
	return streak
}
