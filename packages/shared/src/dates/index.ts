// Date helpers both apps' domain stores and pages share. They live in a plain module so the rune modules never hold a
// Date (svelte/prefer-svelte-reactivity), and so the sample dataset's dates, which are relative to its own "today"
// (design/sample-data.md: Wednesday 2026-09-30), can be shifted onto the real calendar when the data is seeded. The
// module is pure: the language, the clock (D-58) and, for the times of a place, its timezone arrive as a `DateFormat`.
import type { ClockFormat } from '../types/index.js'

export * from './days.js'

/** How a date or a time is written: the locale, the owner's clock and, when it is not the device's, the timezone. */
export interface DateFormat {
	lang: string
	clock: ClockFormat
	/** An IANA timezone; the device's when absent. */
	timeZone?: string
}

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

/** Whole days since an ISO date or timestamp; never negative. */
export function daysSince(iso: string): number {
	return Math.max(0, -daysUntil(iso.slice(0, 10)))
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

/** The time of an instant on the owner's clock: `18:05`, or `6:05 PM`. `h23` keeps midnight from reading `24:00`. */
export function formatTime(iso: string | number, format: DateFormat): string {
	const options: Intl.DateTimeFormatOptions =
		format.clock === '12h'
			? { hour: 'numeric', minute: '2-digit', hourCycle: 'h12' }
			: { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }
	return new Intl.DateTimeFormat(format.lang, { ...options, timeZone: format.timeZone }).format(new Date(iso))
}

/** The hour of the day of an instant, 0 to 23, in the timezone given (the device's when absent). */
export function hourOfDay(iso: string | number, timeZone?: string): number {
	const hour = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone }).format(new Date(iso))
	return Number(hour) % 24
}

/** A day and a time, for a moment worth naming whole: `Wed 30 Sep, 19:00`, in the timezone given. */
export function formatMoment(iso: string | number, format: DateFormat): string {
	const day = new Intl.DateTimeFormat(format.lang, {
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		timeZone: format.timeZone,
	}).format(new Date(iso))
	return `${day}, ${formatTime(iso, format)}`
}

/** The hour alone, for a strip of hours: `18`, or `6 PM`. */
export function formatHour(iso: string | number, format: DateFormat): string {
	if (format.clock === '24h') return formatTime(iso, format)
	return new Intl.DateTimeFormat(format.lang, { hour: 'numeric', hourCycle: 'h12', timeZone: format.timeZone }).format(
		new Date(iso)
	)
}

/** `MM-DD`, the short form the sample data and the lists use, the same in every locale. */
export function formatDay(isoDate: string): string {
	return isoDate.slice(5, 10)
}

/** `MM-DD HH:MM` for a timestamp, the form a source line or a shop day takes in a list. */
export function formatDayTime(iso: string, format: DateFormat): string {
	return `${formatDay(iso)} ${formatTime(iso, format)}`
}

/** `Sat 10-03 10:00`: the weekday, the day and the time of an event. */
export function formatEventTime(iso: string, format: DateFormat): string {
	const weekday = new Intl.DateTimeFormat(format.lang, { weekday: 'short' }).format(new Date(iso))
	return `${weekday} ${formatDayTime(iso, format)}`
}

/** A sample timestamp (`MM-DD HH:MM`) shifted like `shiftSampleDate`, keeping its time of day. */
export function shiftSampleDateTime(sample: string): string {
	const [day, time] = sample.split(' ')
	return `${shiftSampleDate(day ?? sample)}T${time ?? '12:00'}:00`
}

/** The full weekday name of an instant or a local ISO date. */
export function formatWeekday(iso: string, lang: string): string {
	return new Intl.DateTimeFormat(lang, { weekday: 'long' }).format(new Date(iso))
}

/** The weekday name of a calendar date (`YYYY-MM-DD`), full or short, whatever timezone the device is in. */
export function formatWeekdayOf(isoDate: string, lang: string, style: 'long' | 'short' = 'long'): string {
	return new Intl.DateTimeFormat(lang, { weekday: style, timeZone: 'UTC' }).format(new Date(`${isoDate}T12:00:00Z`))
}

/** The day of the month of a calendar date (`YYYY-MM-DD`): `30`. */
export function dayOfMonth(isoDate: string): number {
	return Number(isoDate.slice(8, 10))
}

/** The full date line for a page subtitle: "Wednesday 30 September". */
export function formatDate(iso: string, lang: string): string {
	return new Intl.DateTimeFormat(lang, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso))
}

/** A calendar date (`YYYY-MM-DD`) as a short line, "30 Sept", whatever timezone the device is in. */
export function formatDateOf(isoDate: string, lang: string): string {
	return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
		new Date(`${isoDate}T12:00:00Z`)
	)
}

/** Whether an instant fell today, yesterday, or earlier, in local time. */
export function relativeDay(iso: string): 'today' | 'yesterday' | 'earlier' {
	const day = toIsoDate(new Date(iso))
	if (day === todayIso()) return 'today'
	if (day === daysFromToday(-1)) return 'yesterday'
	return 'earlier'
}

export type AgoUnit = 'second' | 'minute' | 'hour' | 'day'
const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE

/**
 * How long ago an instant was, in the coarsest whole unit that fits: seconds under a minute, then minutes, hours and
 * days. An instant still ahead of `now` reads as zero seconds. `now` is passed so a page's ticking clock decides when
 * the age moves on.
 */
export function ago(iso: string | number, now: number): { value: number; unit: AgoUnit } {
	const elapsed = Math.max(0, now - new Date(iso).getTime())
	if (elapsed < MINUTE) return { value: Math.floor(elapsed / 1000), unit: 'second' }
	if (elapsed < HOUR) return { value: Math.floor(elapsed / MINUTE), unit: 'minute' }
	if (elapsed < DAY) return { value: Math.floor(elapsed / HOUR), unit: 'hour' }
	return { value: Math.floor(elapsed / DAY), unit: 'day' }
}

/** `5 minutes ago`, `yesterday`, `now` under a minute: the age of an instant in the language given. */
export function formatAgo(iso: string | number, lang: string, now: number): string {
	const { value, unit } = ago(iso, now)
	return new Intl.RelativeTimeFormat(lang, { numeric: 'auto' }).format(value === 0 ? 0 : -value, unit)
}
