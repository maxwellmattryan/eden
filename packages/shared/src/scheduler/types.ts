// The scheduler's shapes (docs/product/substrate/signals-notifications.md, "Scheduler"; D-73), the same ones the
// crate keeps (`src-tauri/src/substrate/scheduler.rs`).

export type ScheduleKind = 'once' | 'daily' | 'every'

/** The shortest period a schedule repeats at, in seconds. */
export const MIN_EVERY_S = 60

/** A repeating schedule as a manifest declares it: `daily` at a local `HH:MM`, or `every` so many seconds. */
export interface DeclaredSchedule {
	/** Its owner and its id: `weather.alerts`. */
	name: string
	daily?: string
	every?: number
}

/** A schedule that was due, and the instant it was due at, in milliseconds since the epoch. */
export interface FiredSchedule {
	name: string
	dueAt: number
}

/** A schedule as the engine keeps it, a row of the crate's `schedules`. */
export interface ScheduleRow {
	name: string
	kind: ScheduleKind
	dailyAt: string | null
	everyS: number | null
	/** The instant it is next due, in milliseconds since the epoch. */
	nextAt: number
}
