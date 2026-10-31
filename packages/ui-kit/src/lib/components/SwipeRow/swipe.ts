import type { Attachment } from 'svelte/attachments'

export type SwipeSide = 'leading' | 'trailing'

export interface SwipeOptions {
	/** Which sides have an action; a drag towards a side without one does not move the content. */
	leading: boolean
	trailing: boolean
	/** How far the content may travel, in px: the action's width. Read when a pointer goes down. */
	width: () => number
	/** The row's width, in px: 40 % of it caps the commit threshold. Read when a pointer goes down. */
	rowWidth: () => number
	/** True when movement is off (reduced motion): the content never travels; a hold reveals instead. */
	still: () => boolean
	/** Whether a hold reveals the actions when movement is off. On unless set false. */
	hold?: boolean
	/** The content's offset while the pointer is down, already clamped. */
	onMove(dx: number): void
	/** The drag ended, committed or not: settle back to 0. */
	onSettle(): void
	/** The drag ended past the threshold. Called before `onSettle`. */
	onCommit(side: SwipeSide): void
	/** The pointer was held still for the hold time under reduced motion. */
	onHold(): void
	/** The pointer came up without a drag. */
	onTap?(): void
}

/** Movement under this many px is a tap or a hold, not yet a drag; it also decides the axis. */
const SLOP = 6
/** How long a pointer must stay down to reveal the actions under reduced motion. */
const HOLD_MS = 600

/**
 * The swipe gesture for SwipeRow, on the row's content: a horizontal pointer drag moves the content by the pointer's
 * delta, clamped to the action width; past the threshold on release it commits, then settles. Vertical intent (the
 * first movement past the slop is mostly vertical) cancels, so the list still scrolls. Once a drag is decided the
 * pointer is captured, so every later event arrives here and nothing listens on window or document; the click that
 * follows a drag is swallowed before the children see it. A plain tap captures nothing and reaches the children as
 * usual. Under reduced motion there is no travel: a 600 ms hold reveals the actions instead.
 */
export function swipe(get: () => SwipeOptions): Attachment<HTMLElement> {
	return (el) => {
		const options = get()
		let pointerId: number | undefined
		let startX = 0
		let startY = 0
		let axis: 'x' | 'y' | undefined
		let dx = 0
		let width = 0
		let threshold = 0
		let dragged = false
		let hold: ReturnType<typeof setTimeout> | undefined

		const clamp = (x: number) =>
			x > 0 ? (options.leading ? Math.min(x, width) : 0) : options.trailing ? Math.max(x, -width) : 0

		const reset = () => {
			clearTimeout(hold)
			hold = undefined
			if (pointerId !== undefined && el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId)
			pointerId = undefined
			axis = undefined
			dx = 0
		}
		const onPointerDown = (e: PointerEvent) => {
			if (pointerId !== undefined || e.button !== 0 || e.isPrimary === false) return
			pointerId = e.pointerId
			startX = e.clientX
			startY = e.clientY
			axis = undefined
			dx = 0
			dragged = false
			width = options.width()
			threshold = Math.min(width, options.rowWidth() * 0.4)
			if (options.hold !== false && options.still()) {
				hold = setTimeout(() => {
					hold = undefined
					reset()
					options.onHold()
				}, HOLD_MS)
			}
		}
		const onPointerMove = (e: PointerEvent) => {
			if (e.pointerId !== pointerId) return
			const x = e.clientX - startX
			const y = e.clientY - startY
			if (!axis) {
				if (Math.abs(x) < SLOP && Math.abs(y) < SLOP) return
				clearTimeout(hold)
				hold = undefined
				axis = Math.abs(y) > Math.abs(x) ? 'y' : 'x'
				if (axis === 'y' || options.still()) {
					reset()
					return
				}
				dragged = true
				try {
					el.setPointerCapture(e.pointerId)
				} catch {
					// a synthetic pointer the browser does not track; the events still bubble here from the children
				}
			}
			if (axis !== 'x') return
			dx = x
			options.onMove(clamp(x))
		}
		const onPointerUp = (e: PointerEvent) => {
			if (e.pointerId !== pointerId) return
			const wasDrag = axis === 'x'
			const moved = dx
			reset()
			if (!wasDrag) {
				options.onTap?.()
				return
			}
			if (moved >= threshold && options.leading) options.onCommit('leading')
			else if (-moved >= threshold && options.trailing) options.onCommit('trailing')
			options.onSettle()
		}
		const onPointerCancel = (e: PointerEvent) => {
			if (e.pointerId !== pointerId) return
			const wasDrag = axis === 'x'
			reset()
			if (wasDrag) options.onSettle()
		}
		// the click that ends a drag is not a click on the row
		const onClick = (e: MouseEvent) => {
			if (!dragged) return
			dragged = false
			e.stopPropagation()
			e.preventDefault()
		}

		el.addEventListener('pointerdown', onPointerDown)
		el.addEventListener('pointermove', onPointerMove)
		el.addEventListener('pointerup', onPointerUp)
		el.addEventListener('pointercancel', onPointerCancel)
		el.addEventListener('click', onClick, true)
		return () => {
			el.removeEventListener('pointerdown', onPointerDown)
			el.removeEventListener('pointermove', onPointerMove)
			el.removeEventListener('pointerup', onPointerUp)
			el.removeEventListener('pointercancel', onPointerCancel)
			el.removeEventListener('click', onClick, true)
			clearTimeout(hold)
		}
	}
}
