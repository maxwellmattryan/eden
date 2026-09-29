// Whether the settings sheet is open: one $state object so More and a deep link reach the same sheet.
class SettingsUi {
	open = $state(false)

	show() {
		this.open = true
	}

	hide() {
		this.open = false
	}
}

export const settingsUi = new SettingsUi()
