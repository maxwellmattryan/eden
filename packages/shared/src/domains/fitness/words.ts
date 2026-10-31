// How Vigor writes a day and a time: "today 06:50", "yesterday 06:46", "Mon, 28 Sep 06:52", and a day alone. Pure:
// the translator and the format arrive as parameters.
import { formatDateOf, formatTime, formatWeekdayOf, relativeDay, type DateFormat } from '../../dates/index.js'
import { dayOf } from './progress.js'

type Translate = (key: string, options?: { values?: Record<string, string | number> }) => string

/** A calendar day (`YYYY-MM-DD`) with its weekday: "Mon 28 Sep". */
export function dayLine(day: string, lang: string): string {
	return `${formatWeekdayOf(day, lang, 'short')} ${formatDateOf(day, lang)}`
}

/** When an instant was, as a list's meta says it: today or yesterday with the time, else the day and the time. */
export function whenLine(iso: string, tr: Translate, format: DateFormat): string {
	const time = formatTime(iso, format)
	const relative = relativeDay(iso)
	if (relative === 'today') return tr('domains.fitness.supplements.today', { values: { time } })
	if (relative === 'yesterday') return tr('domains.fitness.supplements.yesterday', { values: { time } })
	return `${dayLine(dayOf(iso), format.lang)} ${time}`
}
