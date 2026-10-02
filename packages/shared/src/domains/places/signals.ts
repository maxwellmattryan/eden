// Meadow on the scheduler (product/domains/places.md, "Kinds, signals, notifications"; D-134). Its one schedule fires
// each morning, as Hearth's does, and on a Sunday it runs the weekly listings search: a model request nobody
// pressed, so it is held to the limits of D-134. It runs at most once for a Sunday, on that Sunday or on the Monday
// after when Sunday's could not run; only when the owner has left it on; and it says what it found in a notification
// that names it as the weekly search. The search itself is the app's to run (the Gardener's runtime is not in this
// package), and so is the owner's setting, so both are given when the domain is bound.
import { todayIso } from '../../dates/index.js'
import { emit, onSchedule } from '../../signals/runtime.js'
import { sundayOf, weeklyDue, type WeeklyState } from './listings.js'

/** The repeating schedule the manifest declares. */
export const WEEKLY_SCHEDULE = 'places.weekly'
const STATE_KEY = 'eden:places:weekly'

/** How a weekly run went: `busy` is tried again the next morning; anything else settles the week. */
export interface WeeklyOutcome {
	outcome: 'found' | 'nothing' | 'busy' | 'skipped'
	/** The titles of what was found, the soonest first. */
	titles?: string[]
}

function readState(): WeeklyState {
	try {
		const raw = JSON.parse(localStorage.getItem(STATE_KEY) ?? 'null') as WeeklyState | null
		return raw && typeof raw.doneFor === 'string' ? { doneFor: raw.doneFor } : {}
	} catch {
		return {}
	}
}

function writeState(state: WeeklyState) {
	try {
		localStorage.setItem(STATE_KEY, JSON.stringify(state))
	} catch {
		// no storage: the week is asked again tomorrow, and the signal's key keeps it to one notification
	}
}

/**
 * One morning of the schedule: whether the weekly search is due, the search, and what is said of it. `search` is
 * the app's; `today` and the state's read and write are given so a test runs it without a clock or a device.
 */
export async function weeklyMorning(
	search: () => Promise<WeeklyOutcome>,
	options: {
		today?: string
		/** Whether the owner has left the weekly search on; on unless said. */
		on?: boolean
		read?: () => WeeklyState
		write?: (state: WeeklyState) => void
		say?: (payload: { count: number; first: string }, key: string) => Promise<unknown>
	} = {}
): Promise<WeeklyOutcome['outcome'] | 'off' | 'not-due'> {
	const today = options.today ?? todayIso()
	if (options.on === false) return 'off'
	const state = (options.read ?? readState)()
	if (!weeklyDue(today, state)) return 'not-due'
	const result = await search()
	// the Gardener was at another request: the week stays open, and tomorrow morning tries once more
	if (result.outcome === 'busy') return 'busy'
	const sunday = sundayOf(today)
	;(options.write ?? writeState)({ doneFor: sunday })
	const titles = result.titles ?? []
	if (result.outcome === 'found' && titles.length) {
		const say = options.say ?? ((payload, key) => emit('listing.matched', payload, { dedupeKey: key }))
		await say({ count: titles.length, first: titles[0]! }, sunday)
	}
	return result.outcome
}

/** Binds Meadow to its schedule; the shell calls it once when it starts, and the answer unbinds. */
export function bindPlacesSignals(search: () => Promise<WeeklyOutcome>, on: () => boolean): () => void {
	return onSchedule(WEEKLY_SCHEDULE, async () => {
		await weeklyMorning(search, { on: on() })
	})
}
