// Vigor's store (product/domains/fitness.md): the templates, the logs, the planned sessions, the gyms, the body metrics
// and the goal, and the supplements with their intakes. The rows live in the data layer, one per record, a planned
// session as a `workout-session` Event (D-177); the store is what the page sees of them. A write changes the store at
// once and is sent after, in order (`WriteQueue`); every write hands back an undo for the toast (D-12), lands in the
// Garden feed and, for a weight or a workout, emits its signal. The venue Places and Hearth's stock items are read,
// never written: a gym and a supplement hold the id or the URI of theirs.
import { get } from 'svelte/store'
import { logError } from '../../api/index.js'
import {
	applyBatch,
	createEntity,
	deleteRows,
	newId,
	parseUri,
	queryEntities,
	queryEvents,
	queryPlaces,
	restoreRows,
	toUri,
	updateEntity,
	WriteQueue,
	type BatchOp,
	type Write,
} from '../../data/index.js'
import { nowIso, todayIso } from '../../dates/index.js'
import { t } from '../../i18n/index.js'
import { settings } from '../../settings/index.js'
import { feed } from '../../shell/index.js'
import { emit } from '../../signals/runtime.js'
import {
	dailyWeights,
	nextSession,
	sessionFor,
	sevenDayAverage,
	startAtOf,
	streak,
	upcomingSessions,
	weekSessions,
} from './progress.js'
import { fitnessFromRows, fitnessRows, fitnessUris, sessionInput, sessionLink } from './rows.js'
import { seedData } from './seed.js'
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
	type MetricKind,
	type MetricPayload,
	type PlannedSession,
	type Supplement,
	type SupplementPayload,
	type TemplatePayload,
	type TrainingGoal,
	type WorkoutLog,
	type WorkoutTemplate,
} from './types.js'

export type Undo = () => void

/** One change: what the page sees of it and the way back, and the write that stores each. */
interface Change {
	apply: () => void
	revert: () => void
	write: Write
	unwrite: Write
}

/** A venue Place a gym may be linked to, as Vigor reads it. */
export interface Venue {
	id: string
	name: string
	address?: string
}
/** A Hearth stock item a supplement may be linked to, as Vigor reads it. */
export interface StockLink {
	uri: string
	name: string
	/** "9 packets". */
	quantity: string
}

/** A template as the form hands it over: an exercise with no id is a custom one, made a row on save. */
export interface TemplateDraft {
	id?: string
	title: string
	minutes: number
	exercises: { exerciseId?: string; name: string; sets: number; reps: number }[]
}

const payload = <T extends { id: string }>({ id: _id, ...rest }: T): Omit<T, 'id'> => rest

export class FitnessStore {
	ready = $state(false)
	/** A write failed, or the rows could not be read; the page shows it and offers a retry. */
	saveFailed = $state(false)
	exercises = $state<Exercise[]>([])
	templates = $state<WorkoutTemplate[]>([])
	/** Newest first. */
	logs = $state<WorkoutLog[]>([])
	sessions = $state<PlannedSession[]>([])
	gyms = $state<Gym[]>([])
	supplements = $state<Supplement[]>([])
	/** Newest first. */
	intakes = $state<IntakeLog[]>([])
	/** Newest first. */
	metrics = $state<BodyMetric[]>([])
	goal = $state<TrainingGoal>()
	venues = $state<Venue[]>([])
	stock = $state<StockLink[]>([])

