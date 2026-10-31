// The sample dataset (design/sample-data.md, "Vigor") mapped into the store's shapes: the three templates, seven logs
// giving a streak of six, Friday's planned Push A, the two gyms, LMNT citrus and creatine with their intakes, the
// fortnight of weights with body fat and waist, and the goal. Days keep their distance from the dataset's today. A
// gym or a supplement is linked to the venue Place or the Hearth stock item of its name, when the workspace has one.
import {
	bodyMetrics,
	gyms,
	intakeLog,
	plannedSessions,
	supplements,
	weightDays,
	weightGoal,
	weightGoalBy,
	weightSeries,
	weightTime,
	workoutLogs,
	workoutTemplates,
} from '@eden/ui-kit/sample-data'
import { shiftSampleDate } from '../../dates/index.js'
import { toUri } from '../../data/index.js'
import { startAtOf } from './progress.js'
import type { BodyMetric, FitnessData } from './types.js'

/** A sample day and time (`MM-DD`, `HH:MM`) as an instant on the device's clock, shifted onto today. */
const instant = (day: string, time: string) => startAtOf(shiftSampleDate(day), time)

export interface SeedLinks {
	/** The workspace's venue Places. */
	venues: readonly { id: string; name: string }[]
	/** The workspace's Hearth stock items, by id. */
	stock: readonly { id: string; name: string }[]
}

export function seedData(links: SeedLinks = { venues: [], stock: [] }): FitnessData {
	const venueNamed = (name?: string) => links.venues.find((venue) => venue.name === name)?.id
	const stockNamed = (name?: string) => links.stock.find((item) => item.name === name)?.id
	const weights: BodyMetric[] = weightSeries.map((value, i) => ({
		id: `bw-${i}`,
		kind: 'weight',
		value,
		at: instant(weightDays[i]!, weightTime),
		source: 'manual',
	}))
	const others: BodyMetric[] = bodyMetrics.map((metric) => ({
		id: metric.id,
		kind: metric.kind,
		value: metric.value,
		at: instant(metric.day, '07:00'),
		source: 'manual',
	}))
	return {
		exercises: [],
		templates: workoutTemplates.map((template) => ({
			id: template.id,
			title: template.title,
			minutes: template.minutes,
			exercises: template.exercises.map((exercise) => ({ ...exercise })),
		})),
		logs: workoutLogs.map((log) => ({
			id: log.id,
			templateId: log.templateId,
			title: log.title,
			date: shiftSampleDate(log.day),
			gymId: log.gymId,
			minutes: log.minutes,
			rpe: log.rpe,
			exercises: log.exercises.map((exercise) => ({ ...exercise, sets: exercise.sets.map((set) => ({ ...set })) })),
		})),
		sessions: plannedSessions.map((session) => ({
			id: session.id,
			templateId: session.templateId,
			title: session.title,
			startAt: instant(session.day, session.time),
		})),
		gyms: gyms.map((gym) => {
			const placeId = venueNamed(gym.place?.name)
			return {
				id: gym.id,
				name: gym.name,
				equipment: [...gym.equipment],
				...(gym.hours ? { hours: gym.hours } : {}),
				...(gym.notes ? { notes: gym.notes } : {}),
				...(placeId ? { placeId } : {}),
			}
		}),
		supplements: supplements.map((supplement) => {
			const stockId = stockNamed(supplement.stockItem)
			return {
				id: supplement.id,
				name: supplement.name,
				...(supplement.brand ? { brand: supplement.brand } : {}),
				dose: supplement.dose,
				when: supplement.when,
				...(stockId ? { stockItemUri: toUri('stock-item', stockId) } : {}),
			}
		}),
		intakes: intakeLog.map((intake) => ({
			id: intake.id,
			supplementId: intake.supplementId,
			at: instant(intake.day, intake.time),
		})),
		metrics: [...weights, ...others].sort((a, b) => b.at.localeCompare(a.at)),
		goal: { id: 'goal', kind: 'weight', target: weightGoal, by: shiftSampleDate(weightGoalBy) },
	}
}
