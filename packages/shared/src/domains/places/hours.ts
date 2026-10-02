// Opening hours as Meadow reads them (D-128): the common subset of OpenStreetMap's `opening_hours`, which is also
// how schema.org's `openingHours` is written. A string outside the subset is not guessed at: it parses to nothing,
// the page shows it as it was written, and "open now" is answered only for hours that parsed.

/** A stretch a place is open, in minutes from that day's midnight; `close` passes 1440 when it runs into the next day. */
export type Span = [open: number, close: number]

/** A week of opening hours, Monday first. */
export interface WeekHours {
	days: [Span[], Span[], Span[], Span[], Span[], Span[], Span[]]
}

const DAYS = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'] as const
const DAY_MINUTES = 1440

const emptyWeek = (): WeekHours => ({ days: [[], [], [], [], [], [], []] })

/** The days a selector names (`Mo-Fr`, `Sa,Su`, `Fr-Mo`), as indexes from Monday; nothing for one that is not days. */
function daysOf(selector: string): number[] | undefined {
	const out: number[] = []
	for (const part of selector.split(',')) {
		const [from, to, ...rest] = part.split('-').map((day) => DAYS.indexOf(day.trim().toLowerCase() as never))
		if (rest.length || from === undefined || from < 0 || (to !== undefined && to < 0)) return undefined
		if (to === undefined) out.push(from)
		// a range may wrap the week: Fr-Mo is Friday to Monday
		else
			for (let day = from; ; day = (day + 1) % 7) {
				out.push(day)
				if (day === to) break
			}
	}
	return out.length ? [...new Set(out)] : undefined
}

const minutes = (hours: string, mins: string) => Number(hours) * 60 + Number(mins)

/** The spans a time selector names (`07:00-17:00`, `10:00-14:00,17:00-22:00`, `18:00-02:00`); nothing for any other. */
function spansOf(selector: string): Span[] | undefined {
	const out: Span[] = []
	for (const part of selector.split(',')) {
		const match = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec(part.trim())
		if (!match) return undefined
		const open = minutes(match[1]!, match[2]!)
		let close = minutes(match[3]!, match[4]!)
		if (open > DAY_MINUTES || close > 2 * DAY_MINUTES || Number(match[2]) > 59 || Number(match[4]) > 59)
			return undefined
		// closing at or before opening is closing the next day
		if (close <= open) close += DAY_MINUTES
		out.push([open, close])
	}
	return out
}

/**
 * A week of hours from an `opening_hours` string, or nothing when any of its rules is outside the subset read here:
 * `24/7`; rules set apart by `;`, each some days and some times (`Mo-Fr 07:00-17:00`), days alone with `off` or
 * `closed`, or times alone, which are every day's. A later rule replaces an earlier one for the days it names.
 * Months, holidays, sunrise and the rest of the grammar are not read.
 */
export function parseOpeningHours(text: string): WeekHours | undefined {
	const source = text.trim()
	if (!source || source.length > 400) return undefined
	if (/^24\s*\/\s*7$/.test(source)) {
		const week = emptyWeek()
		for (const day of week.days) day.push([0, DAY_MINUTES])
		return week
	}
	const week = emptyWeek()
	let read = 0
	for (const rule of source.split(';')) {
		const trimmed = rule.trim()
		if (!trimmed) continue
		const match = /^([A-Za-z]{2}(?:\s*[-,]\s*[A-Za-z]{2})*)?\s*(.*)$/.exec(trimmed)
		const days = match?.[1] ? daysOf(match[1].replace(/\s+/g, '')) : [0, 1, 2, 3, 4, 5, 6]
		const rest = (match?.[2] ?? '').trim()
		if (!days) return undefined
		const closed = /^(off|closed)$/i.test(rest)
		// days with nothing after them say nothing of when
		const spans = closed ? [] : spansOf(rest)
		if (!spans || (!closed && !spans.length)) return undefined
		for (const day of days) week.days[day] = spans.map((span): Span => [...span])
		read++
	}
	return read ? week : undefined
}

/** The same from schema.org's `openingHours`, where each rule is an entry of its own. */
export function parseSchemaHours(rules: readonly string[]): WeekHours | undefined {
	return rules.length ? parseOpeningHours(rules.join('; ')) : undefined
}

/** The day of the week (Monday is 0) and the minutes since midnight at an instant, as a clock in the zone reads. */
export function localClock(at: Date, timeZone: string): { day: number; minutes: number } {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		weekday: 'short',
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23',
	}).formatToParts(at)
	const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? ''
	const day = DAYS.indexOf(part('weekday').slice(0, 2).toLowerCase() as never)
	return { day: Math.max(0, day), minutes: Number(part('hour')) * 60 + Number(part('minute')) }
}

/**
 * Whether the hours make a place open at an instant, read on the place's own clock: inside one of today's spans, or
 * inside one of yesterday's that runs past midnight. The clock is the zone's, so a change to summer time moves
 * nothing: a place that opens at seven opens at seven.
 */
export function isOpenAt(hours: WeekHours, at: Date, timeZone: string): boolean {
	const { day, minutes: now } = localClock(at, timeZone)
	if (hours.days[day]!.some(([open, close]) => now >= open && now < close)) return true
	const yesterday = hours.days[(day + 6) % 7]!
	return yesterday.some(([, close]) => close > DAY_MINUTES && now < close - DAY_MINUTES)
}

const clock = (value: number) => {
	const wrapped = value % DAY_MINUTES
	return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`
}

/** A day's spans as they are written: `07:00–17:00`, several set apart by a comma; nothing for a closed day. */
export function formatSpans(spans: readonly Span[]): string {
	return spans.map(([open, close]) => `${clock(open)}–${close === DAY_MINUTES ? '24:00' : clock(close)}`).join(', ')
}

/** The spans of the day an instant falls on, on the place's own clock. */
export function spansOn(hours: WeekHours, at: Date, timeZone: string): Span[] {
	return hours.days[localClock(at, timeZone).day]!
}
