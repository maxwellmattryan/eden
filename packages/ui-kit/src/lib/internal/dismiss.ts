import type { Attachment } from 'svelte/attachments'
import type { AnchorLike } from './anchor.js'

export type DismissReason = 'escape' | 'outside' | 'focusout'

export interface DismissOptions {
	/** When false the attachment does nothing (a closed overlay). */
	when?: boolean
	onDismiss(reason: DismissReason): void
	/** Elements that count as inside: the anchor button, for one. */
	ignore?: () => (AnchorLike | null | undefined)[]
	escape?: boolean
	outside?: boolean
	/** Also dismiss when focus leaves the element (tooltips). */
	focusout?: boolean
}

// Open layers, innermost last. Escape closes only the top layer; a pointer inside a layer above counts as inside.
const layers: HTMLElement[] = []

/**
 * Light dismissal for popovers, menus and tooltips: Escape, a pointer down outside, optionally focus leaving.
 * Modal sheets do not use this; `<dialog>` handles Escape through its `cancel` event.
 */
export function dismiss(get: () => DismissOptions): Attachment<HTMLElement> {
	return (el) => {
		const options = get()
		if (options.when === false) return
		layers.push(el)

		const contains = (target: EventTarget | null) => {
			if (!(target instanceof Node)) return false
			if (el.contains(target)) return true
			const above = layers.slice(layers.indexOf(el) + 1)
			if (above.some((layer) => layer.contains(target))) return true
			return (options.ignore?.() ?? []).some((x) => x && typeof x.contains === 'function' && x.contains(target))
		}
		const onPointerDown = (e: PointerEvent) => {
			if (options.outside !== false && !contains(e.target)) options.onDismiss('outside')
		}
		const onKeyDown = (e: KeyboardEvent) => {
			if (options.escape === false || e.key !== 'Escape' || e.defaultPrevented) return
			if (layers[layers.length - 1] !== el) return
			e.preventDefault()
			e.stopPropagation()
			options.onDismiss('escape')
		}
		const onFocusOut = (e: FocusEvent) => {
			if (options.focusout && e.relatedTarget && !contains(e.relatedTarget)) options.onDismiss('focusout')
		}
		document.addEventListener('pointerdown', onPointerDown, true)
		document.addEventListener('keydown', onKeyDown, true)
		el.addEventListener('focusout', onFocusOut)
		return () => {
			document.removeEventListener('pointerdown', onPointerDown, true)
			document.removeEventListener('keydown', onKeyDown, true)
			el.removeEventListener('focusout', onFocusOut)
			const i = layers.indexOf(el)
			if (i !== -1) layers.splice(i, 1)
		}
	}
}
