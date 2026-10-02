import type { Attachment } from 'svelte/attachments'
import { pointerAt } from './pointer.js'

/** A place on a chart, in the chart's own layout pixels from its top left. */
export interface ChartPlace {
	x: number
	y: number
}

export interface ChartReadOptions {
	/** When false the chart is not read and the attachment does nothing. */
	on?: boolean
	/** The place being read, or nothing once the readout goes. The chart turns it into its point. */
	onread(at: ChartPlace | undefined, el: HTMLElement): void
}

/**
 * How a chart is read (D-117), by a mouse and by a finger (D-TBD(chart-touch)). A mouse reads the place under it as
 * it moves and the readout goes when it leaves, as it always did. A finger or a pen pins it: a tap reads the place
 * tapped, a horizontal scrub moves the reading with the finger, and lifting leaves it standing until a press
 * anywhere outside the chart. The element takes `touch-action: pan-y`, so a vertical drag still scrolls the page;
 * when the browser takes a touch for that scroll (`pointercancel`) the reading goes back to what it was before the
 * touch, so scrolling past a chart never leaves a readout behind. The one document listener, for the press outside,
 * is held only while a reading is pinned.
 */
export function chartRead(get: () => ChartReadOptions): Attachment<HTMLElement> {
	return (el) => {
		const options = get()
		if (options.on === false) return

		/** What is being read now, and whether a touch pinned it. */
		let last: ChartPlace | undefined
		let pinned = false
		/** What was read before the touch that is down, to go back to if the browser takes it for a scroll. */
		let before: { at: ChartPlace | undefined; pinned: boolean } | undefined
		let listening = false

		const onOutside = (e: PointerEvent) => {
			if (e.target instanceof Node && el.contains(e.target)) return
			set(undefined, false)
		}
		const listen = (on: boolean) => {
			if (on === listening) return
			listening = on
			if (on) document.addEventListener('pointerdown', onOutside, true)
			else document.removeEventListener('pointerdown', onOutside, true)
		}
		function set(at: ChartPlace | undefined, pin: boolean) {
			last = at
			pinned = pin && at !== undefined
			listen(pinned)
			options.onread(at, el)
		}
		const place = (e: PointerEvent) => pointerAt(e as PointerEvent & { currentTarget: EventTarget & HTMLElement })

		const onDown = (e: PointerEvent) => {
			if (e.pointerType === 'mouse') return set(place(e), false)
			if (!e.isPrimary) return
			before = { at: last, pinned }
			set(place(e), true)
		}
		// a mouse moves over the chart freely; a finger sends moves only while it is down, which is the scrub
		const onMove = (e: PointerEvent) => {
			if (e.pointerType === 'mouse') set(place(e), false)
			else if (e.isPrimary && before) set(place(e), true)
		}
		const onUp = () => (before = undefined)
		const onLeave = (e: PointerEvent) => {
			if (e.pointerType === 'mouse') set(undefined, false)
		}
		const onCancel = (e: PointerEvent) => {
			if (e.pointerType === 'mouse') return set(undefined, false)
			if (!before) return
			const was = before
			before = undefined
			set(was.at, was.pinned)
		}

		const touchAction = el.style.touchAction
		el.style.touchAction = 'pan-y'
		el.addEventListener('pointerdown', onDown)
		el.addEventListener('pointermove', onMove)
		el.addEventListener('pointerup', onUp)
		el.addEventListener('pointerleave', onLeave)
		el.addEventListener('pointercancel', onCancel)
		return () => {
			el.style.touchAction = touchAction
			el.removeEventListener('pointerdown', onDown)
			el.removeEventListener('pointermove', onMove)
			el.removeEventListener('pointerup', onUp)
			el.removeEventListener('pointerleave', onLeave)
			el.removeEventListener('pointercancel', onCancel)
			listen(false)
		}
	}
}
