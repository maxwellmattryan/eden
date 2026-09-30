// The tasks as the shell holds them (product/substrate/tasks.md; docs/engineering/data-layer.md, "Tasks"; D-75):
// every live task read once, and the Today view worked out from them by `@eden/shared/tasks`, in the owner's zone
// and from the owner's week start, as the minute moves. The store holds no Date: the clock is a number and the pure
// modules do the date work. A write changes the store at once and is sent after, in order (`WriteQueue`); every
// write hands back an undo (D-12) and lands in the Garden feed. It is the shell's, so a domain may import it: a
// domain that makes a task asks it to reload. The task signals are emitted here, once the write has landed: one per
// owner action, none for a batch (D-75). Mobile lifts it into `@eden/shared` when it needs it (issue 19).
import { logError } from '@eden/shared/api'
import {
	applyBatch,
	createTask,
	deleteRows,
	newId,
	queryTasks,
	restoreRows,
	toUri,
	updateTask,
	WriteQueue,
	type BatchOp,
	type TaskInput,
	type TaskRow,
	type Write,
} from '@eden/shared/data'
import { dateIn, nowIso } from '@eden/shared/dates'
import { settings } from '@eden/shared/settings'
import {
	addedToday,
	completion,
	emitTaskCompleted,
	emitTaskCreated,
	inverseOf,
	parseTask,
	reopened,
	skip,
	snoozeTargets,
	tallied,
	targetMet,
	todayView,
	toTask,
	type Language,
	type ParsedTask,
	type SnoozeTargets,
	type Task,
	type TaskChange,
	type TodayView,
} from '@eden/shared/tasks'
import { feed } from '../feed.svelte.js'

export type Undo = () => void
export type SnoozeTarget = keyof SnoozeTargets

/** One change: what the page sees of it and the way back, and the write that stores each. */
interface Change {
	apply: () => void
	revert: () => void
	write: Write
	unwrite: Write
}

const MINUTE_MS = 60 * 1000
/** The feed names the shell's own surface by its plain id, as it names a domain. */
const FEED_DOMAIN = 'today'

export class TasksStore {
	ready = $state(false)
	/** A write failed, or the rows could not be read; the page shows it and offers a retry. */
	saveFailed = $state(false)
	/** Every live task, whatever its kind and day. */
	tasks = $state<Task[]>([])
	/** The minute, as an instant; the view moves with it while a page watches. */
	clock = $state(Date.now())
	/** The owner's timezone; the device's until the setting exists (D-27, issue 25). */
	zone: string | undefined = undefined

	readonly view = $derived<TodayView>(todayView(this.tasks, this.clock, this.zone, settings.weekStart))

