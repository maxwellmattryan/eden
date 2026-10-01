import type { Attachment } from 'svelte/attachments'
import { platformOf } from './platform.js'

/** The type a drag of rows carries, so a target can tell it from files, text and links before the drop. */
export const ROW_DRAG_TYPE = 'application/x-eden-rows'

/** The drag in progress: the engine keeps a drag's data to itself until the drop, so the page remembers it here. */
export interface RowDrag {
	/** What kind of rows these are; a target takes the groups it names. */
	group: string
	/** The dragged rows' ids. */
	ids: string[]
	/** The row the drag began on. */
	source: HTMLElement
	/** Ends the drag on the source's side, once. */
	end(): void
}

let active: RowDrag | undefined

/** Whether a target takes a drag: one is in progress, of a group it accepts, and it did not begin inside the target. */
export function takes(drag: Pick<RowDrag, 'group'> | undefined, accepts: string[], containsSource: boolean): boolean {
	return !!drag && accepts.includes(drag.group) && !containsSource
}

export interface RowDragSourceOptions {
	/** The rows' group, or none while the row is not to be dragged. Read as the attachment runs, so a change re-runs it. */
	group: () => string | undefined
	/** The ids the drag carries: the row's own. */
	ids: () => string[]
	/** The drag began (`true`) or ended, dropped or not (`false`). */
	onState?(dragging: boolean): void
}

/**
 * Makes a row draggable to a `rowDropTarget`, with a pointer on desktop: on a phone a held press is the row's menu and
 * a sideways drag its swipe. The row is marked `data-dragging` while it is held. The mark and `onState` wait a task
 * after the drag begins, so the engine has taken its picture of the row and nothing on the page moves beneath the
 * gesture as it starts. Nothing listens on window or document.
 */
export function rowDragSource(get: () => RowDragSourceOptions): Attachment<HTMLElement> {
	return (el) => {
		const options = get()
		const group = options.group()
		if (!group || platformOf(el) === 'mobile') return

		let timer: ReturnType<typeof setTimeout> | undefined
		let mine: RowDrag | undefined
		const end = () => {
			if (!mine) return
			if (active === mine) active = undefined
			mine = undefined
			if (timer !== undefined) {
				// the drag ended before it was announced
				clearTimeout(timer)
				timer = undefined
				return
			}
			el.removeAttribute('data-dragging')
			options.onState?.(false)
		}
		const onDragStart = (e: DragEvent) => {
			if (!e.dataTransfer || e.defaultPrevented) return
			// text dragged out of a field is the field's
			if (e.target instanceof Element && e.target.closest('input, textarea, [contenteditable]')) return
			active?.end()
			mine = { group, ids: options.ids(), source: el, end }
			active = mine
			e.dataTransfer.effectAllowed = 'move'
			e.dataTransfer.setData(ROW_DRAG_TYPE, mine.ids.join('\n'))
			// the whole row is what is held, whatever part of it the pointer was on (a picture drags alone otherwise)
			const rect = el.getBoundingClientRect()
			e.dataTransfer.setDragImage(el, e.clientX - rect.left, e.clientY - rect.top)
			timer = setTimeout(() => {
				timer = undefined
				el.setAttribute('data-dragging', '')
				options.onState?.(true)
			})
		}

		el.draggable = true
		el.addEventListener('dragstart', onDragStart)
		el.addEventListener('dragend', end)
		return () => {
			end()
			el.removeAttribute('draggable')
			el.removeEventListener('dragstart', onDragStart)
			el.removeEventListener('dragend', end)
		}
	}
}

export interface RowDropTargetOptions {
	/** The groups of rows the target takes. Read on every event. */
	accepts: () => string[]
	/** True while the target takes nothing. Read on every event. */
	disabled: () => boolean
	/** A drag the target takes is over it, or has left it. */
	onHover(over: boolean): void
	/** The rows were dropped on the target. */
	onDrop(ids: string[]): void
}

/**
 * The drop side of a row drag, on a region's root. As in Dropzone, a depth count tells the region's own edge from a
 * child's and nothing listens on window or document. A drag is claimed (its default prevented, the move cursor shown)
 * only while it carries rows of a group the target accepts and did not begin inside the target: a list is no target
 * for its own rows.
 */
export function rowDropTarget(get: () => RowDropTargetOptions): Attachment<HTMLElement> {
	return (el) => {
		const options = get()
		let depth = 0
		let over = false

		const mineToTake = (e: DragEvent) =>
			(e.dataTransfer?.types.includes(ROW_DRAG_TYPE) ?? false) &&
			!options.disabled() &&
			takes(active, options.accepts(), !!active && el.contains(active.source))
		const leave = () => {
			depth = 0
			if (!over) return
			over = false
			options.onHover(false)
		}
		const enter = () => {
			if (over) return
			over = true
			options.onHover(true)
		}
		const onDragEnter = (e: DragEvent) => {
			if (!mineToTake(e)) return leave()
			e.preventDefault()
			depth++
			enter()
		}
		const onDragOver = (e: DragEvent) => {
			if (!mineToTake(e)) return leave()
			e.preventDefault()
			if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
			depth = Math.max(depth, 1)
			enter()
		}
		const onDragLeave = () => {
			if (!over) return
			depth--
			if (depth <= 0) leave()
		}
		const onDrop = (e: DragEvent) => {
			const drag = over && mineToTake(e) ? active : undefined
			leave()
			if (!drag) return
			e.preventDefault()
			// the source may leave the page with the drop and never hear its dragend
			drag.end()
			options.onDrop(drag.ids)
		}

		el.addEventListener('dragenter', onDragEnter)
		el.addEventListener('dragover', onDragOver)
		el.addEventListener('dragleave', onDragLeave)
		el.addEventListener('drop', onDrop)
		return () => {
			el.removeEventListener('dragenter', onDragEnter)
			el.removeEventListener('dragover', onDragOver)
			el.removeEventListener('dragleave', onDragLeave)
			el.removeEventListener('drop', onDrop)
		}
	}
}
