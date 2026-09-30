// Snooze moves a task's due (D-75): later today, tomorrow, or next week. The targets are worked out from now, in
// the owner's zone and from the owner's week start (D-58), as the due the task is patched with.
import { addDays, dateIn, instantAt, timeIn, weekStartOf } from '../dates/days.js'
import type { WeekStart } from '../types/index.js'
import { moveDue } from './rules.js'

export interface SnoozeTargets {
	/** The next full hour plus two, as an instant; absent once that would be tomorrow. */
	later?: string
	tomorrow: string
	/** The first day of next week. */
	nextWeek: string
}

export function snoozeTargets(
	due: string | null,
	now: number,
	zone: string | undefined,
	weekStart: WeekStart
): SnoozeTargets {
	const today = dateIn(zone, now)
	const hour = Number(timeIn(now, zone).slice(0, 2)) + 3
	const later = hour < 24 ? new Date(instantAt(today, `${String(hour).padStart(2, '0')}:00`, zone)) : undefined
	return {
		...(later ? { later: later.toISOString() } : {}),
		tomorrow: moveDue(due, addDays(today, 1), zone),
		nextWeek: moveDue(due, addDays(weekStartOf(today, weekStart), 7), zone),
	}
}
