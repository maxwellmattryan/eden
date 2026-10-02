import type { Attachment } from 'svelte/attachments'

export interface LongPressOptions {
	/** Called with the touch point once a press has held for `delay` ms without moving. */
	onpress(x: number, y: number): void
	/** Presses that start inside a match are ignored: the row's own controls open what they open. */
	ignore?: string
	/** Milliseconds before the press counts. Default 500. */
	delay?: number
}

/** How far a finger may drift, in px, before the press becomes a scroll. */
const SLOP = 10

/**
 * A touch or pen long-press, for a row's context menu where the WebView raises no `contextmenu` for one. A mouse is
 * ignored (it has right-click). The click that ends the press is swallowed so it cannot also toggle the row, and a
 * `contextmenu` that arrives during the hold (Android) cancels the timer so the menu opens once.
 */
export function longPress(get: () => LongPressOptions): Attachment<HTMLElement> {
	return (el) => {
		const options = get()
		const delay = options.delay ?? 500
		let timer: ReturnType<typeof setTimeout> | undefined
		let start: { x: number; y: number } | undefined
		let fired = false

		const clear = () => {
			clearTimeout(timer)
			timer = undefined
			start = undefined
		}
		const onPointerDown = (e: PointerEvent) => {
			if (e.pointerType === 'mouse' || !e.isPrimary) return
			// a match between the target and the row: the row's own ancestors (a sheet holding the list) do not count
			const hit = options.ignore && e.target instanceof Element ? e.target.closest(options.ignore) : null
			if (hit && hit !== el && el.contains(hit)) return
			clear()
			fired = false
			start = { x: e.clientX, y: e.clientY }
			timer = setTimeout(() => {
				timer = undefined
				fired = true
				options.onpress(e.clientX, e.clientY)
			}, delay)
		}
		const onPointerMove = (e: PointerEvent) => {
			if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > SLOP) clear()
		}
		const onClick = (e: MouseEvent) => {
			if (!fired) return
			fired = false
			e.preventDefault()
			e.stopPropagation()
		}

		el.addEventListener('pointerdown', onPointerDown)
		el.addEventListener('pointermove', onPointerMove)
		el.addEventListener('pointerup', clear)
		el.addEventListener('pointercancel', clear)
		el.addEventListener('contextmenu', clear)
		el.addEventListener('click', onClick, true)
		return () => {
			clear()
			el.removeEventListener('pointerdown', onPointerDown)
			el.removeEventListener('pointermove', onPointerMove)
			el.removeEventListener('pointerup', clear)
			el.removeEventListener('pointercancel', clear)
			el.removeEventListener('contextmenu', clear)
			el.removeEventListener('click', onClick, true)
		}
	}
}
