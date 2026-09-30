// What quick-add understands, per language (docs/product/substrate/tasks.md, "Today view"; D-75): the words for a
// day, a time, a repeat and a target, each as a pattern and the reading it gives. The parser (`parse.ts`) takes the
// first reading of each kind and places it on the calendar; the table knows no dates. English is the base; Japanese
// gets the minimal forms here and the fuller grammar with the Japanese pass. The English forms parse under `ja` too.
import type { Weekday } from '../recurrence/index.js'
import type { HabitTarget } from './types.js'

export type Language = 'en' | 'ja'

/** A day as the line names it, before the parser places it. */
export type DayReading =
	| { kind: 'offset'; days: number }
	| { kind: 'weekday'; weekday: Weekday }
	| { kind: 'nextWeek' }
	| { kind: 'monthDay'; month: number; date: number }
	| { kind: 'date'; day: string }

/** A repeat as the line names it; the parser sets its start. */
export type RepeatReading =
	{ freq: 'daily' | 'monthly' | 'yearly'; interval?: number } | { freq: 'weekly'; weekdays?: Weekday[] }

export type Matcher =
	| { reads: 'target'; pattern: RegExp; read(match: RegExpExecArray): HabitTarget | null }
	| { reads: 'repeat'; pattern: RegExp; read(match: RegExpExecArray): RepeatReading | null }
	| { reads: 'day'; pattern: RegExp; read(match: RegExpExecArray): DayReading | null }
	| { reads: 'time'; pattern: RegExp; read(match: RegExpExecArray): string | null }

const DATE = /^\d{4}-\d{2}-\d{2}$/

/** `HH:MM` when the hour and the minute are on the clock, else nothing. */
function clock(hours: number, minutes: number): string | null {
	if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours > 23 || minutes > 59) return null
	return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

const positive = (text: string): number | null => (Number(text) >= 1 ? Number(text) : null)

// English. A weekday is its name or its usual short form; the first two letters name it.
const EN_DAY =
	'mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?'
const enWeekday = (word: string): Weekday => word.slice(0, 2).toLowerCase() as Weekday
const enWeekdays = (words: string): Weekday[] => [
	...new Set(
		words
			.split(/\s*,\s*|\s+and\s+|\s+/)
			.filter(Boolean)
			.map(enWeekday)
	),
]

