// The rules of the scheduler, the same ones the crate enforces (`src-tauri/src/substrate/scheduler.rs`): what a
// schedule may be named and declared as, when a new one is first due, and how one moves on when it is taken. The
// engine applies them in a plain browser; the client asks them before it sends a write. The time is always handed
// in. A daily time the clocks skip or repeat is read here as the platform's `Date` reads it, which a preview can
// live with; the crate is exact about both.
import { MIN_EVERY_S, type DeclaredSchedule, type FiredSchedule, type ScheduleRow } from './types.js'

/** The refusal's code (`schedule:invalid`) and why. */
export type Refusal = [code: string, detail: string]

const ID = '[a-z][a-z0-9]*(?:-[a-z0-9]+)*'
const NAME = new RegExp(`^${ID}\\.${ID}$`)
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/

const invalid = (detail: string): Refusal => ['schedule:invalid', detail]

/** A schedule's name is its owner and its id, each a plain id: `weather.alerts`, `kitchen.shop-day`. */
export function checkName(name: string): Refusal | undefined {
	return NAME.test(name) ? undefined : invalid(`not a schedule name: ${JSON.stringify(name)}`)
}

/** Why a declaration does not hold, or nothing. */
export function validateDeclared(declared: readonly DeclaredSchedule[]): Refusal | undefined {
	const seen = new Set<string>()
	for (const schedule of declared) {
		const name = checkName(schedule.name)
		if (name) return name
		if (seen.has(schedule.name)) return invalid(`declared twice: ${JSON.stringify(schedule.name)}`)
		seen.add(schedule.name)
		const { daily, every } = schedule
		if ((daily == null) === (every == null)) {
			return invalid(`${JSON.stringify(schedule.name)} is daily or every, one of the two`)
		}
		if (daily != null && !TIME.test(daily)) return invalid(`not a time of day: ${JSON.stringify(daily)}`)
		if (every != null && !(Number.isInteger(every) && every >= MIN_EVERY_S)) {
			return invalid(`${JSON.stringify(schedule.name)} repeats every ${every} s; the least is ${MIN_EVERY_S}`)
		}
	}
	return undefined
}

/** Why a one-shot cannot be set, or nothing: a repeating schedule's name is not a one-shot's to take. */
export function validateOnce(rows: readonly ScheduleRow[], name: string, atMs: number): Refusal | undefined {
	const bad = checkName(name)
	if (bad) return bad
	if (!(Number.isInteger(atMs) && atMs >= 0)) return invalid(`not an instant: ${atMs}`)
	if (rows.some((row) => row.name === name && row.kind !== 'once')) {
		return invalid(`${JSON.stringify(name)} is a repeating schedule`)
	}
	return undefined
}

/** The instant the local clock reads `time` on the day of `atMs`, or so many days on. */
export function onDay(atMs: number, time: string, days = 0): number {
	const [hours = 0, minutes = 0] = time.split(':').map(Number)
	const day = new Date(atMs)
	return new Date(day.getFullYear(), day.getMonth(), day.getDate() + days, hours, minutes).getTime()
}

/** The first time the local clock reads `time` after `nowMs`. */
export function dailyAfter(nowMs: number, time: string): number {
	for (const days of [0, 1, 2]) {
		const at = onDay(nowMs, time, days)
		if (at > nowMs) return at
	}
	return nowMs + 24 * 60 * 60 * 1000
}

/**
 * The schedules once the repeating ones are what the manifests declare. One declared as it already stands keeps the
 * instant it is due at. A new one starts today: a `daily` at its time, which is due at once when that has passed,
 * and an `every` now. A repeating schedule that is no longer declared goes; the one-shots are not touched.
 */
export function declare(
	rows: readonly ScheduleRow[],
	declared: readonly DeclaredSchedule[],
	nowMs: number
): ScheduleRow[] {
	const next = rows.filter((row) => row.kind === 'once' && !declared.some((schedule) => schedule.name === row.name))
	for (const schedule of declared) {
		const row: ScheduleRow =
			schedule.daily != null
				? {
						name: schedule.name,
						kind: 'daily',
						dailyAt: schedule.daily,
						everyS: null,
						nextAt: onDay(nowMs, schedule.daily),
					}
				: { name: schedule.name, kind: 'every', dailyAt: null, everyS: schedule.every ?? null, nextAt: nowMs }
		const kept = rows.find((entry) => entry.name === row.name)
		const unchanged = kept && kept.kind === row.kind && kept.dailyAt === row.dailyAt && kept.everyS === row.everyS
		next.push(unchanged ? kept : row)
	}
	return next
}

/** The schedules with a one-shot set for an instant, or moved to it. */
export function setOnce(rows: readonly ScheduleRow[], name: string, atMs: number): ScheduleRow[] {
	return [...rows.filter((row) => row.name !== name), { name, kind: 'once', dailyAt: null, everyS: null, nextAt: atMs }]
}

/**
 * What is due now, the longest overdue first, and the schedules once each is moved on: a one-shot is gone, a `daily`
 * is next due the first time its hour comes after now, an `every` a period from now, so a schedule that missed ten
 * periods is due once and not ten times.
 */
export function takeDue(rows: readonly ScheduleRow[], nowMs: number): { rows: ScheduleRow[]; fired: FiredSchedule[] } {
	const due = rows
		.filter((row) => row.nextAt <= nowMs)
		.sort((a, b) => a.nextAt - b.nextAt || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
	const next: ScheduleRow[] = []
	for (const row of rows) {
		if (row.nextAt > nowMs) next.push(row)
		else if (row.kind === 'daily' && row.dailyAt != null) next.push({ ...row, nextAt: dailyAfter(nowMs, row.dailyAt) })
		else if (row.kind === 'every' && row.everyS != null) next.push({ ...row, nextAt: nowMs + row.everyS * 1000 })
	}
	return { rows: next, fired: due.map((row) => ({ name: row.name, dueAt: row.nextAt })) }
}
