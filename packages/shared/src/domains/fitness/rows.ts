// Between Vigor's shapes and its rows: a whole `FitnessData` as the writes that store it (the sample data), and the
// rows read back as a `FitnessData`. Each entity is a row of its type; a planned session is a `workout-session`
// Event linked `from` its template; a log done for a session names it and is linked `for` it (D-177).
import { parseUri, toUri, type BatchOp, type Entity, type EventInput, type EventRow } from '../../data/index.js'
import {
	FITNESS,
	SESSION_KIND,
	type BodyMetric,
	type Exercise,
	type ExercisePayload,
	type FitnessData,
	type GoalPayload,
	type Gym,
	type GymPayload,
	type IntakeLog,
	type IntakePayload,
	type LogPayload,
	type MetricPayload,
	type PlannedSession,
	type Supplement,
	type SupplementPayload,
	type TemplatePayload,
	type WorkoutLog,
	type WorkoutTemplate,
} from './types.js'

export interface FitnessRows {
	/** The data with the ids its rows have. */
	data: FitnessData
	ops: BatchOp[]
}

const create = (type: string, id: string, payload: object): BatchOp => ({
	op: 'createEntity',
	input: { id, type, payload },
})

/** A session as the Event that holds it, linked from its template. */
export function sessionInput(session: PlannedSession): EventInput {
	return {
		id: session.id,
		kind: SESSION_KIND,
		title: session.title,
		startAt: session.startAt,
		...(session.templateId
			? {
					links: [
						{ uri: toUri(FITNESS.template, session.templateId), relation: 'from' as const, label: session.title },
					],
				}
			: {}),
	}
}

/** A log's link to the session it was done for. */
export function sessionLink(log: Pick<WorkoutLog, 'id' | 'sessionId' | 'title'>): BatchOp[] {
	if (!log.sessionId) return []
	return [
		{
			op: 'link',
			owner: toUri(FITNESS.log, log.id),
			link: { uri: toUri('event', log.sessionId), relation: 'for', label: log.title },
		},
	]
}

/** Drops the id a record carries: what is left is its payload. */
function payloadOf<T extends { id: string }>(record: T): Omit<T, 'id'> {
	const { id: _id, ...rest } = record
	return rest
}

/**
 * The writes that store the data. Every record takes a new id, whatever id it had, and what points at another follows
 * it: a template's custom exercise, a log's template, gym and session, a session's template, an intake's supplement.
 * A pointer at something that is not in the data is dropped.
 */
export function fitnessRows(source: Partial<FitnessData>, newId: () => string): FitnessRows {
	const ops: BatchOp[] = []
	const renamed = <T extends { id: string }>(records: readonly T[] = []) => {
		const ids = new Map<string, string>()
		const out = records.map((record) => {
			const id = newId()
			ids.set(record.id, id)
			return { ...record, id }
		})
		return { out, ids }
	}
	const follow = <K extends string>(record: Partial<Record<K, string>>, key: K, ids: Map<string, string>) => {
		const old = record[key]
		const next = old === undefined ? undefined : ids.get(old)
		const { [key]: _gone, ...rest } = record
		return next ? { ...rest, [key]: next } : rest
	}

	const exercises = renamed(source.exercises)
	for (const exercise of exercises.out) ops.push(create(FITNESS.exercise, exercise.id, payloadOf(exercise)))

	const templates = renamed(source.templates)
	const templateList: WorkoutTemplate[] = templates.out.map((template) => ({
		...template,
		exercises: template.exercises.map((exercise) => ({
			...exercise,
			exerciseId: exercises.ids.get(exercise.exerciseId) ?? exercise.exerciseId,
		})),
	}))
	for (const template of templateList) ops.push(create(FITNESS.template, template.id, payloadOf(template)))

	const gyms = renamed(source.gyms)
	for (const gym of gyms.out) ops.push(create(FITNESS.gym, gym.id, payloadOf(gym)))

	const sessions = renamed(source.sessions)
	const sessionList = sessions.out.map((session) => follow(session, 'templateId', templates.ids) as PlannedSession)
	for (const session of sessionList) ops.push({ op: 'createPrimitive', type: 'event', input: sessionInput(session) })

	// the logs are listed newest first, so their ids are made from the last to the first: the newest has the greatest
	const oldestFirst = [...(source.logs ?? [])].reverse().map((log) => {
		let next = follow(log, 'templateId', templates.ids)
		next = follow(next, 'gymId', gyms.ids)
		next = follow(next, 'sessionId', sessions.ids)
		return {
			...next,
			exercises: log.exercises.map((exercise) => ({
				...exercise,
				exerciseId: exercises.ids.get(exercise.exerciseId) ?? exercise.exerciseId,
			})),
			id: newId(),
		} as WorkoutLog
	})
	for (const log of oldestFirst) ops.push(create(FITNESS.log, log.id, payloadOf(log)), ...sessionLink(log))

	const supplements = renamed(source.supplements)
	for (const supplement of supplements.out) ops.push(create(FITNESS.supplement, supplement.id, payloadOf(supplement)))

	const intakes = [...(source.intakes ?? [])]
		.reverse()
		.filter((intake) => supplements.ids.has(intake.supplementId))
		.map((intake) => ({ ...intake, supplementId: supplements.ids.get(intake.supplementId)!, id: newId() }))
	for (const intake of intakes) ops.push(create(FITNESS.intake, intake.id, payloadOf(intake)))

	const metrics = [...(source.metrics ?? [])].reverse().map((metric) => ({ ...metric, id: newId() }))
	for (const metric of metrics) ops.push(create(FITNESS.metric, metric.id, payloadOf(metric)))

	const goal = source.goal ? { ...source.goal, id: newId() } : undefined
	if (goal) ops.push(create(FITNESS.goal, goal.id, payloadOf(goal)))

	return {
		data: {
			exercises: exercises.out,
			templates: templateList,
			logs: oldestFirst.reverse(),
			sessions: sessionList,
			gyms: gyms.out,
			supplements: supplements.out,
			intakes: intakes.reverse(),
			metrics: metrics.reverse(),
			...(goal ? { goal } : {}),
		},
		ops,
	}
}

