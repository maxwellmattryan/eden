// Whether the settings sheet is open and which tab shows: one $state object so the sidebar's Settings item, the ⌘,
// shortcut and a deep link all reach the same sheet.
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