	#loading: Promise<void> | undefined
	#ticker: ReturnType<typeof setInterval> | undefined
	#watchers = 0
	readonly #queue = new WriteQueue(
		(failed) => (this.saveFailed = failed),
		(error) => void logError('data', 'A task write failed', String(error)).catch(() => null)
	)

	/** Reads the rows, once. */
	load(): Promise<void> {
		return (this.#loading ??= this.#read())
	}

	async #read() {
		try {
			// every live task: a routine's due is null, so a range query would never find it (data-layer.md, "Tasks")
			this.tasks = (await queryTasks()).map(toTask)
			this.saveFailed = this.#queue.failed
		} catch (error) {
			// nothing was read: say so, and let the retry read again
			this.#loading = undefined
			this.saveFailed = true
			await logError('data', 'Could not read the task rows', String(error)).catch(() => null)
		}
		this.ready = true
	}

	/** Reads the rows again, after an import or another domain changed them under the store. What is waiting is sent first. */
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

	/** Keeps the minute moving while a view is mounted; the answer stops it when the last view goes. */
	watch(): () => void {
		this.clock = Date.now()
		this.#watchers += 1
		this.#ticker ??= setInterval(() => (this.clock = Date.now()), MINUTE_MS)
		return () => {
			this.#watchers -= 1
			if (this.#watchers > 0 || !this.#ticker) return
			clearInterval(this.#ticker)
			this.#ticker = undefined
		}
	}

	/** Today in the owner's zone, from the clock itself: an action at midnight lands on the right day. */
	#today(): string {
		return dateIn(this.zone, Date.now())
	}

	/** What the snooze menu offers now, for a task. */
	snoozeTargetsFor(task: Task): SnoozeTargets {
		return snoozeTargets(task.due, this.clock, this.zone, settings.weekStart)
	}

	/** Adds the line as it parses: a todo (due today when it names no day), a routine or a habit. */
	add(text: string, lang: Language): { task: Task; parsed: ParsedTask; undo: Undo } {
		const parsed = parseTask(text, { now: Date.now(), zone: this.zone, weekStart: settings.weekStart, lang })
		const day = this.#today()
		const input: TaskInput = addedToday(parsed, day)
		const id = newId()
		const task = this.#fromInput(id, input)
		const undo = this.#commit(
			{
				apply: () => this.tasks.push(task),
				revert: () => (this.tasks = this.tasks.filter((entry) => entry.id !== id)),
				// the signal follows the write: a write that fails emits nothing, and a failed emit fails nothing
				write: () =>
					createTask({ ...input, id }).then((row) => {
						const stored = toTask(row)
						this.#replace(stored)
						return emitTaskCreated(stored, day, settings.weekStart)
					}),
				unwrite: () => deleteRows([toUri('task', id)]),
			},
			'garden.feed.taskAdded',
			{ title: task.title }
		)
		return { task, parsed, undo }
	}

	/** Done: a todo or a checklist whole, a routine's occurrence today. `task.completed` follows the write. */
	complete(id: string): { task: Task | undefined; undo: Undo } {
		const day = this.#today()
		return this.#change(
			id,
			(task) => completion(task, day, nowIso()),
			'garden.feed.taskDone',
			(after) => emitTaskCompleted(after, day, settings.weekStart)
		)
	}

	/** A routine done today, open again. */
	reopen(id: string): { task: Task | undefined; undo: Undo } {
		return this.#change(id, (task) => reopened(task, this.#today()), 'garden.feed.taskReopened')
	}

	/** Moves the due (D-75): later today, tomorrow or next week; the undo writes the old due back. */
	snooze(id: string, target: SnoozeTarget): { task: Task | undefined; due: string | undefined; undo: Undo } {
		const task = this.tasks.find((entry) => entry.id === id)
		const due = task ? this.snoozeTargetsFor(task)[target] : undefined
		if (!task || !due) return { task, due, undo: () => {} }
		return { ...this.#change(id, () => ({ due }), 'garden.feed.taskSnoozed'), due }
	}

	/** The routine's occurrence today skipped: it leaves the list without counting against it. */
	skip(id: string): { task: Task | undefined; undo: Undo } {
		return this.#change(id, (task) => skip(task, this.#today()), 'garden.feed.taskSkipped')
	}

	/** One more on the habit's tally today; its streak is written with it. Meeting the target is `task.completed`. */
	tally(id: string): { task: Task | undefined; undo: Undo } {
		const day = this.#today()
		return this.#change(
			id,
			(task) => tallied(task, day, settings.weekStart),
			'garden.feed.taskTallied',
			(after) =>
				targetMet(after, day, settings.weekStart)
					? emitTaskCompleted(after, day, settings.weekStart)
					: Promise.resolve()
		)
	}

	remove(id: string): { task: Task | undefined; undo: Undo } {
		const task = this.tasks.find((entry) => entry.id === id)
		const before = $state.snapshot(this.tasks)
		const uri = toUri('task', id)
		const undo = this.#commit(
			{
				apply: () => (this.tasks = this.tasks.filter((entry) => entry.id !== id)),
				// the list as it was, so the task returns to its place
				revert: () => (this.tasks = before),
				write: () => deleteRows([uri]),
				unwrite: () => restoreRows([uri]),
			},
			'garden.feed.taskDeleted',
			{ title: task?.title ?? '' }
		)
		return { task, undo }
	}

	/** Adds the sample tasks in one batch, beside whatever is there; the undo deletes them. A batch emits no signal. */
	seed(inputs: TaskInput[], domainName: string): Undo {
		const added = inputs.map((input) => ({ id: newId(), input }))
		const shown = added.map(({ id, input }) => this.#fromInput(id, input))
		const ids = added.map(({ id }) => id)
		return this.#commit(
			{
				apply: () => (this.tasks = [...this.tasks, ...shown]),
				revert: () => (this.tasks = this.tasks.filter((entry) => !ids.includes(entry.id))),
				write: () =>
					applyBatch(
						added.map(({ id, input }): BatchOp => ({ op: 'createPrimitive', type: 'task', input: { ...input, id } }))
					).then(({ rows }) => {
						// the batch made tasks and nothing else
						for (const row of rows) this.#replace(toTask(row as TaskRow))
					}),
				unwrite: () => deleteRows(added.map(({ id }) => toUri('task', id))),
			},
			'garden.feed.sampleAdded',
			{ domain: domainName }
		)
	}

	/**
	 * A change of a task's fields: shown at once, patched after, and the same fields written back on undo. What
	 * `after` emits follows the write of the change, never its undo: an undo retracts no signal (D-75).
	 */
	#change(
		id: string,
		change: (task: Task) => TaskChange,
		feedKey: string,
		after?: (task: Task) => Promise<void>
	): { task: Task | undefined; undo: Undo } {
		const task = this.tasks.find((entry) => entry.id === id)
		if (!task) return { task, undo: () => {} }
		const before = $state.snapshot(task)
		const forward = change(before)
		const back = inverseOf(before, forward)
		const put = (fields: TaskChange) =>
			(this.tasks = this.tasks.map((entry) => (entry.id === id ? { ...entry, ...fields } : entry)))
		const undo = this.#commit(
			{
				apply: () => put(forward),
				revert: () => put(back),
				write: () => updateTask(id, forward).then((row) => after?.(toTask(row))),
				unwrite: () => updateTask(id, back),
			},
			feedKey,
			{ title: before.title }
		)
		return { task, undo }
	}

	/** The task as the page shows it before the row is written; the row's own reading replaces it when it returns. */
	#fromInput(id: string, input: TaskInput): Task {
		return toTask({
			uri: toUri('task', id),
			id,
			type: 'task',
			createdAt: '',
			updatedAt: '',
			deletedAt: null,
			mirror: false,
			source: null,
			externalId: null,
			snapshot: null,
			links: [],
			kind: input.kind,
			title: input.title,
			notes: input.notes ?? null,
			due: input.due ?? null,
			priority: input.priority ?? 'none',
			at: input.at ?? null,
			timeOfDay: input.timeOfDay ?? null,
			recurrence: input.recurrence ?? null,
			items: input.items ?? null,
			target: input.target ?? null,
			grace: input.grace ?? null,
			streak: input.streak ?? 0,
			progress: input.progress ?? null,
			done: input.done ?? false,
			completedAt: input.completedAt ?? null,
		})
	}

	/** Puts the stored row in the place of what the page showed, unless the task has gone since. */
	#replace(task: Task) {
		this.tasks = this.tasks.map((entry) => (entry.id === task.id ? task : entry))
	}

	/** Shows the change, queues its write and records it; the undo shows the way back and queues that. */
	#commit(change: Change, feedKey: string, values: Record<string, string | number>): Undo {
		change.apply()
		this.#queue.enqueue(change.write)
		const entry = feed.record(FEED_DOMAIN, feedKey, values)
		return () => {
			change.revert()
			this.#queue.enqueue(change.unwrite)
			feed.forget(entry.id)
		}
	}
}

export const tasks = new TasksStore()
