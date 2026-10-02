// The phone's chrome as the pages may steer it (D-TBD(phone-chrome)): one $state object, so a phone-own view can
// ask the floating + to stand down while it has a mode of its own on screen (the Garden's edit mode), and the layout
// hears it. Nothing here is kept: it is the session's.
class Chrome {
	/** How many views are asking the floating + to stand down. */
	#suppressed = $state(0)

	/** Whether the floating + is hidden because a view asked. */
	get fabSuppressed(): boolean {
		return this.#suppressed > 0
	}

	/**
	 * Hides the floating + until the return value is called; safe to call twice. In a component:
	 *
	 *     $effect(() => (editing ? chrome.suppressFab() : undefined))
	 */
	suppressFab(): () => void {
		let held = true
		this.#suppressed += 1
		return () => {
			if (!held) return
			held = false
			this.#suppressed -= 1
		}
	}
}

export const chrome = new Chrome()
