// Which elements take focus. Shared by the focus trap, the roving helper and the overlays.
export const FOCUSABLE =
	'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"], summary'

/** Focusable descendants that are rendered (a `display: none` control is skipped). */
export function focusables(root: Element): HTMLElement[] {
	return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
		(el) => !el.closest('[inert]') && el.getClientRects().length > 0
	)
}
