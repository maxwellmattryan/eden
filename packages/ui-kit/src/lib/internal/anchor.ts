import type { Attachment } from 'svelte/attachments'

/** An element, or anything with a rect (a pointer position for a context menu). */
export type AnchorLike = Element | { getBoundingClientRect(): DOMRect; contains?(node: Node): boolean }

export interface AnchorOptions {
	anchor: AnchorLike | null | undefined
	/** Preferred side; the panel flips when there is no room. */
	side?: 'top' | 'bottom'
	/** Which edge of the anchor the panel lines up with. */
	align?: 'start' | 'end'
	/** Space between anchor and panel, in px. */
	gap?: number
	/** Minimum distance from the viewport edges, in px. */
	margin?: number
}

/**
 * Positions a `position: fixed` element (a top-layer popover, typically) against an anchor: below it by default, above
 * when it does not fit, clamped to the viewport. The side is chosen once per opening and kept, and the room on that
 * side is set as `--ed-anchor-room` for the element to cap its height with. Sets `data-side="top" | "bottom"` so the
 * unfurl can originate from the anchor. Re-places on resize, scroll, and when the anchor or the element changes size.
 * Re-runs when the options change.
 */
export function anchor(get: () => AnchorOptions): Attachment<HTMLElement> {
	return (el) => {
		const options = get()
		const { anchor: target, side = 'bottom', align = 'start', gap = 6, margin = 8 } = options
		// The side is chosen once, when the element is first placed against this anchor, and kept while it stays open:
		// an element that grows afterwards (a row unfolds) never jumps to the other side of its anchor. It takes the
		// preferred side when it fits there, the other when it fits there, and otherwise the side with more room. The
		// room on the chosen side is handed to the element as --ed-anchor-room, so it caps its height and scrolls.
		let above: boolean | undefined
		el.style.removeProperty('--ed-anchor-room')

		/** Chooses the side if it is not chosen yet, and sets the room there. Never from a resize callback: it may change the element's size. */
		const fit = () => {
			if (!target) return
			const rect = target.getBoundingClientRect()
			const roomAbove = rect.top - gap - margin
			const roomBelow = window.innerHeight - rect.bottom - gap - margin
			if (above === undefined) {
				const natural = el.offsetHeight
				if (!natural) return
				const fitsBelow = natural <= roomBelow
				const fitsAbove = natural <= roomAbove
				above =
					side === 'top'
						? fitsAbove || (!fitsBelow && roomAbove >= roomBelow)
						: !fitsBelow && (fitsAbove || roomAbove > roomBelow)
			}
			el.style.setProperty('--ed-anchor-room', `${Math.max(0, Math.floor(above ? roomAbove : roomBelow))}px`)
		}
		/** Puts the element against the anchor on its side; changes no size. */
		const position = () => {
			if (!target) return
			const rect = target.getBoundingClientRect()
			const width = el.offsetWidth
			const height = el.offsetHeight
			const up = above ?? side === 'top'
			let left = align === 'end' ? rect.right - width : rect.left
			left = Math.max(margin, Math.min(left, window.innerWidth - width - margin))
			let top = up ? rect.top - gap - height : rect.bottom + gap
			top = Math.max(margin, Math.min(top, window.innerHeight - height - margin))
			el.style.top = `${Math.round(top)}px`
			el.style.left = `${Math.round(left)}px`
			el.dataset.side = up ? 'top' : 'bottom'
		}
		const place = () => {
			fit()
			position()
		}
		place()
		// the element is often shown a moment after this runs (the same flush): the side is chosen once it has a size
		queueMicrotask(place)
		const observer = new ResizeObserver(position)
		observer.observe(el)
		if (target instanceof Element) observer.observe(target)
		window.addEventListener('resize', place)
		window.addEventListener('scroll', place, true)
		return () => {
			observer.disconnect()
			window.removeEventListener('resize', place)
			window.removeEventListener('scroll', place, true)
		}
	}
}
