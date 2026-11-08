// Activity's filters for the session (D-199): the chips and the search text, held in module state only, so they live
// as long as the webview. Moving between tabs and places keeps them; a reload or quitting the app wipes them. Nothing
// here is written to storage, the database or the address. #24 opens Activity already filtered through `add`.
import { toggledChip, withChip, withoutChip, type ActivityChip } from './activity.js'

export class ActivitySession {
	chips = $state<ActivityChip[]>([])
	text = $state('')

	add(chip: ActivityChip) {
		this.chips = withChip(this.chips, chip)
	}

	remove(key: string) {
		this.chips = withoutChip(this.chips, key)
	}

	toggle(chip: ActivityChip) {
		this.chips = toggledChip(this.chips, chip)
	}

	/** The chips only: the row's Clear leaves the search text alone. */
	clear() {
		this.chips = []
	}

	/** The chips and the text: Nothing matches' Clear filters. */
	reset() {
		this.chips = []
		this.text = ''
	}
}

export const activitySession = new ActivitySession()
