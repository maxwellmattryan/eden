import { within } from 'storybook/test'

/**
 * The canvas a play function should act on. In the Storybook UI the platform frame renders a story once per platform,
 * so queries over the whole story root find two of everything; this scopes them to the first canvas (the desktop one
 * when both are shown). Under Vitest each project pins one platform, so it is the only canvas there.
 */
export function canvasOf(canvasElement: HTMLElement) {
	return within(canvasElement.querySelector<HTMLElement>('.ed-canvas') ?? canvasElement)
}

/**
 * True when the story rendered a canvas. A single-platform story still runs under the other platform's Vitest
 * project, where the frame shows only a note; a play function starts with `if (!hasCanvas(canvasElement)) return`.
 */
export function hasCanvas(canvasElement: HTMLElement) {
	return canvasElement.querySelector('.ed-canvas') !== null
}

/**
 * Moves the pointer to a place across an element: a fraction of its width, at its middle height. What a chart's
 * story uses to read the point there.
 */
export function pointAcross(
	userEvent: { pointer: (input: { target: Element; coords: { clientX: number; clientY: number } }) => Promise<void> },
	el: Element,
	across: number
): Promise<void> {
	const rect = el.getBoundingClientRect()
	return userEvent.pointer({
		target: el,
		coords: { clientX: rect.left + rect.width * across, clientY: rect.top + rect.height / 2 },
	})
}
