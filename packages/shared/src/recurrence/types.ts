// A recurrence as it is stored in a row's `recurrence` field (docs/product/substrate/tasks.md, "Recurrence"; D-75):
// an RRULE subset, as plain JSON. A Task carries one today; an Event will (Almanac).

export const FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'] as const
export type Frequency = (typeof FREQUENCIES)[number]

/** The days of the week, from Monday, as RRULE abbreviates them. */
export const WEEKDAYS = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'] as const
export type Weekday = (typeof WEEKDAYS)[number]

export interface Recurrence {
	freq: Frequency
	/** The first day it may fall on, `YYYY-MM-DD`; a monthly or a yearly rule takes its day from it. */
	start: string
	/** Every so many days, weeks, months or years; one when it is left out. */
	interval?: number
	/** For `weekly`: the days it falls on; the weekday of `start` when it is left out. */
	weekdays?: Weekday[]
	/** The last day it may fall on, `YYYY-MM-DD`. */
	until?: string
	/** How many occurrences there are, the first included. */
	count?: number
}
