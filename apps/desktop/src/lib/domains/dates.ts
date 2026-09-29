// Date helpers the domain stores and pages share. They live in a plain module so the rune modules never hold a Date
// (svelte/prefer-svelte-reactivity), and so the sample dataset's dates, which are relative to its own "today"
// (design/sample-data.md: Wednesday 2026-09-30), can be shifted onto the real calendar when the data is seeded.

/** The sample dataset's "today". */
export const SAMPLE_TODAY = '2026-09-30'
const DAY = 24 * 60 * 60 * 1000

/** The current instant as an ISO timestamp. */
export function nowIso(): string {
	return new Date().toISOString()
}

/** Today's date as `YYYY-MM-DD` in local time. */
export function todayIso(): string {
	return toIsoDate(new Date())
}

function toIsoDate(date: Date): string {
	const y = date.getFullYear()
	const m = String(date.getMonth() + 1).padStart(2, '0')
	const d = String(date.getDate()).padStart(2, '0')
	return `${y}-${m}-${d}`
}

/** Whole days from today to an ISO date; negative when it has passed. */
export function daysUntil(isoDate: string, from = todayIso()): number {
	return Math.round((Date.parse(isoDate) - Date.parse(from)) / DAY)
}

/** An ISO date `days` from today. */
export function daysFromToday(days: number): string {
	return toIsoDate(new Date(Date.now() + days * DAY))
}

/**
 * A sample date (`MM-DD` in the dataset's year, `YYYY-MM` for a month, or a full ISO date) shifted so that it keeps
 * its distance from the dataset's "today": "spinach expires tomorrow" stays true whenever the seed runs.
 */
export function shiftSampleDate(sample: string): string {
	const full = /^\d{4}-\d{2}-\d{2}$/.test(sample)
		? sample
		: /^\d{4}-\d{2}$/.test(sample)
			? `${sample}-01`
			: `${SAMPLE_TODAY.slice(0, 4)}-${sample}`
	const offset = Math.round((Date.parse(full) - Date.parse(SAMPLE_TODAY)) / DAY)
	return daysFromToday(offset)
}

/** `HH:MM` in the locale, 24-hour. */
export function formatTime(iso: string, lang: string): string {
	return new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))
}

/** `MM-DD`, the short form the sample data and the lists use. */
export function formatDay(isoDate: string, lang: string): string {
	return new Intl.DateTimeFormat(lang, { month: '2-digit', day: '2-digit' }).format(new Date(`${isoDate}T12:00:00`))
}

/** The full weekday name. */
export function formatWeekday(iso: string, lang: string): string {
	return new Intl.DateTimeFormat(lang, { weekday: 'long' }).format(new Date(iso))
}

/** The full date line for a page subtitle: "Wednesday 30 September". */
export function formatDate(iso: string, lang: string): string {
	return new Intl.DateTimeFormat(lang, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso))
}

/** Whether an instant fell today, yesterday, or earlier, in local time. */
export function relativeDay(iso: string): 'today' | 'yesterday' | 'earlier' {
	const day = toIsoDate(new Date(iso))
	if (day === todayIso()) return 'today'
	if (day === daysFromToday(-1)) return 'yesterday'
	return 'earlier'
}
