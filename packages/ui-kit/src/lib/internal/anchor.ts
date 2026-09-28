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
 * when it does not fit, clamped to the viewport. Sets `data-side="top" | "bottom"` so the unfurl can originate from the
 * anchor. Re-places on resize, scroll, and when the anchor or the element changes size. Re-runs when the options change.
 */
export function anchor(get: () => AnchorOptions): Attachment<HTMLElement> {
	return (el) => {
		const options = get()
		const place = () => {
			const { anchor: target, side = 'bottom', align = 'start', gap = 6, margin = 8 } = options
			if (!target) return
			const rect = target.getBoundingClientRect()
			const width = el.offsetWidth
			const height = el.offsetHeight
			const viewportWidth = window.innerWidth
			const viewportHeight = window.innerHeight
			const fitsBelow = rect.bottom + gap + height <= viewportHeight
			const fitsAbove = rect.top - gap - height >= 0
			const above = side === 'top' ? fitsAbove || !fitsBelow : !fitsBelow && fitsAbove
			let left = align === 'end' ? rect.right - width : rect.left
			left = Math.max(margin, Math.min(left, viewportWidth - width - margin))
			let top = above ? rect.top - gap - height : rect.bottom + gap
			top = Math.max(margin, Math.min(top, viewportHeight - height - margin))
			el.style.top = `${Math.round(top)}px`
			el.style.left = `${Math.round(left)}px`
			el.dataset.side = above ? 'top' : 'bottom'
		}
		place()
		const observer = new ResizeObserver(place)
		observer.observe(el)
		if (options.anchor instanceof Element) observer.observe(options.anchor)
		window.addEventListener('resize', place)
		window.addEventListener('scroll', place, true)
		return () => {
			observer.disconnect()
			window.removeEventListener('resize', place)
			window.removeEventListener('scroll', place, true)
		}
	}
}
