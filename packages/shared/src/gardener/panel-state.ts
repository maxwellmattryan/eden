// How the Gardener's panel was left, for the shell to bring it back as it was on the next launch: open or shut, the
// domain it was opened from, and the conversation it showed. Kept on the device and, like the last place
// (`@eden/shared/navigation`), not a setting, so it is in no export bundle. The module is pure and reads localStorage
// with the same care the settings do. The panel's width is a setting (`settings.gardenerPanelWidth`).

/** The device's own record of the Gardener panel. */
export const GARDENER_PANEL_KEY = 'eden:gardener-panel'

export type GardenerPanelState = {
	open: boolean
	/** The domain the panel was opened from, when it was opened from one. */
	domain?: string
	/** The conversation shown: an id, `null` for a new conversation, absent when none was ever recorded. */
	thread?: string | null
}

function read(key: string): string | null {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage.getItem(key)
	} catch {
		return null
	}
}

function write(key: string, value: string) {
	try {
		if (typeof localStorage !== 'undefined') localStorage.setItem(key, value)
	} catch {
		// no storage: the next launch opens with the panel shut
	}
}

/** The panel as it was left; shut, on no domain and no recorded conversation, when nothing readable was kept. */
export function gardenerPanelState(): GardenerPanelState {
	let kept: unknown
	try {
		kept = JSON.parse(read(GARDENER_PANEL_KEY) ?? 'null')
	} catch {
		kept = null
	}
	if (typeof kept !== 'object' || kept === null) return { open: false }
	const { open, domain, thread } = kept as Record<string, unknown>
	const state: GardenerPanelState = { open: open === true }
	if (typeof domain === 'string' && domain) state.domain = domain
	if (thread === null || (typeof thread === 'string' && thread)) state.thread = thread
	return state
}

/** Records what changed about the panel over what was kept; a key given as undefined is forgotten. */
export function rememberGardenerPanel(patch: Partial<GardenerPanelState>) {
	write(GARDENER_PANEL_KEY, JSON.stringify({ ...gardenerPanelState(), ...patch }))
}
