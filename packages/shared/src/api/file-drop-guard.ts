// The window's answer to a file dragged over the app (D-84). The webview owns file drops (the native handler is
// off), and its own default for a file dropped on a page is to open it in place of the app. A drop zone claims the
// drags it takes by preventing their default; whatever reaches the window unclaimed is refused here: the cursor says
// no, and the drop does nothing. Drags of text and of the page's own elements pass untouched.

function unclaimedFiles(e: DragEvent): boolean {
	return !e.defaultPrevented && (e.dataTransfer?.types.includes('Files') ?? false)
}

/** Handlers for `<svelte:window ondragover ondrop>` in an app's root layout. */
export const fileDropGuard = {
	over(e: DragEvent) {
		if (!unclaimedFiles(e)) return
		e.preventDefault()
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'none'
	},
	drop(e: DragEvent) {
		if (unclaimedFiles(e)) e.preventDefault()
	},
}
