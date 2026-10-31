// What Vigor's three quick actions read and parse (D-12, D-145): the weight as typed, and what the Quick Log sheet and
// the Garden's quick-log tile show beside each field. Pure: the data, today and the measurement system arrive as
// parameters; `tools.ts` binds them to the store and the owner's settings.
import type { QuickLogReadout } from '../define.js'
import type { MeasurementSystem } from '../../types/index.js'
import { dailyWeights, dayOf, isDone, sevenDayAverage } from './progress.js'
import type { FitnessData } from './types.js'
import { fromDisplay, round1, toDisplay, unitOf } from './units.js'

/** A weight's bounds, in the unit it was typed in: above 0 and below 1000. */
export const WEIGHT_MAX = 1000
/** How many daily weights the readout's sparkline draws. */
export const READOUT_DAYS = 7

/** A weight as typed (`82.4`, `82,4`, in the owner's unit), as kg; nothing when it is not a weight. */
export function parseWeight(text: string, system: MeasurementSystem): number | undefined {
	const typed = text.trim().replace(',', '.')
	if (!/^\d+(\.\d+)?$|^\.\d+$/.test(typed)) return undefined
	const value = Number(typed)
	if (!Number.isFinite(value) || value <= 0 || value >= WEIGHT_MAX) return undefined
	return fromDisplay('weight', value, system)
}

/** The template titles a `workout-done` offers, the one planned for today (and not done yet) first. */
export function workoutOptions(data: Pick<FitnessData, 'templates' | 'sessions' | 'logs'>, today: string): string[] {
	const planned = data.sessions
		.filter((session) => dayOf(session.startAt) === today && !isDone(session, data.logs))
		.sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))[0]
	const first = data.templates.find((template) => template.id === planned?.templateId)
	const titles = data.templates.map((template) => template.title)
	return first ? [first.title, ...titles.filter((title) => title !== first.title)] : titles
}

export interface ReadoutWords {
	/** When a value was logged, as the sheet says it: "today 06:52". */
	when: (iso: string) => string
}

/**
 * What each quick action's tab shows: the weight's unit, last value, the last seven daily weights oldest first and
 * their average as the reference; the workouts' and the supplements' options.
 */
export function readouts(
	data: FitnessData,
	today: string,
	system: MeasurementSystem = 'metric',
	words: ReadoutWords = { when: (iso) => iso }
): Record<'log-weight' | 'workout-done' | 'took-supplement', QuickLogReadout> {
	const unit = unitOf('weight', system)
	const weights = dailyWeights(data.metrics)
	const latest = weights.at(-1)
	const average = sevenDayAverage(weights)
	const lastIntake = data.intakes[0]
	const lastSupplement = lastIntake && data.supplements.find((entry) => entry.id === lastIntake.supplementId)
	return {
		'log-weight': {
			unit,
			last: latest
				? { value: `${toDisplay('weight', latest.value, system).toFixed(1)} ${unit}`, when: words.when(latest.at) }
				: undefined,
			series: weights.slice(-READOUT_DAYS).map((weight) => toDisplay('weight', weight.value, system)),
			reference: average === undefined ? undefined : round1(toDisplay('weight', average, system)),
		},
		'workout-done': { options: workoutOptions(data, today) },
		'took-supplement': {
			options: data.supplements.map((entry) => entry.name),
			last: lastSupplement ? { value: lastSupplement.name, when: words.when(lastIntake.at) } : undefined,
		},
	}
}