const en: Matcher[] = [
	{
		reads: 'target',
		pattern: /\b(\d+)\s*(?:x|times)\s+(?:a|per)\s+(day|week)\b/i,
		read: (m) => {
			const count = positive(m[1]!)
			return count ? { count, per: m[2]!.toLowerCase() as HabitTarget['per'] } : null
		},
	},
	{
		reads: 'repeat',
		pattern: /\bevery\s+(\d+)\s+days\b/i,
		read: (m) => {
			const interval = positive(m[1]!)
			return interval ? { freq: 'daily', interval } : null
		},
	},
	{ reads: 'repeat', pattern: /\b(?:every\s+day|daily)\b/i, read: () => ({ freq: 'daily' }) },
	{
		reads: 'repeat',
		pattern: /\bevery\s+weekday\b/i,
		read: () => ({ freq: 'weekly', weekdays: ['mo', 'tu', 'we', 'th', 'fr'] }),
	},
	{
		reads: 'repeat',
		pattern: new RegExp(`\\bevery\\s+((?:${EN_DAY})(?:(?:\\s*,\\s*|\\s+and\\s+|\\s+)(?:${EN_DAY}))*)\\b`, 'i'),
		read: (m) => ({ freq: 'weekly', weekdays: enWeekdays(m[1]!) }),
	},
	{ reads: 'repeat', pattern: /\b(?:every\s+week|weekly)\b/i, read: () => ({ freq: 'weekly' }) },
	{ reads: 'repeat', pattern: /\bevery\s+month\b/i, read: () => ({ freq: 'monthly' }) },
	{ reads: 'repeat', pattern: /\bevery\s+year\b/i, read: () => ({ freq: 'yearly' }) },
	{
		reads: 'day',
		pattern: /\b(\d{4}-\d{2}-\d{2})\b/,
		read: (m) => (DATE.test(m[1]!) ? { kind: 'date', day: m[1]! } : null),
	},
	{
		reads: 'day',
		pattern: /\b(\d{2})-(\d{2})\b/,
		read: (m) => {
			const month = Number(m[1])
			const date = Number(m[2])
			return month >= 1 && month <= 12 && date >= 1 && date <= 31 ? { kind: 'monthDay', month, date } : null
		},
	},
	{ reads: 'day', pattern: /\b(?:on\s+)?today\b/i, read: () => ({ kind: 'offset', days: 0 }) },
	{ reads: 'day', pattern: /\b(?:on\s+)?tomorrow\b/i, read: () => ({ kind: 'offset', days: 1 }) },
	{ reads: 'day', pattern: /\bnext\s+week\b/i, read: () => ({ kind: 'nextWeek' }) },
	{
		reads: 'day',
		pattern: /\bin\s+(\d+)\s+days?\b/i,
		read: (m) => {
			const days = positive(m[1]!)
			return days ? { kind: 'offset', days } : null
		},
	},
	{
		reads: 'day',
		pattern: new RegExp(`\\b(?:on\\s+)?(${EN_DAY})\\b`, 'i'),
		read: (m) => ({ kind: 'weekday', weekday: enWeekday(m[1]!) }),
	},
	{
		reads: 'time',
		pattern: /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i,
		read: (m) => {
			let hours = Number(m[1])
			if (hours < 1 || hours > 12) return null
			if (m[3]!.toLowerCase() === 'pm' && hours < 12) hours += 12
			if (m[3]!.toLowerCase() === 'am' && hours === 12) hours = 0
			return clock(hours, Number(m[2] ?? 0))
		},
	},
	{
		reads: 'time',
		pattern: /\b(?:at\s+)?(\d{1,2}):(\d{2})\b/,
		read: (m) => clock(Number(m[1]), Number(m[2])),
	},
]

// Japanese, the minimal forms: today, tomorrow, the weekdays with or without 日, N時 and N時M分, 毎日 and 毎週. Digits
// may be full-width, as an IME writes them. There are no word boundaries: the forms are read wherever they stand.
const JA_WEEKDAYS: Record<string, Weekday> = { 月: 'mo', 火: 'tu', 水: 'we', 木: 'th', 金: 'fr', 土: 'sa', 日: 'su' }
const JA_DAY = '[月火水木金土日]曜日?'
const digits = (text: string) => Number(text.replace(/[０-９]/g, (d) => String(d.charCodeAt(0) - 0xff10)))
const jaWeekdays = (words: string): Weekday[] =>
	[...words.matchAll(/([月火水木金土日])曜/g)]
		.map((m) => JA_WEEKDAYS[m[1]!]!)
		.filter((day, i, all) => all.indexOf(day) === i)

const ja: Matcher[] = [
	{ reads: 'repeat', pattern: /毎日/, read: () => ({ freq: 'daily' }) },
	{
		reads: 'repeat',
		pattern: new RegExp(`毎週\\s*((?:${JA_DAY}[、,・\\s]*)*)`),
		read: (m) => {
			const weekdays = jaWeekdays(m[1] ?? '')
			return weekdays.length ? { freq: 'weekly', weekdays } : { freq: 'weekly' }
		},
	},
	{ reads: 'day', pattern: /今日/, read: () => ({ kind: 'offset', days: 0 }) },
	{ reads: 'day', pattern: /明日/, read: () => ({ kind: 'offset', days: 1 }) },
	{
		reads: 'day',
		pattern: new RegExp(`(${JA_DAY})`),
		read: (m) => ({ kind: 'weekday', weekday: jaWeekdays(m[1]!)[0]! }),
	},
	{
		reads: 'time',
		pattern: /([0-9０-９]{1,2})時(?:([0-9０-９]{1,2})分)?/,
		read: (m) => clock(digits(m[1]!), m[2] ? digits(m[2]) : 0),
	},
]

/** The matchers of a language, in the order they are tried; the English forms parse under every language. */
export function vocabulary(lang: Language): readonly Matcher[] {
	return lang === 'ja' ? [...ja, ...en] : en
}
