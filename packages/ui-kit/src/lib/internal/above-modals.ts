import type { Attachment } from 'svelte/attachments'

/** Marks an element docked in a modal dialog by `aboveModals`, so the dialog's focus trap lets Tab reach it. */
export const DOCKED = 'data-ed-docked'

const isModal = (dialog: HTMLDialogElement) => {
	try {
		return dialog.matches(':modal')
	} catch {
		// an engine without :modal: an open dialog is taken for one
		return dialog.open
	}
}
/** Open as a modal and not on its way out (`leave` marks a closing overlay, which is inert until it has gone). */
const stands = (dialog: HTMLDialogElement) =>
	dialog.isConnected && isModal(dialog) && dialog.dataset.closing === undefined

/**
 * Keeps an element above every modal dialog (D-169). A `<dialog>` opened with `showModal()` sits
 * in the top layer and makes everything outside itself inert, a popover in the top layer included, so nothing
 * outside it can be seen over its scrim or pressed. The only place that is both is inside the dialog, so while one
 * is open the element is moved to be the last child of the top-most one, and it goes back to where it was mounted
 * once none is. Top-most is the dialog that opened last, which is the order of the top layer and not of the DOM; a
 * dialog that is closing does not count, since it is inert as it fades. Dialogs are found by watching the document
 * for their `open` attribute, so one the kit did not make (the app's crash card) counts too.
 *
 * The element must not be the root of its component: Svelte removes a fragment by walking from its first node to
 * its last, and a root that has moved away would send that walk through the wrong siblings. It is moved with
 * `moveBefore` where the engine has it, which keeps its transitions running; elsewhere it is re-inserted, and what
 * it holds eases in again.
 */
export function aboveModals(): Attachment<HTMLElement> {
	return (el) => {
		const home = el.parentNode
		if (!home) return
		/** The open modal dialogs in the order they opened: the last is on top. */
		let stack: HTMLDialogElement[] = []

		const move = (parent: Node) => {
			if (el.parentNode === parent) return
			const moving = parent as Node & { moveBefore?: (node: Node, child: Node | null) => void }
			try {
				if (moving.moveBefore && el.isConnected && parent.isConnected) moving.moveBefore(el, null)
				else parent.appendChild(el)
			} catch {
				parent.appendChild(el)
			}
			if (parent === home) el.removeAttribute(DOCKED)
			else el.setAttribute(DOCKED, '')
		}
		const place = () => {
			const open = [...document.querySelectorAll('dialog')].filter(stands)
			stack = [...stack.filter((dialog) => open.includes(dialog)), ...open.filter((dialog) => !stack.includes(dialog))]
			move(stack.at(-1) ?? home)
		}

		// `open` and `data-closing` say when a dialog opens, starts to leave and has closed; the child list says when
		// one is taken out of the document while open, and the element with it
		const observer = new MutationObserver(place)
		observer.observe(document.documentElement, {
			subtree: true,
			childList: true,
			attributes: true,
			attributeFilter: ['open', 'data-closing'],
		})
		place()

		return () => {
			observer.disconnect()
			if (el.parentNode === home) return
			if (home.isConnected) home.appendChild(el)
			else el.remove()
			el.removeAttribute(DOCKED)
		}
	}
}
