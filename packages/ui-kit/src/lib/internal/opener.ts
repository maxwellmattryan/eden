/**
 * Remembers how the opener of a modal held focus, so the browser's focus return on close does not paint a ring the
 * user never saw. Call it just before opening; call what it returns right after closing, in the same task. A keyboard
 * opener (one that matched :focus-visible) keeps its ring; a clicked one is blurred, since an Escape press would
 * otherwise read as keyboard modality and light the ring on the returned element.
 */
export function rememberOpener(): () => void {
	const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
	const visible = opener?.matches(':focus-visible') ?? false
	return () => {
		if (!visible && opener && document.activeElement === opener) opener.blur()
	}
}
