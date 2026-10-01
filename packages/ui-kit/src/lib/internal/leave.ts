const toMs = (value: string) => (value.trim().endsWith('ms') ? parseFloat(value) : parseFloat(value) * 1000) || 0

/**
 * Lets an overlay leave the way it came. Sets `data-closing` on the element, which its stylesheet answers with the
 * same state the enter transition starts from, waits out the longest transition on `watch` (the element itself, or
 * the part of it that moves) and then calls `done`, which really hides it: hidePopover(), close(). Hiding first would
 * take the element out of the top layer before it had faded; holding it there with `overlay` and `display`
 * transitions works in one engine only. On its way out the element is inert: nothing in it can be pressed a second
 * time, and it has already left the accessibility tree. With no duration to wait for (reduced motion zeroes the panel duration)
 * `done` runs at once. Returns a cancel for an overlay that is opened again, or destroyed, on its way out: the
 * attribute comes off, so the element eases back from wherever it had got to. Calling it afterwards does nothing.
 */
export function leave(el: HTMLElement, done: () => void, watch: HTMLElement = el): () => void {
	el.dataset.closing = ''
	el.inert = true
	const duration = Math.max(0, ...getComputedStyle(watch).transitionDuration.split(',').map(toMs))
	let timer: ReturnType<typeof setTimeout> | undefined
	const finish = () => {
		timer = undefined
		delete el.dataset.closing
		el.inert = false
		done()
	}
	if (!duration) {
		finish()
		return () => {}
	}
	timer = setTimeout(finish, duration)
	return () => {
		if (timer === undefined) return
		clearTimeout(timer)
		timer = undefined
		delete el.dataset.closing
		el.inert = false
	}
}

/** True while the element is on its way out. */
export const isLeaving = (el: HTMLElement | undefined) => el?.dataset.closing !== undefined
