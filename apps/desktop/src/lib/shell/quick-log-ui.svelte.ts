// Whether the Quick Log sheet is open and on which tab: one $state object so ⌘⇧L, Today's strip, the Garden's tile
// and the palette's `run` (issue 23) all reach the same sheet.
import { quickLogTarget } from '@eden/shared/quick-log'
import { quickLogActions, quickLogKey, saveQuickLog } from './quick-log'

class QuickLogUi {
	opened = $state(false)
	/** The tab, as an index into `quickLogEntries()`. */
	selected = $state(0)

	/** Opens the sheet, on the tab of the action named when there is one. */
	show(key?: string): void {
		const index = key ? quickLogActions().findIndex((action) => quickLogKey(action) === key) : -1
		if (index >= 0) this.selected = index
		this.opened = true
	}
}

export const quickLogUi = new QuickLogUi()

/** What a chip, a tile or the palette's `run` does with a quick action: a launch opens its surface, a field its tab. */
export function runQuickLog(key: string): void {
	const action = quickLogActions().find((entry) => quickLogKey(entry) === key)
	if (!action) return
	if (quickLogTarget(action) === 'launch') void saveQuickLog(key, '')
	else quickLogUi.show(key)
}
