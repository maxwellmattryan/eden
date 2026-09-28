import type { Attachment } from 'svelte/attachments'

/** Zooms a fixed-width canvas down so it fits its container (never up), and keeps it fitting as the pane resizes. */
export function fitScale(width: number, min = 0.4): Attachment<HTMLElement> {
	return (el) => {
		const parent = el.parentElement
		if (!parent) return
		const apply = () => {
			const available = parent.clientWidth
			const zoom = available >= width ? 1 : Math.max(min, available / width)
			el.style.zoom = String(zoom)
		}
		apply()
		const observer = new ResizeObserver(apply)
		observer.observe(parent)
		return () => observer.disconnect()
	}
}
