import type { Attachment } from 'svelte/attachments'

export interface RovingOptions {
	/** The items, as a selector scoped to the element. */
	selector: string
	orientation?: 'vertical' | 'horizontal' | 'both'
	/** Wrap from the last item to the first. Default true. */
	loop?: boolean
	/** Home and End jump to the ends. Default true. */
	homeEnd?: boolean
	/** Typing a letter jumps to the next item whose text starts with it (500 ms buffer). Default false. */
	typeahead?: boolean
	/** The item that should hold the tab stop when nothing has been focused yet. Default: aria-selected, aria-current or the first. */
	current?: () => number
	/** Called when focus lands on an item through the keyboard. */
	onMove?(el: HTMLElement, index: number): void
}

/**
 * Roving tabindex: one tab stop for the whole group, arrows (and Home/End, and optional typeahead) move focus inside.
 * Used by menus, the segmented control, lists in select mode, the sidebar and the bottom tab bar. Activation
 * (Enter, Space, click) stays with the component; this only moves focus.
 */
export function roving(get: () => RovingOptions): Attachment<HTMLElement> {
	return (el) => {
		const options = get()
		const items = () => [...el.querySelectorAll<HTMLElement>(options.selector)]
		const currentIndex = () => {
			const list = items()
			if (options.current) return Math.max(0, Math.min(options.current(), list.length - 1))
			const marked = list.findIndex((i) => i.getAttribute('aria-selected') === 'true' || i.hasAttribute('aria-current'))
			return marked === -1 ? 0 : marked
		}
		const setStops = (active: number) =>
			items().forEach((item, i) => item.setAttribute('tabindex', i === active ? '0' : '-1'))
		setStops(currentIndex())

		let buffer = ''
		let bufferTimer: ReturnType<typeof setTimeout> | undefined
		const focusIndex = (i: number) => {
			const list = items()
			if (!list.length) return
			const n = options.loop === false ? Math.max(0, Math.min(i, list.length - 1)) : (i + list.length) % list.length
			setStops(n)
			list[n]!.focus()
			options.onMove?.(list[n]!, n)
		}
		const onKeyDown = (e: KeyboardEvent) => {
			const list = items()
			const from = list.indexOf(document.activeElement as HTMLElement)
			if (from === -1) return
			const o = options.orientation ?? 'vertical'
			const next = o !== 'horizontal' && e.key === 'ArrowDown' ? 1 : o !== 'vertical' && e.key === 'ArrowRight' ? 1 : 0
			const prev = o !== 'horizontal' && e.key === 'ArrowUp' ? 1 : o !== 'vertical' && e.key === 'ArrowLeft' ? 1 : 0
			if (next || prev) {
				e.preventDefault()
				focusIndex(from + (next ? 1 : -1))
			} else if (options.homeEnd !== false && (e.key === 'Home' || e.key === 'End')) {
				e.preventDefault()
				focusIndex(e.key === 'Home' ? 0 : list.length - 1)
			} else if (options.typeahead && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
				clearTimeout(bufferTimer)
				buffer += e.key.toLowerCase()
				bufferTimer = setTimeout(() => (buffer = ''), 500)
				const start = buffer.length === 1 ? from + 1 : from
				const order = [...list.slice(start), ...list.slice(0, start)]
				const hit = order.find((item) => (item.textContent ?? '').trim().toLowerCase().startsWith(buffer))
				if (hit) {
					e.preventDefault()
					focusIndex(list.indexOf(hit))
				}
			}
		}
		const onFocusIn = (e: FocusEvent) => {
			const i = items().indexOf(e.target as HTMLElement)
			if (i !== -1) setStops(i)
		}
		el.addEventListener('keydown', onKeyDown)
		el.addEventListener('focusin', onFocusIn)
		const observer = new MutationObserver(() => setStops(currentIndex()))
		observer.observe(el, { childList: true, subtree: true })
		return () => {
			el.removeEventListener('keydown', onKeyDown)
			el.removeEventListener('focusin', onFocusIn)
			observer.disconnect()
			clearTimeout(bufferTimer)
		}
	}
}
