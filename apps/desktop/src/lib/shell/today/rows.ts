// A Today item as a list row: the title, what it says beneath (a checklist's count, a habit's tally and streak, a
// routine's rule), its time or its day in the meta, and its menu. Done is the first item of every menu that has
// one, as Enter and a double-click are (there are no checkboxes, D-41); Delete is last.
import type { ListRowData, MenuItem } from '@eden/ui-kit'
import { formatTime } from '@eden/shared/dates'
import { describeRecurrence, type SnoozeTargets, type TodayItem } from '@eden/shared/tasks'
import { formatDayWord, formatRepeat, formatWallTime, type Words } from './chips.js'

/** What a row's menu can ask for; the page maps each to the store. */
export type RowAction = 'done' | 'reopen' | 'later' | 'tomorrow' | 'nextWeek' | 'skip' | 'log' | 'delete'

export interface RowWords extends Words {
	/** The snooze targets for a task, as the store offers them now. */
	snooze: (item: TodayItem) => SnoozeTargets
}

const action = (id: RowAction, t: Words['t'], icon: MenuItem['icon'], destructive = false): MenuItem => ({
	id,
	label: t(`today.actions.${id}`),
	icon,
	...(destructive ? { destructive } : {}),
})

/** The row's menu: what the owner can do with it today. */
export function actionsFor(item: TodayItem, words: RowWords): MenuItem[] {
	const { t } = words
	const remove = action('delete', t, 'trash', true)
	if (item.section === 'habits') return [action('log', t, 'plus'), remove]
	if (item.section === 'routines') {
		return item.done
			? [action('reopen', t, 'rotate-ccw'), remove]
			: [action('done', t, 'check'), action('skip', t, 'circle-dashed'), remove]
	}
	const targets = words.snooze(item)
	return [
		action('done', t, 'check'),
		...(targets.later ? [action('later', t, 'clock')] : []),
		action('tomorrow', t, 'calendar'),
		action('nextWeek', t, 'calendar'),
		remove,
	]
}

/** The row for an item of a section. */
export function rowOf(item: TodayItem, words: RowWords): ListRowData {
	const { t, format } = words
	const { task } = item
	const row: ListRowData = { id: task.id, primary: task.title, actions: actionsFor(item, words) }

	if (item.section === 'habits' && item.tally) {
		const { count, target, streak } = item.tally
		row.chips = [
			{ id: 'tally', label: t('today.habit.tally', { values: { count, target: target.count } }), mono: true },
			{ id: 'period', label: t(target.per === 'day' ? 'today.habit.perDay' : 'today.habit.perWeek') },
			...(streak > 1
				? [{ id: 'streak', label: t('today.habit.streak', { values: { streak } }), icon: 'flame' as const }]
				: []),
		]
		return row
	}

	if (item.section === 'routines') {
		if (task.recurrence) row.secondary = formatRepeat(describeRecurrence(task.recurrence), words)
		row.done = item.done
		row.meta = item.doneAt ? formatTime(item.doneAt, format) : item.time ? formatWallTime(item.time, format) : undefined
		row.metaWarn = item.late
		return row
	}

	// overdue, and due today
	if (item.items) row.chips = [{ id: 'items', label: t('today.checklist', { values: item.items }), mono: true }]
	const time = item.time ? formatWallTime(item.time, format) : undefined
	if (item.section === 'overdue' && item.day) {
		const day = formatDayWord(item.day, words)
		row.meta = time ? `${day} ${time}` : day
		row.metaWarn = true
	} else {
		row.meta = time
		row.metaWarn = item.late
	}
	return row
}
