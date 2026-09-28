import type { Attachment } from 'svelte/attachments'

/** True when the browser has the top layer for popovers; the kit's overlays need no portal then. */
export const hasTopLayer = () => typeof HTMLElement !== 'undefined' && 'showPopover' in HTMLElement.prototype

/**
 * Moves the element to `target` (the body by default) and puts it back on cleanup. A fallback only, for a WebView
 * without the popover API; behind `hasTopLayer()` it is never used.
 */
export function portal(target: Element | string = 'body'): Attachment<HTMLElement> {
	return (el) => {
		const host = typeof target === 'string' ? document.querySelector(target) : target
		if (!host) return
		const placeholder = document.createComment('portal')
		el.before(placeholder)
		host.appendChild(el)
		return () => placeholder.replaceWith(el)
	}
}
