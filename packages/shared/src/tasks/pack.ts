// What the Gardener's context pack carries of the tasks in a conversation: every live task would be every todo ever
// done and every day a routine was ever done on, and a request should not pay for that when the `agenda` tool
// answers any day on demand. The pack gets what is open, the todos done in the last week, and a routine's and a
// habit's last two weeks of days, each in the row's own shape. Named after `weather/pack.ts`, which does the same
// for the forecast (D-85).
import { addDays, dateIn } from '../dates/days.js'

/** How many days back a done todo is still carried. */
export const PACK_DONE_DAYS = 7
/** How many days of a routine's or a habit's progress are carried. */
export const PACK_PROGRESS_DAYS = 14

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

/** The row with its progress cut to the days from `since` on; a row with no readable progress is as it was. */
function recent<Row>(row: Row, since: string): Row {
	const progress = (row as { progress?: unknown }).progress
	if (!isObject(progress) || !isObject(progress.days)) return row
	const days = Object.fromEntries(Object.entries(progress.days).filter(([day]) => day >= since))
	return { ...row, progress: { ...progress, days } }
}

/**
 * The task rows a conversation's pack carries. A row in `keep` (what the conversation is about) always stays; a
 * todo or a checklist done longer ago than a week goes, by the day it was done on where the owner is, and one done
 * with no time kept goes too, since nothing says it is recent.
 */
export function tasksForPack<Row extends { uri: string }>(
	rows: readonly Row[],
	now: number,
	zone: string | undefined,
	keep: ReadonlySet<string> = new Set()
): Row[] {
	const today = dateIn(zone, now)
	const doneSince = addDays(today, -PACK_DONE_DAYS)
	const progressSince = addDays(today, -PACK_PROGRESS_DAYS)
	return rows.flatMap((row) => {
		const { done, completedAt } = row as { done?: unknown; completedAt?: unknown }
		if (done === true && !keep.has(row.uri)) {
			const at = typeof completedAt === 'string' ? Date.parse(completedAt) : NaN
			if (Number.isNaN(at) || dateIn(zone, at) < doneSince) return []
		}
		return [recent(row, progressSince)]
	})
}
