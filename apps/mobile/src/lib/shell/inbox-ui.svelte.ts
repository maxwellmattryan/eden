// Whether the phone's inbox sheet is open: one $state object, so the top bar's bell and anything else that should
// lead to the inbox reach the same sheet (D-158).
class InboxUi {
	open = $state(false)

	show() {
		this.open = true
	}

	hide() {
		this.open = false
	}
}

export const inboxUi = new InboxUi()