/** The URIs of the rows the data is stored in. */
export function fitnessUris(data: FitnessData): string[] {
	return [
		...data.exercises.map((record) => toUri(FITNESS.exercise, record.id)),
		...data.templates.map((record) => toUri(FITNESS.template, record.id)),
		...data.gyms.map((record) => toUri(FITNESS.gym, record.id)),
		...data.sessions.map((record) => toUri('event', record.id)),
		...data.logs.map((record) => toUri(FITNESS.log, record.id)),
		...data.supplements.map((record) => toUri(FITNESS.supplement, record.id)),
		...data.intakes.map((record) => toUri(FITNESS.intake, record.id)),
		...data.metrics.map((record) => toUri(FITNESS.metric, record.id)),
		...(data.goal ? [toUri(FITNESS.goal, data.goal.id)] : []),
	]
}

/** The rows a store reads, by type. */
export interface FitnessRowSet {
	exercises: Entity<ExercisePayload>[]
	templates: Entity<TemplatePayload>[]
	logs: Entity<LogPayload>[]
	sessions: EventRow[]
	gyms: Entity<GymPayload>[]
	supplements: Entity<SupplementPayload>[]
	intakes: Entity<IntakePayload>[]
	metrics: Entity<MetricPayload>[]
	goals: Entity<GoalPayload>[]
}

const withId = <T>(row: Entity<T>): T & { id: string } => ({ ...row.payload, id: row.id })
/** Newest first by a key, the later row first where two are equal. */
const newestFirst = <T>(records: T[], key: (record: T) => string) =>
	records.reverse().sort((a, b) => key(b).localeCompare(key(a)))

/** A session Event as the store holds it: its template is the one it is linked from. */
export function sessionFromRow(row: EventRow): PlannedSession {
	const templateId = row.links
		.filter((link) => link.relation === 'from' && !link.deletedAt)
		.map((link) => parseUri(link.uri))
		.find((target) => target?.type === FITNESS.template)?.id
	return { id: row.id, title: row.title, startAt: row.startAt, ...(templateId ? { templateId } : {}) }
}

/** The rows as the store holds them: logs, intakes and metrics newest first, sessions soonest first. */
export function fitnessFromRows(rows: FitnessRowSet): FitnessData {
	const goals = rows.goals.map(withId)
	const goal = goals.at(-1)
	return {
		exercises: rows.exercises.map(withId) as Exercise[],
		templates: rows.templates.map(withId) as WorkoutTemplate[],
		logs: newestFirst(rows.logs.map(withId) as WorkoutLog[], (log) => log.date),
		sessions: rows.sessions
			.filter((row) => row.kind === SESSION_KIND && !row.deletedAt)
			.map(sessionFromRow)
			.sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt)),
		gyms: rows.gyms.map(withId) as Gym[],
		supplements: rows.supplements.map(withId) as Supplement[],
		intakes: newestFirst(rows.intakes.map(withId) as IntakeLog[], (intake) => intake.at),
		metrics: newestFirst(rows.metrics.map(withId) as BodyMetric[], (metric) => metric.at),
		...(goal ? { goal: goal as FitnessData['goal'] & object } : {}),
	}
}
