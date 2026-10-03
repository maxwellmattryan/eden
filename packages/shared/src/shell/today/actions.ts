// What a Today row's action writes, the same in both apps (product/substrate/tasks.md, "Today view"): the store
// call and its undo toast (D-12), and the transition of a section whose last row has gone. Which action a row's
// main gesture is (`primaryAction`) is in `rows.ts`.
import { quintOut } from 'svelte/easing'
import type { TodayItem } from '../../tasks/index.js'
import { undoToast } from '../undo.js'
import type { Translate } from './chips.js'
import type { RowAction } from './rows.js'
import { tasks } from './store.svelte.js'

/** Runs one action on an item and shows its undo toast. */
export function runRowAction(action: RowAction, item: TodayItem, tr: Translate) {
	const { task } = item
	const title = task.title
	if (action === 'done') {
		const { undo } = tasks.complete(task.id)
		undoToast(tr('today.toast.done', { values: { title } }), undo)
	} else if (action === 'reopen') {
		const { undo } = tasks.reopen(task.id)
		undoToast(tr('today.toast.reopened', { values: { title } }), undo)
	} else if (action === 'later' || action === 'tomorrow' || action === 'nextWeek') {
		const { undo } = tasks.snooze(task.id, action)
		const when = tr(`today.actions.${action}`)
		undoToast(tr('today.toast.snoozed', { values: { title, when } }), undo)
	} else if (action === 'skip') {
		const { undo } = tasks.skip(task.id)
		undoToast(tr('today.toast.skipped', { values: { title } }), undo)
	} else if (action === 'log') {
		const { undo } = tasks.tally(task.id)
		const tally = item.tally
		const values = { title, count: (tally?.count ?? 0) + 1, target: tally?.target.count ?? 0 }
		undoToast(tr('today.toast.logged', { values }), undo)
	} else if (action === 'delete') {
		const { undo } = tasks.remove(task.id)
		undoToast(tr('today.toast.deleted', { values: { title } }), undo)
	}
}

/**
 * A section whose last row has gone closes over the settle duration, as the row alone would have (the kit's rows
 * collapse), with the gap after it; a zero settle duration, which is reduced motion, fades instead.
 */
export function settle(node: HTMLElement) {
	const style = getComputedStyle(node)
	const duration = parseFloat(style.getPropertyValue('--ed-duration-settle')) || 0
	if (!duration) {
		return {
			duration: parseFloat(style.getPropertyValue('--ed-duration-micro')) || 0,
			css: (t: number) => `opacity: ${t}`,
		}
	}
	const height = node.getBoundingClientRect().height
	const gap = parseFloat(getComputedStyle(node.parentElement ?? node).rowGap) || 0
	return {
		duration,
		easing: quintOut,
		css: (t: number) =>
			`overflow: hidden; height: ${(t * height).toFixed(2)}px; margin-bottom: ${((t - 1) * gap).toFixed(2)}px; opacity: ${t}`,
	}
}
