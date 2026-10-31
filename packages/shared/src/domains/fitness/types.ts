// Vigor's shapes (product/domains/fitness.md, "Entities"). The store holds them with their ids; a row's payload is
// the same shape without the id, which the row carries itself. Every measure is stored metric (kg, cm; D-177) and
// shown in the owner's system (D-58). A planned session is not an entity: it is a `workout-session` Event.
import type { EntityTypeId } from '../../registry/index.js'

/** A custom exercise; the bundled ones are constants (`./exercises.ts`) and never rows. */
export interface Exercise {
	id: string
	name: string
	muscles: string[]
	equipment: string[]
}

export interface TemplateExercise {
	/** A bundled exercise's id (`x-<kebab>`) or a custom `exercise` row's. */
	exerciseId: string
	name: string
	sets: number
	reps: number
}
export interface WorkoutTemplate {
	id: string
	title: string
	/** Estimated minutes. */
	minutes: number
	exercises: TemplateExercise[]
}

export interface WorkoutSet {
	reps: number
	/** kg; none for bodyweight. */
	load?: number
}
export interface LoggedExercise {
	exerciseId: string
	name: string
	sets: WorkoutSet[]
}
export interface WorkoutLog {
	id: string
	templateId?: string
	title: string
	/** The day it was done, `YYYY-MM-DD`. */
	date: string
	gymId?: string
	minutes: number
	/** Rate of perceived exertion, 1 to 10. */
	rpe?: number
	exercises: LoggedExercise[]
	/** The `workout-session` Event it was planned as. */
	sessionId?: string
}

/** A `workout-session` Event: a template planned for a time. */
export interface PlannedSession {
	id: string
	templateId?: string
	title: string
	/** When it starts, as an ISO instant. */
	startAt: string
}

export interface Gym {
	id: string
	name: string
	equipment: string[]
	hours?: string
	notes?: string
	/** The id of the `venue` Place it is at. */
	placeId?: string
}

export interface TrainingGoal {
	id: string
	kind: 'weight'
	/** kg. */
	target: number
	/** `YYYY-MM-DD`. */
	by: string
}

export type MetricKind = 'weight' | 'body-fat' | 'waist'
export const METRIC_KINDS: readonly MetricKind[] = ['weight', 'body-fat', 'waist']
export interface BodyMetric {
	id: string
	kind: MetricKind
	/** kg, %, cm. */
	value: number
	/** When it was taken, as an ISO instant. */
	at: string
	source: 'manual' | 'quick-log'
}

export type SupplementWhen = 'daily' | 'pre-workout' | 'as-needed'
export const SUPPLEMENT_WHEN: readonly SupplementWhen[] = ['daily', 'pre-workout', 'as-needed']
export interface Supplement {
	id: string
	name: string
	brand?: string
	dose: string
	when: SupplementWhen
	/** The URI of the Hearth `stock-item` it is kept as. */
	stockItemUri?: string
}
export interface IntakeLog {
	id: string
	supplementId: string
	/** ISO instant. */
	at: string
}

export interface FitnessData {
	/** The custom exercises. */
	exercises: Exercise[]
	templates: WorkoutTemplate[]
	/** Newest first. */
	logs: WorkoutLog[]
	/** Soonest first. */
	sessions: PlannedSession[]
	gyms: Gym[]
	supplements: Supplement[]
	/** Newest first. */
	intakes: IntakeLog[]
	/** Newest first. */
	metrics: BodyMetric[]
	goal?: TrainingGoal
}

/** The registry ids of Vigor's entity types (product/substrate/registry.md). */
export const FITNESS = {
	exercise: 'exercise',
	template: 'workout-template',
	log: 'workout-log',
	gym: 'gym',
	goal: 'training-goal',
	metric: 'body-metric',
	supplement: 'supplement',
	intake: 'intake-log',
} as const satisfies Record<string, EntityTypeId>
/** The kind of Event a planned session is. */
export const SESSION_KIND = 'workout-session'

type Payload<T extends { id: string }> = Omit<T, 'id'>
export type ExercisePayload = Payload<Exercise>
export type TemplatePayload = Payload<WorkoutTemplate>
export type LogPayload = Payload<WorkoutLog>
export type GymPayload = Payload<Gym>
export type GoalPayload = Payload<TrainingGoal>
export type MetricPayload = Payload<BodyMetric>
export type SupplementPayload = Payload<Supplement>
export type IntakePayload = Payload<IntakeLog>
