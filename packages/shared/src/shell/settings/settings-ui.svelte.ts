// Whether the settings sheet is open and which tab shows: one $state object so the sidebar's Settings item, the ⌘,
// shortcut, the phone's More page and a deep link all reach the same sheet. Both apps read this one class. The
// phone's drawer has two levels, the list of tabs and one tab (`level`); desktop shows both at once and ignores it.
import type { IconName } from '@eden/ui-kit'

export const settingsTabs = [
	'general',
	'appearance',
	'domains',
	'gardener',
	'privacy',
	'notifications',
	'integrations',
	'shortcuts',
	'sync',
	'diagnostics',
	'about',
] as const
export type SettingsTabId = (typeof settingsTabs)[number]

/** The rail's glyph per tab, from the kit's Lucide subset. */
export const settingsTabIcons: Record<SettingsTabId, IconName> = {
	general: 'sliders-horizontal',
	appearance: 'palette',
	domains: 'layout-grid',
	gardener: 'gardener',
	privacy: 'shield',
	notifications: 'bell',
	integrations: 'plug',
	shortcuts: 'keyboard',
	sync: 'refresh-cw',
	diagnostics: 'terminal',
	about: 'info',
}

class SettingsUi {
	open = $state(false)
	tab = $state<SettingsTabId>('general')
	/** The phone's drawer: the list of tabs, or the one in `tab`. */
	level = $state<'list' | 'tab'>('list')

	/** Opens the sheet, on a tab when one is named; with none the phone's drawer opens on its list. */
	show(tab?: SettingsTabId) {
		if (tab) this.tab = tab
		this.level = tab ? 'tab' : 'list'
		this.open = true
	}

	hide() {
		this.open = false
	}

	/**
	 * One step back in the phone's drawer, and whether there was one to take: a tab gives way to the list, the list
	 * closes the drawer. What the Android back button asks before it leaves the page.
	 */
	back(): boolean {
		if (!this.open) return false
		if (this.level === 'tab') this.level = 'list'
		else this.hide()
		return true
	}
}

export const settingsUi = new SettingsUi()
