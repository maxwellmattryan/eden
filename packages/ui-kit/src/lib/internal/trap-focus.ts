import type { Attachment } from 'svelte/attachments'
import { focusables } from './focusable.js'

export interface TrapOptions {
	/** When false the attachment does nothing. */
	active?: boolean
	/** What to focus on open: the first focusable (default), the container, or an element of your choosing. */
	initial?: 'first' | 'container' | (() => HTMLElement | null | undefined)
	/** Return focus to whatever had it before, on cleanup. Default true. */
	returnFocus?: boolean
}

/**
 * Keeps Tab and Shift+Tab inside the element and returns focus when it goes away. Non-modal popovers need this;
 * a `<dialog>` opened with showModal() gets it from the browser, which also makes everything else inert.
 */
export function trapFocus(get: () => TrapOptions = () => ({})): Attachment<HTMLElement> {
	return (el) => {
		const options = get()
		if (options.active === false) return
		const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
		if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')

		queueMicrotask(() => {
			const target =
				typeof options.initial === 'function'
					? options.initial()
					: options.initial === 'container'
						? el
						: (focusables(el)[0] ?? el)
			target?.focus({ preventScroll: true })
		})

		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key !== 'Tab') return
			const items = focusables(el)
			if (!items.length) {
				e.preventDefault()
				el.focus()
				return
			}
			const first = items[0]!
			const last = items[items.length - 1]!
			const active = document.activeElement
			if (e.shiftKey && (active === first || !el.contains(active))) {
				e.preventDefault()
				last.focus()
			} else if (!e.shiftKey && active === last) {
				e.preventDefault()
				first.focus()
			}
		}
		el.addEventListener('keydown', onKeyDown)
		return () => {
			el.removeEventListener('keydown', onKeyDown)
			if (options.returnFocus !== false && previous?.isConnected) previous.focus({ preventScroll: true })
		}
	}
}
