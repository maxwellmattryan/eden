// Vigor's logic (product/domains/fitness.md): its store, what its quick actions write and read, and what its rows are
// called where the Gardener lists what it read. What Vigor declares is in `./manifest.json`; its page and its Garden
// tiles are bound by each app (`src/lib/domains/fitness/manifest.ts`).
import { get } from 'svelte/store'
import type { Entity } from '../../data/index.js'
import { t } from '../../i18n/index.js'
import { settings } from '../../settings/index.js'
import type { DomainLogic } from '../define.js'
import { fitness } from './store.svelte.js'
import { fitnessQuickActions, fitnessQuickReadouts } from './tools.js'
import { FITNESS, type IntakePayload, type LogPayload, type MetricPayload } from './types.js'
import { toDisplay, unitOf } from './units.js'

const logLabel = (row: Entity<object>) => {
	const log = row.payload as Partial<LogPayload>
	return log.title && log.date ? `${log.title} ${log.date}` : log.title
}
const metricLabel = (row: Entity<object>) => {
	const metric = row.payload as Partial<MetricPayload>
	if (!metric.kind || typeof metric.value !== 'number') return undefined
	const kind = get(t)(`domains.fitness.body.kinds.${metric.kind}`)
	return `${kind} ${toDisplay(metric.kind, metric.value, settings.measurement).toFixed(1)} ${unitOf(metric.kind, settings.measurement)}`
}
const intakeLabel = async (row: Entity<object>) => {
	await fitness.load()
	const intake = row.payload as Partial<IntakePayload>
	return fitness.supplements.find((supplement) => supplement.id === intake.supplementId)?.name
}

export const fitnessLogic: DomainLogic<'fitness'> = {
	id: 'fitness',
	load: () => fitness.load(),
	reload: () => fitness.reload(),
	seed: () => fitness.seed(get(t)('domains.fitness.name')),
	labels: { [FITNESS.log]: logLabel, [FITNESS.metric]: metricLabel, [FITNESS.intake]: intakeLabel },
	quickActionHandlers: fitnessQuickActions,
	quickActionReadouts: fitnessQuickReadouts,
}
