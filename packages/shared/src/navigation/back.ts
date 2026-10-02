// The back stack (D-158): what the system's back press closes before it leaves the page. A view that
// pushes a detail over its list in a narrow page (D-112), or anything else that is open without being a `<dialog>`
// or a popover, holds a handler for as long as it is open; the phone's shell asks the top one first when Android's
// back is pressed, after the sheets and before history. Desktop never asks. The module is pure.

const held: (() => boolean)[] = []

/**
 * Holds the back press while something is open. The handler answers whether it used the press (it closed what it
 * holds); the return value releases it, and is safe to call twice.
 *
 *     $effect(() => (detail ? holdBack(() => (close(), true)) : undefined))
 */
export function holdBack(handler: () => boolean): () => void {
	held.push(handler)
	return () => {
		const at = held.lastIndexOf(handler)
		if (at >= 0) held.splice(at, 1)
	}
}

/** Gives the press to the handlers, the latest first, until one uses it; false when none did. */
export function takeBack(): boolean {
	for (const handler of [...held].reverse()) {
		if (handler()) return true
	}
	return false
}
