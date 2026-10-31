import type { Attachment } from 'svelte/attachments'
import { DOCKED } from './above-modals.js'
import { focusables, textControls } from './focusable.js'

export interface TrapOptions {
	/** When false the attachment does nothing. */
	active?: boolean
	/**
	 * What to focus on open: `auto` (default) lands on the first text control when the layer has one (an element with
	 * `autofocus` wins) and otherwise on the container, so nothing looks pressed or ringed that the owner did not
	 * reach for; `first` is the first focusable of any kind; `container`; or an element of your choosing.
	 */
	initial?: 'auto' | 'first' | 'container' | (() => HTMLElement | null | undefined)
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
			const initial = options.initial ?? 'auto'
			const target =
				typeof initial === 'function'
					? initial()
					: initial === 'container'
						? el
						: initial === 'first'
							? (el.querySelector<HTMLElement>('[autofocus]') ?? focusables(el)[0] ?? el)
							: (el.querySelector<HTMLElement>('[autofocus]') ?? textControls(el)[0] ?? el)
			target?.focus({ preventScroll: true })
		})

		/** What `aboveModals` has docked beside the layer in its dialog and can take focus: the toast's buttons. */
		const docked = () =>
			[...(el.closest('dialog')?.querySelectorAll(`:scope > [${DOCKED}]`) ?? [])].flatMap((host) => focusables(host))

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
				// a toast docked in the same modal dialog follows the layer in the document: Tab goes on to it by itself
				if (docked().length) return
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
