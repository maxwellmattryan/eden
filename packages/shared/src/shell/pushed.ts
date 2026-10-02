import { tick } from 'svelte'

/**
 * A pushed view (design/ux-patterns.md, "Page anatomy"): in a narrow page the detail takes the list's place, under a
 * back arrow that only shows then. Once the detail is in, this brings that arrow into view, since the list it
 * replaced may have been scrolled a long way down. In a wide page the arrow is not rendered and nothing moves.
 */
export async function showPushed(back: () => HTMLElement | undefined): Promise<void> {
	await tick()
	const el = back()
	// not rendered: the page is wide, and the detail stands beside its list
	if (!el?.offsetParent) return
	const { top, bottom } = el.getBoundingClientRect()
	if (top < 0 || bottom > window.innerHeight) el.scrollIntoView({ block: 'start' })
}
