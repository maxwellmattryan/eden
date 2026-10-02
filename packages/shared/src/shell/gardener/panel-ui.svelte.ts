// Whether the Gardener's panel is open and where it was opened from: one $state object so the sidebar's entry, ⌘G,
// the status bar's chip, a domain page's action and a deep link all reach the same panel. Whether it is open and its
// domain are kept on the device (`gardenerPanelState`), so the next launch finds the panel as it was left.
import { gardenerPanelState, rememberGardenerPanel } from '../../gardener/index.js'

const kept = gardenerPanelState()

class GardenerUi {
	open = $state(kept.open)
	/** The domain the panel was opened from: its tools come first and its reads fill the chip (ai.md, "Surfaces"). */
	domain = $state<string | undefined>(kept.domain)
	/** The URIs the next conversation is about, when the panel was opened on something (an idea to brainstorm). */
	focus = $state<string[]>([])
	/** A tool the panel should run as soon as it opens, with its input; the Ideas view's brainstorm button sets it. */
	pending = $state<{ tool: string; input: unknown } | undefined>()

	/** Opens the panel, on a domain when one is named. */
	show(domain?: string, focus: string[] = [], pending?: { tool: string; input: unknown }) {
		this.domain = domain
		this.focus = focus
		this.pending = pending
		this.open = true
		rememberGardenerPanel({ open: true, domain })
	}

	toggle() {
		if (this.open) this.hide()
		else this.show(this.domain)
	}

	hide() {
		this.open = false
		rememberGardenerPanel({ open: false })
	}
}

export const gardenerUi = new GardenerUi()