	#loading: Promise<void> | undefined
	readonly #queue = new WriteQueue(
		(failed) => (this.saveFailed = failed),
		(error) => void logError('data', 'A Vigor write failed', String(error)).catch(() => null)
	)

	readonly weights = $derived(dailyWeights(this.metrics))
	readonly latestWeight = $derived(this.weights.at(-1))
	readonly average = $derived(sevenDayAverage(this.weights))
	readonly streak = $derived(streak(this.logs, settings.weekStart, todayIso()))
	readonly thisWeek = $derived(weekSessions(this.logs, this.sessions, settings.weekStart, todayIso()))
	readonly upcoming = $derived(upcomingSessions(this.sessions, Date.now(), this.logs))
	readonly next = $derived(nextSession(this.sessions, Date.now(), this.logs))
	readonly empty = $derived(
		!this.templates.length &&
			!this.logs.length &&
			!this.sessions.length &&
			!this.gyms.length &&
			!this.supplements.length &&
			!this.metrics.length
	)

	/** The latest metric of a kind. */
	latestOf(kind: MetricKind): BodyMetric | undefined {
		return this.metrics.find((metric) => metric.kind === kind)
	}
	templateById(id?: string): WorkoutTemplate | undefined {
		return id ? this.templates.find((template) => template.id === id) : undefined
	}
	gymById(id?: string): Gym | undefined {
		return id ? this.gyms.find((gym) => gym.id === id) : undefined
	}
	venueById(id?: string): Venue | undefined {
		return id ? this.venues.find((venue) => venue.id === id) : undefined
	}
	stockByUri(uri?: string): StockLink | undefined {
		return uri ? this.stock.find((item) => item.uri === uri) : undefined
	}
	intakesOf(id: string): IntakeLog[] {
		return this.intakes.filter((intake) => intake.supplementId === id)
	}

	/** Reads the rows, once. */
	load(): Promise<void> {
		return (this.#loading ??= this.#read())
	}

	async #read() {
		try {
			const [exercises, templates, logs, sessions, gyms, supplements, intakes, metrics, goals, venues, stock] =
				await Promise.all([
					queryEntities<ExercisePayload>({ type: FITNESS.exercise }),
					queryEntities<TemplatePayload>({ type: FITNESS.template }),
					queryEntities<LogPayload>({ type: FITNESS.log }),
					queryEvents({ kinds: [SESSION_KIND] }),
					queryEntities<GymPayload>({ type: FITNESS.gym }),
					queryEntities<SupplementPayload>({ type: FITNESS.supplement }),
					queryEntities<IntakePayload>({ type: FITNESS.intake }),
					queryEntities<MetricPayload>({ type: FITNESS.metric }),
					queryEntities<GoalPayload>({ type: FITNESS.goal }),
					queryPlaces({ kinds: ['venue'] }),
					queryEntities<Record<string, unknown>>({ type: 'stock-item' }),
				])
			this.#show(fitnessFromRows({ exercises, templates, logs, sessions, gyms, supplements, intakes, metrics, goals }))
			this.venues = venues.map((row) => ({ id: row.id, name: row.name, address: row.address ?? undefined }))
			this.stock = stock.map((row) => ({
				uri: row.uri,
				name: String(row.payload.name ?? ''),
				quantity: [row.payload.qty, row.payload.unit].filter((part) => part != null && part !== '').join(' '),
			}))
			this.saveFailed = this.#queue.failed
		} catch (error) {
			// nothing was read: say so, and let the retry read again
			this.#loading = undefined
			this.saveFailed = true
			await logError('data', 'Could not read the Vigor rows', String(error)).catch(() => null)
		}
		this.ready = true
	}

	/** Reads the rows again, after an import changed them under the store. What is waiting to be sent is sent first. */
	async reload() {
		await this.#queue.settled()
		this.#loading = undefined
		await this.load()
	}

	/** The retry after a failure: reads again if the rows were never read, and sends what is waiting. */
	async flush() {
		if (!this.#loading) await this.load()
		await this.#queue.retry()
	}

	/** What the store holds, as plain data. */
	data(): FitnessData {
		return $state.snapshot({
			exercises: this.exercises,
			templates: this.templates,
			logs: this.logs,
			sessions: this.sessions,
			gyms: this.gyms,
			supplements: this.supplements,
			intakes: this.intakes,
			metrics: this.metrics,
			...(this.goal ? { goal: this.goal } : {}),
		}) as FitnessData
	}

	#show(data: FitnessData) {
		this.exercises = data.exercises
		this.templates = data.templates
		this.logs = data.logs
		this.sessions = data.sessions
		this.gyms = data.gyms
		this.supplements = data.supplements
		this.intakes = data.intakes
		this.metrics = data.metrics
		this.goal = data.goal
	}

	// ---- Body ----------------------------------------------------------------------------------------------------

	/** Logs a metric, its value metric (kg, %, cm), now unless a time is given. */
	logMetric(
		kind: MetricKind,
		value: number,
		options: { at?: string; source?: BodyMetric['source'] } = {}
	): { metric: BodyMetric; undo: Undo } {
		const metric: BodyMetric = {
			id: newId(),
			kind,
			value,
			at: options.at ?? nowIso(),
			source: options.source ?? 'manual',
		}
		const before = this.metrics
		const tr = get(t)
		const undo = this.#commit(
			{
				apply: () => (this.metrics = [metric, ...this.metrics].sort((a, b) => b.at.localeCompare(a.at))),
				revert: () => (this.metrics = before),
				write: async () => {
					await createEntity({ id: metric.id, type: FITNESS.metric, payload: payload(metric) })
					// said once the metric is kept; a signal that cannot be emitted fails nothing
					await emit('body-metric.logged', { kind }, { dedupeKey: metric.id }).catch(() => null)
				},
				unwrite: () => deleteRows([toUri(FITNESS.metric, metric.id)]),
			},
			// T2: the feed is stored outside the workspace, so it names the kind and never the value
			kind === 'weight' ? 'garden.feed.weightLogged' : 'garden.feed.metricLogged',
			kind === 'weight' ? undefined : { kind: tr(`domains.fitness.body.kinds.${kind}`) }
		)
		return { metric, undo }
	}

	/** Sets the weight goal: a target in kg and the day to reach it by. */
	setGoal(target: number, by: string): Undo {
		const before = this.goal
		const goal: TrainingGoal = { id: before?.id ?? newId(), kind: 'weight', target, by }
		return this.#commit(
			{
				apply: () => (this.goal = goal),
				revert: () => (this.goal = before),
				write: () =>
					before
						? updateEntity(goal.id, payload(goal))
						: createEntity({ id: goal.id, type: FITNESS.goal, payload: payload(goal) }),
				unwrite: () => (before ? updateEntity(before.id, payload(before)) : deleteRows([toUri(FITNESS.goal, goal.id)])),
			},
			// T2: the target weight stays out of the feed, which is stored outside the workspace
			'garden.feed.goalSet',
			{ date: by }
		)
	}

	// ---- Workouts ------------------------------------------------------------------------------------------------

	/** Saves a template, new or changed; an exercise named but not in the library becomes a custom row. */
	saveTemplate(draft: TemplateDraft): { template: WorkoutTemplate; undo: Undo } {
		const made: Exercise[] = []
		const exercises = draft.exercises.map((exercise) => {
			const known = exercise.exerciseId
				? exercise.exerciseId
				: this.exercises.find((entry) => entry.name.toLowerCase() === exercise.name.trim().toLowerCase())?.id
			if (known) return { exerciseId: known, name: exercise.name, sets: exercise.sets, reps: exercise.reps }
			const custom: Exercise = { id: newId(), name: exercise.name.trim(), muscles: [], equipment: [] }
			made.push(custom)
			return { exerciseId: custom.id, name: custom.name, sets: exercise.sets, reps: exercise.reps }
		})
		const was = draft.id ? this.templateById(draft.id) : undefined
		const before = $state.snapshot({ templates: this.templates, exercises: this.exercises })
		const template: WorkoutTemplate = {
			id: was?.id ?? newId(),
			title: draft.title.trim(),
			minutes: draft.minutes,
			exercises,
		}
		const customOps: BatchOp[] = made.map((exercise) => ({
			op: 'createEntity',
			input: { id: exercise.id, type: FITNESS.exercise, payload: payload(exercise) },
		}))
		const undo = this.#commit(
			{
				apply: () => {
					this.exercises = [...this.exercises, ...made]
					this.templates = was
						? this.templates.map((entry) => (entry.id === template.id ? template : entry))
						: [...this.templates, template]
				},
				revert: () => {
					this.templates = before.templates
					this.exercises = before.exercises
				},
				write: () =>
					applyBatch([
						...customOps,
						was
							? { op: 'updateEntity', id: template.id, payload: payload(template) }
							: { op: 'createEntity', input: { id: template.id, type: FITNESS.template, payload: payload(template) } },
					]),
				unwrite: () =>
					applyBatch([
						...made.map((exercise): BatchOp => ({ op: 'delete', uri: toUri(FITNESS.exercise, exercise.id) })),
						was
							? { op: 'updateEntity', id: was.id, payload: payload($state.snapshot(was) as WorkoutTemplate) }
							: { op: 'delete', uri: toUri(FITNESS.template, template.id) },
					]),
			},
			'garden.feed.templateSaved',
			{ title: template.title }
		)
		return { template, undo }
	}

	removeTemplate(id: string): Undo {
		const template = this.templateById(id)
		const before = this.templates
		const uri = toUri(FITNESS.template, id)
		return this.#commit(
			{
				apply: () => (this.templates = this.templates.filter((entry) => entry.id !== id)),
				revert: () => (this.templates = before),
				write: () => deleteRows([uri]),
				unwrite: () => restoreRows([uri]),
			},
			'garden.feed.templateRemoved',
			{ title: template?.title ?? '' }
		)
	}

	/** Logs a workout; one of a template on a day it was planned for is done for that session. */
	logWorkout(input: Omit<WorkoutLog, 'id' | 'sessionId'>): { log: WorkoutLog; undo: Undo } {
		const session = sessionFor(this.sessions, input.templateId, input.date, this.logs)
		const log: WorkoutLog = { ...input, id: newId(), ...(session ? { sessionId: session.id } : {}) }
		const before = this.logs
		const undo = this.#commit(
			{
				apply: () => (this.logs = [log, ...this.logs].sort((a, b) => b.date.localeCompare(a.date))),
				revert: () => (this.logs = before),
				write: async () => {
					await applyBatch([
						{ op: 'createEntity', input: { id: log.id, type: FITNESS.log, payload: payload(log) } },
						...sessionLink(log),
					])
					await emit('workout.logged', { title: log.title }, { dedupeKey: log.id }).catch(() => null)
				},
				unwrite: () => deleteRows([toUri(FITNESS.log, log.id)]),
			},
			'garden.feed.workoutLogged',
			{ title: log.title }
		)
		return { log, undo }
	}

	removeLog(id: string): Undo {
		const log = this.logs.find((entry) => entry.id === id)
		const before = this.logs
		const uri = toUri(FITNESS.log, id)
		return this.#commit(
			{
				apply: () => (this.logs = this.logs.filter((entry) => entry.id !== id)),
				revert: () => (this.logs = before),
				write: () => deleteRows([uri]),
				unwrite: () => restoreRows([uri]),
			},
			'garden.feed.workoutRemoved',
			{ title: log?.title ?? '' }
		)
	}

	/** Plans a template for a day and a time on the device's clock: a `workout-session` Event titled after it. */
	planSession(templateId: string, date: string, time: string): { session: PlannedSession; undo: Undo } {
		const template = this.templateById(templateId)
		const session: PlannedSession = {
			id: newId(),
			templateId,
			title: template?.title ?? '',
			startAt: startAtOf(date, time),
		}
		const before = this.sessions
		const undo = this.#commit(
			{
				apply: () =>
					(this.sessions = [...this.sessions, session].sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))),
				revert: () => (this.sessions = before),
				write: () => applyBatch([{ op: 'createPrimitive', type: 'event', input: sessionInput(session) }]),
				unwrite: () => deleteRows([toUri('event', session.id)]),
			},
			'garden.feed.sessionPlanned',
			{ title: session.title }
		)
		return { session, undo }
	}

	removeSession(id: string): Undo {
		const session = this.sessions.find((entry) => entry.id === id)
		const before = this.sessions
		const uri = toUri('event', id)
		return this.#commit(
			{
				apply: () => (this.sessions = this.sessions.filter((entry) => entry.id !== id)),
				revert: () => (this.sessions = before),
				write: () => deleteRows([uri]),
				unwrite: () => restoreRows([uri]),
			},
			'garden.feed.sessionRemoved',
			{ title: session?.title ?? '' }
		)
	}

	/** The quick action: a template done today, at its estimated minutes and with no sets, for today's session. */
	workoutDone(title: string): { log: WorkoutLog; undo: Undo } | undefined {
		const template = this.templates.find((entry) => entry.title.toLowerCase() === title.trim().toLowerCase())
		if (!template) return undefined
		return this.logWorkout({
			templateId: template.id,
			title: template.title,
			date: todayIso(),
			minutes: template.minutes,
			exercises: [],
		})
	}

	// ---- Gyms ----------------------------------------------------------------------------------------------------

	saveGym(draft: Omit<Gym, 'id'> & { id?: string }): { gym: Gym; undo: Undo } {
		const was = this.gymById(draft.id)
		const gym: Gym = { ...draft, id: was?.id ?? newId(), name: draft.name.trim() }
		const before = this.gyms
		const undo = this.#commit(
			{
				apply: () =>
					(this.gyms = was ? this.gyms.map((entry) => (entry.id === gym.id ? gym : entry)) : [...this.gyms, gym]),
				revert: () => (this.gyms = before),
				write: () =>
					was
						? updateEntity(gym.id, payload(gym))
						: createEntity({ id: gym.id, type: FITNESS.gym, payload: payload(gym) }),
				unwrite: () =>
					was ? updateEntity(was.id, payload($state.snapshot(was) as Gym)) : deleteRows([toUri(FITNESS.gym, gym.id)]),
			},
			'garden.feed.gymSaved',
			{ name: gym.name }
		)
		return { gym, undo }
	}

	removeGym(id: string): Undo {
		const gym = this.gymById(id)
		const before = this.gyms
		const uri = toUri(FITNESS.gym, id)
		return this.#commit(
			{
				apply: () => (this.gyms = this.gyms.filter((entry) => entry.id !== id)),
				revert: () => (this.gyms = before),
				write: () => deleteRows([uri]),
				unwrite: () => restoreRows([uri]),
			},
			'garden.feed.gymRemoved',
			{ name: gym?.name ?? '' }
		)
	}

	// ---- Supplements ---------------------------------------------------------------------------------------------

	saveSupplement(draft: Omit<Supplement, 'id'> & { id?: string }): { supplement: Supplement; undo: Undo } {
		const was = draft.id ? this.supplements.find((entry) => entry.id === draft.id) : undefined
		const supplement: Supplement = { ...draft, id: was?.id ?? newId(), name: draft.name.trim() }
		const before = this.supplements
		const undo = this.#commit(
			{
				apply: () =>
					(this.supplements = was
						? this.supplements.map((entry) => (entry.id === supplement.id ? supplement : entry))
						: [...this.supplements, supplement]),
				revert: () => (this.supplements = before),
				write: () =>
					was
						? updateEntity(supplement.id, payload(supplement))
						: createEntity({ id: supplement.id, type: FITNESS.supplement, payload: payload(supplement) }),
				unwrite: () =>
					was
						? updateEntity(was.id, payload($state.snapshot(was) as Supplement))
						: deleteRows([toUri(FITNESS.supplement, supplement.id)]),
			},
			'garden.feed.supplementSaved',
			{ name: supplement.name }
		)
		return { supplement, undo }
	}

	removeSupplement(id: string): Undo {
		const supplement = this.supplements.find((entry) => entry.id === id)
		const before = this.supplements
		const uri = toUri(FITNESS.supplement, id)
		return this.#commit(
			{
				apply: () => (this.supplements = this.supplements.filter((entry) => entry.id !== id)),
				revert: () => (this.supplements = before),
				write: () => deleteRows([uri]),
				unwrite: () => restoreRows([uri]),
			},
			'garden.feed.supplementRemoved',
			{ name: supplement?.name ?? '' }
		)
	}

	/** One intake of a supplement, now. */
	took(supplementId: string): { intake: IntakeLog; undo: Undo } | undefined {
		const supplement = this.supplements.find((entry) => entry.id === supplementId)
		if (!supplement) return undefined
		const intake: IntakeLog = { id: newId(), supplementId, at: nowIso() }
		const before = this.intakes
		const undo = this.#commit(
			{
				apply: () => (this.intakes = [intake, ...this.intakes]),
				revert: () => (this.intakes = before),
				write: () => createEntity({ id: intake.id, type: FITNESS.intake, payload: payload(intake) }),
				unwrite: () => deleteRows([toUri(FITNESS.intake, intake.id)]),
			},
			'garden.feed.supplementTaken',
			{ name: supplement.name }
		)
		return { intake, undo }
	}

	/** The quick action: a supplement by its name. */
	tookNamed(name: string): { intake: IntakeLog; undo: Undo } | undefined {
		const supplement = this.supplements.find((entry) => entry.name.toLowerCase() === name.trim().toLowerCase())
		return supplement ? this.took(supplement.id) : undefined
	}

	// ---- Sample data ---------------------------------------------------------------------------------------------

	/** Fills the store from the kit's sample dataset; the undo puts back whatever was there. */
	seed(domainName: string): Undo {
		const before = this.data()
		const stock = this.stock.flatMap((item) => {
			const id = parseUri(item.uri)?.id
			return id ? [{ id, name: item.name }] : []
		})
		const after = fitnessRows(seedData({ venues: this.venues, stock }), newId)
		const remove = (uris: string[]): BatchOp[] => uris.map((uri) => ({ op: 'delete', uri }))
		const restore = (uris: string[]): BatchOp[] => uris.map((uri) => ({ op: 'restore', uri }))
		const old = fitnessUris(before)
		const sample = fitnessUris(after.data)
		return this.#commit(
			{
				apply: () => this.#show(after.data),
				revert: () => this.#show(before),
				write: () => applyBatch([...remove(old), ...after.ops]),
				unwrite: () => applyBatch([...remove(sample), ...restore(old)]),
			},
			'garden.feed.sampleAdded',
			{ domain: domainName }
		)
	}

	/** Shows the change, queues its write and records it; the undo shows the way back and queues that. */
	#commit(change: Change, feedKey?: string, values?: Record<string, string | number>): Undo {
		change.apply()
		this.#queue.enqueue(change.write)
		const entry = feedKey ? feed.record('fitness', feedKey, values) : undefined
		return () => {
			change.revert()
			this.#queue.enqueue(change.unwrite)
			if (entry) feed.forget(entry.id)
		}
	}
}

export const fitness = new FitnessStore()
