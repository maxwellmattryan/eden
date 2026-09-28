import type { Attachment } from 'svelte/attachments'

/**
 * Calls `cb` with the element's rect now, whenever it resizes, and once the fonts have loaded (metrics change then).
 * The Segmented control's pill and anything else that reads layout uses this instead of an effect.
 */
export function measure(cb: (rect: DOMRectReadOnly, el: HTMLElement) => void): Attachment<HTMLElement> {
	return (el) => {
		const run = () => cb(el.getBoundingClientRect(), el)
		const observer = new ResizeObserver(run)
		observer.observe(el)
		document.fonts?.ready.then(run)
		run()
		return () => observer.disconnect()
	}
}
