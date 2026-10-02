// Android's back press (product/substrate/shell.md, "Mobile"; D-TBD(phone-chrome)). The order: what is on top
// closes first (a menu or a popover, then the top-most sheet), then whatever a page holds open (`holdBack` in
// `@eden/shared/navigation`: a pushed detail), then the shell's own way back (history, the parent page), and at a
// tab's root with nothing open the app exits. iOS has no such press: its edge swipe is the webview's own history.
//
// The top layer is closed the way the kit closes it for Escape, by sending that key: a popover or a menu takes it
// first (the kit's dismiss layers), else the sheet it passes through closes, and a sheet that is not dismissible
// keeps both itself and the page under it. Nothing here reaches into a component's state.
import { exit, onBackButtonPress } from '@tauri-apps/api/app'
import { isTauri, logError } from '@eden/shared/api'
import { takeBack } from '@eden/shared/navigation'

/** The modal dialog on top: the one focus is held in, else the last one opened in the document. */
function topDialog(): Element | undefined {
	const focused = document.activeElement?.closest('dialog[open]')
	if (focused) return focused
	const open = document.querySelectorAll('dialog[open]')
	return open[open.length - 1]
}

/**
 * Closes what is on top: an open menu or popover, else the top-most sheet. Answers whether the press was used,
 * which it also is while a sheet that refuses to close is up, so nothing under a modal ever moves.
 */
export function closeTopLayer(): boolean {
	const dialog = topDialog()
	const focused = document.activeElement
	const target = dialog ? (focused && dialog.contains(focused) ? focused : dialog) : (focused ?? document.body)
	const press = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
	target.dispatchEvent(press)
	return press.defaultPrevented || Boolean(dialog)
}

/**
 * One back press. `goBack` is the shell's own step (history, or the parent of a page that is not a tab's root) and
 * answers false at a root, where the press leaves the app.
 */
export function pressBack(goBack: () => boolean): void {
	if (closeTopLayer() || takeBack() || goBack()) return
	if (!isTauri()) return
	void exit(0).catch((error) => void logError('shell', 'Could not exit on back', String(error)).catch(() => null))
}

/**
 * Hears Android's back press for as long as the shell is up; the return value stops it. Registering takes the press
 * from the system, so the root's exit is ours to call. In a development build `window.__edenBack()` is the same
 * press, so the order can be walked in a browser.
 */
export function startBackHandler(goBack: () => boolean): () => void {
	const press = () => pressBack(goBack)
	const dev = import.meta.env.DEV ? (window as { __edenBack?: () => void }) : undefined
	if (dev) dev.__edenBack = press
	let stopped = false
	let unlisten: (() => void) | undefined
	if (isTauri()) {
		void onBackButtonPress(press)
			.then((listener) => {
				unlisten = () => void listener.unregister()
				if (stopped) unlisten()
			})
			// iOS and desktop have no back button to hear
			.catch(() => null)
	}
	return () => {
		stopped = true
		unlisten?.()
		if (dev) delete dev.__edenBack
	}
}
