// Whether the settings sheet is open and which tab shows: one $state object so the sidebar's Settings item, the ⌘,
// shortcut and a deep link all reach the same sheet.
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

	/** Opens the sheet, on a tab when one is named. */
	show(tab?: SettingsTabId) {
		if (tab) this.tab = tab
		this.open = true
	}

	hide() {
		this.open = false
	}
}

export const settingsUi = new SettingsUi()
