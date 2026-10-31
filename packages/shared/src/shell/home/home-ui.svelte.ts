// Whether the change-home sheet is open (D-143): one $state object, so Meadow's home pin, Sky's menu and the General
// tab all reach the same sheet. `opened` counts the openings; the sheet starts afresh from the home at each.
class HomeUi {
	open = $state(false)
	opened = $state(0)

	show() {
		this.opened += 1
		this.open = true
	}
}

export const homeUi = new HomeUi()
