// The words for what the tasks module says: the quick-add chips a parsed line shows, a recurrence as a sentence,
// a wall time on the owner's clock. `@eden/shared/tasks` answers kinds and values; this module puts the locale to
// them, so the page and its rows share one set of words.
import type { ParsedChip } from '@eden/ui-kit'
import { formatDay, formatTime, formatWeekdayOf, type DateFormat } from '@eden/shared/dates'
import { WEEKDAYS, type Weekday } from '@eden/shared/recurrence'
import { isWorkdays, taskChips, type ParsedTask, type RepeatDescription } from '@eden/shared/tasks'

/** svelte-i18n's `t`, as a page reads it from the store. */
export type Translate = (key: string, options?: { values?: Record<string, string | number> }) => string

export interface Words {
	t: Translate
	format: DateFormat
	/** Today, `YYYY-MM-DD`, in the owner's zone. */
	today: string
	/** Tomorrow, `YYYY-MM-DD`. */
	tomorrow: string
}

/** A Monday, from which the weekdays are named in the locale. */
const A_MONDAY = '2024-01-01'

/** A wall time (`HH:MM`) on the owner's clock: `06:50`, or `6:50 AM`. */
export function formatWallTime(time: string, format: DateFormat): string {
	const [hours, minutes] = time.split(':').map(Number)
	return formatTime(Date.UTC(2000, 0, 1, hours ?? 0, minutes ?? 0), { ...format, timeZone: 'UTC' })
}

/** A calendar day as a row or a chip names it: today, tomorrow, or `Thu 10-01`. */
export function formatDayWord(day: string, { t, format, today, tomorrow }: Words): string {
	if (day === today) return t('today.when.today')
	if (day === tomorrow) return t('today.when.tomorrow')
	return `${formatWeekdayOf(day, format.lang, 'short')} ${formatDay(day)}`
}

function weekdayNames(weekdays: readonly Weekday[], lang: string): string {
	const names = weekdays.map((day) => {
		const date = String(1 + WEEKDAYS.indexOf(day)).padStart(2, '0')
		return formatWeekdayOf(`${A_MONDAY.slice(0, 8)}${date}`, lang, 'short')
	})
	return new Intl.ListFormat(lang, { style: 'short', type: 'unit' }).format(names)
}

/** A recurrence as a sentence: every day, every 3 days, every weekday, every Mon and Thu, every month. */
export function formatRepeat(repeat: RepeatDescription, { t, format }: Words): string {
	const { freq, interval } = repeat
	if (freq === 'weekly') {
		if (interval === 1 && isWorkdays(repeat.weekdays)) return t('today.repeat.weekdays')
		const days = weekdayNames(repeat.weekdays, format.lang)
		return interval === 1
			? t('today.repeat.weekly', { values: { days } })
			: t('today.repeat.everyWeeks', { values: { n: interval, days } })
	}
	if (interval === 1) return t(`today.repeat.${freq}`)
	const every = { daily: 'everyDays', monthly: 'everyMonths', yearly: 'everyYears' }[freq]
	return t(`today.repeat.${every}`, { values: { n: interval } })
}

/** The chips the quick-add line shows for a parsed line: the title, when, a repeat, a target. */
export function parsedChips(parsed: ParsedTask, zone: string | undefined, words: Words): ParsedChip[] {
	return taskChips(parsed, zone).map((chip) => {
		switch (chip.kind) {
			case 'title':
				return { label: chip.title }
			case 'when': {
				const day = formatDayWord(chip.day, words)
				return chip.time
					? { label: `${day} ${formatWallTime(chip.time, words.format)}`, icon: 'clock' }
					: { label: day, icon: 'calendar' }
			}
			case 'time':
				return { label: formatWallTime(chip.time, words.format), icon: 'clock' }
			case 'repeat':
				return { label: formatRepeat(chip.repeat, words), icon: 'rotate-ccw' }
			case 'target':
				return {
					label: words.t(`today.target.${chip.target.per === 'day' ? 'perDay' : 'perWeek'}`, {
						values: { count: chip.target.count },
					}),
					icon: 'target',
					mono: true,
				}
		}
	})
}
