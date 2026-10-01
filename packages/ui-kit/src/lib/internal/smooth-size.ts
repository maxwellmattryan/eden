import type { Attachment } from 'svelte/attachments'

export interface SmoothSizeOptions {
	/** When false the attachment measures nothing and animates nothing. */
	active?: boolean
}

/**
 * Eases a frame from its old size to its new one whenever the body inside it changes: a popover that unfolds a row
 * grows over the panel duration instead of jumping. Attached to the body; the frame is its parent. The trigger is
 * the DOM change itself (a MutationObserver, delivered before the next layout), not a ResizeObserver: resizing the
 * frame from inside a resize callback is the loop the browser reports as "undelivered notifications". The old size
 * is remembered from the last settle; the new one is measured once the change is in. A change that lands while an
 * animation is still running (rows that arrive a moment after their region opens) starts from where the frame is
 * on screen, and the running animation is cancelled before the target is measured: while it runs, the frame's
 * layout size is the animated one, and measuring that as the target is what made the frame stop short and snap.
 * The frame's real size is
 * already the new one, so the animation only paints the old size on the way there (Web Animations, no fill), and
 * the anchor attachment, which watches the frame, keeps it placed at every step. The duration and the curve come
 * from the tokens where the frame stands, so reduced motion (a zero duration) skips the animation.
 */
export function smoothSize(get: () => SmoothSizeOptions = () => ({})): Attachment<HTMLElement> {
	return (body) => {
		const frame = body.parentElement
		// read here, so the attachment re-runs as the frame opens and closes
		const active = get().active !== false
		if (!frame || !active) return
		// layout sizes, so the unfurl's scale does not count as a size
		const measure = () => ({ width: frame.offsetWidth, height: frame.offsetHeight })
		let last: { width: number; height: number } | undefined
		let running: Animation | undefined
		// the size the frame settles at once it is shown, remembered as the next animation's start
		const settle = () => {
			const size = measure()
			if (size.width && size.height) last = size
		}
		const raf = requestAnimationFrame(settle)
		const observer = new MutationObserver(() => {
			// mid-animation the layout size is the animated one: that is where this change starts from
			const from = running ? measure() : last
			running?.cancel()
			running = undefined
			const size = measure()
			if (!size.width || !size.height) return
			last = size
			if (!from || (from.width === size.width && from.height === size.height)) return
			const style = getComputedStyle(frame)
			const duration = parseFloat(style.getPropertyValue('--ed-duration-panel'))
			if (!duration) return
			running = frame.animate(
				[
					{ width: `${from.width}px`, height: `${from.height}px` },
					{ width: `${size.width}px`, height: `${size.height}px` },
				],
				{ duration, easing: style.getPropertyValue('--ed-ease-out').trim() || 'ease-out' }
			)
			running.onfinish = () => {
				running = undefined
				settle()
			}
		})
		observer.observe(body, { childList: true, subtree: true, attributes: true, characterData: true })
		window.addEventListener('resize', settle)
		return () => {
			cancelAnimationFrame(raf)
			observer.disconnect()
			window.removeEventListener('resize', settle)
			running?.cancel()
		}
	}
}
