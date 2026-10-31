// What Vigor's quick actions write and read (D-12, D-145), bound to the store and the owner's settings: a weight as
// typed (kg, or lb under the imperial system), a template done today, a supplement taken now. A value the action will
// not write is refused with its reason. Vigor declares no Gardener tools yet (a handoff in domains/fitness.md).
import { get } from 'svelte/store'
import { locale, t } from '../../i18n/index.js'
import { todayIso } from '../../dates/index.js'
import { settings } from '../../settings/index.js'
import { QuickLogRefusal, type QuickActionHandler, type QuickLogReadout } from '../define.js'
import { parseWeight, readouts } from './quick.js'
import { fitness } from './store.svelte.js'
import { whenLine } from './words.js'

const refuse = (key: string): never => {
	throw new QuickLogRefusal(key)
}

export const fitnessQuickActions: Record<string, QuickActionHandler> = {
	'log-weight': (value) => {
		const kg = parseWeight(value, settings.measurement) ?? refuse('domains.fitness.quick.weightInvalid')
		return fitness.logMetric('weight', kg, { source: 'quick-log' })
	},
	'workout-done': (value) => fitness.workoutDone(value) ?? refuse('domains.fitness.quick.unknownOption'),
	'took-supplement': (value) => fitness.tookNamed(value) ?? refuse('domains.fitness.quick.unknownOption'),
}

/** What the Quick Log sheet and the Garden's quick-log tile show beside each of Vigor's fields. */
function current() {
	const tr = get(t)
	const format = { lang: get(locale) ?? 'en', clock: settings.clock }
	return readouts(fitness.data(), todayIso(), settings.measurement, { when: (iso) => whenLine(iso, tr, format) })
}

export const fitnessQuickReadouts: Record<string, () => QuickLogReadout> = {
	'log-weight': () => current()['log-weight'],
	'workout-done': () => current()['workout-done'],
	'took-supplement': () => current()['took-supplement'],
}
