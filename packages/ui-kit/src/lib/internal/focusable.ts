// Which elements take focus. Shared by the focus trap, the roving helper and the overlays.
export const FOCUSABLE =
	'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"], summary'

/** The controls a caret can land in: what an opening layer may focus on its own (design/ux-patterns.md, "Keyboard and focus"). */
const TEXT_CONTROL =
	'input:not([disabled]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="file"]):not([type="range"]):not([type="color"]), textarea:not([disabled]), [contenteditable="true"]'

/** Rendered text controls, in document order. */
export function textControls(root: Element): HTMLElement[] {
	return [...root.querySelectorAll<HTMLElement>(TEXT_CONTROL)].filter(
		(el) => !el.closest('[inert]') && el.getClientRects().length > 0
	)
}

/** Focusable descendants that are rendered (a `display: none` control is skipped). */
export function focusables(root: Element): HTMLElement[] {
	return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
		(el) => !el.closest('[inert]') && el.getClientRects().length > 0
	)
}
