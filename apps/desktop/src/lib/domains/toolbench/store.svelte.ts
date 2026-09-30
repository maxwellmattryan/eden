// Toolbench's store (product/domains/toolbench.md): the ideas with their status, log and brainstorm thread, and the
// projects. The rows live in the data layer (`@eden/shared/data`), one per idea and project; the store is what the
// page sees of them. A write changes the store at once and is sent after, in order (`WriteQueue`), and every write
// hands back an undo for the toast (D-12) and lands in the Garden feed. The brainstorm thread renders stored messages
// only; the Gardener's brainstorm appends to it through `appendBrainstorm`.
import { logError } from '@eden/shared/api'
import {
	applyBatch,
	createEntity,
	deleteRows,
	importLegacyDocument,
	newId,
	queryEntities,
	restoreRows,
	toUri,
	updateEntity,
	WriteQueue,
	type BatchOp,
	type Write,
} from '@eden/shared/data'
import { daysSince, nowIso } from '@eden/shared/dates'
import {
	IDEA_STATUSES,
	TOOLBENCH,
	toolbenchFromRows,
	toolbenchRows,
	toolbenchUris,
	type BrainstormMessage,
	type Idea,
	type IdeaPayload,
	type IdeaStatus,
	type Project,
	type ProjectPayload,
	type ToolbenchData,
} from '@eden/shared/domains/toolbench'
import { feed } from '../../shell/feed.svelte.js'
import { parseIdea } from './parse.js'
import { seedData } from './seed.js'

export { IDEA_STATUSES }
export type {
	BrainstormMessage,
	Idea,
	IdeaStatus,
	LogEntry,
	Project,
	ToolbenchData,
} from '@eden/shared/domains/toolbench'

export type Undo = () => void

/** One change: what the page sees of it and the way back, and the write that stores each. */
interface Change {
	apply: () => void
	revert: () => void
	write: Write
	unwrite: Write
}

const DOCUMENT = 'toolbench'
/** An idea untouched this long resurfaces on the Garden and carries its days in the list. */
export const RESURFACE_DAYS = 30

export class ToolbenchStore {
	ready = $state(false)
	/** A write failed, or the rows could not be read; the page shows it and offers a retry. */
	saveFailed = $state(false)
	ideas = $state<Idea[]>([])
	projects = $state<Project[]>([])
	/** An idea a tile asked the Ideas view to open; the view reads it once. */
	reveal = $state<string>()

	#loading: Promise<void> | undefined
	readonly #queue = new WriteQueue(
		(failed) => (this.saveFailed = failed),
		(error) => void logError('data', 'A Toolbench write failed', String(error)).catch(() => null)
	)

	readonly active = $derived(this.ideas.filter((idea) => idea.status !== 'archived'))
	/** The active idea left alone the longest, once it has rested a month. */
	readonly resurfaced = $derived.by(() => {
		const rested = this.active.filter((idea) => this.untouchedDays(idea) >= RESURFACE_DAYS)
		return rested.sort((a, b) => this.untouchedDays(b) - this.untouchedDays(a))[0]
	})

	countFor(status: IdeaStatus): number {
		return this.ideas.filter((idea) => idea.status === status).length
	}
	untouchedDays(idea: Idea): number {
		return daysSince(idea.touchedAt)
	}
	projectOf(idea: Idea): Project | undefined {
		return idea.projectId ? this.projects.find((project) => project.id === idea.projectId) : undefined
	}

	/** Reads the rows, once; the first time, what the old document held is brought over before. */
	load(): Promise<void> {
		return (this.#loading ??= this.#read())
	}

	async #read() {
		try {
			await importLegacyDocument<ToolbenchData>(DOCUMENT, (data) => toolbenchRows(data, newId).ops)
			const [ideas, projects] = await Promise.all([
				queryEntities<IdeaPayload>({ type: TOOLBENCH.idea }),
				queryEntities<ProjectPayload>({ type: TOOLBENCH.project }),
			])
			const data = toolbenchFromRows({ ideas, projects })
			this.ideas = data.ideas
			this.projects = data.projects
			this.saveFailed = this.#queue.failed
		} catch (error) {
			// nothing was read: say so, and let the retry read again
			this.#loading = undefined
			this.saveFailed = true
			await logError('data', 'Could not read the Toolbench rows', String(error)).catch(() => null)
		}
		this.ready = true
	}

	/** Reads the rows again, after an import changed them under the store. What is waiting to be sent is sent first. */
	async reload() {
		await this.#queue.settled()
		this.#loading = undefined
		await this.load()
	}

	/** What the store holds, as plain data. */
	data(): ToolbenchData {
		return $state.snapshot({ ideas: toolbench.ideas, projects: toolbench.projects })
	}

	/** The retry after a failure: reads again if the rows were never read, and sends what is waiting. */
	async flush() {
		if (!this.#loading) await this.load()
		await this.#queue.retry()
	}

	capture(text: string): { idea: Idea; undo: Undo } {
		const parsed = parseIdea(text)
		const idea: Idea = {
			id: newId(),
			title: parsed.title,
			status: 'idea',
			area: parsed.area,
			touchedAt: nowIso(),
			log: [{ id: newId(), at: nowIso(), key: 'domains.toolbench.ideas.log.captured' }],
			brainstorm: [],
		}
		const { id, ...payload } = idea
		const undo = this.#commit(
			{
				apply: () => this.ideas.unshift(idea),
				revert: () => (this.ideas = this.ideas.filter((entry) => entry.id !== id)),
				write: () => createEntity({ id, type: TOOLBENCH.idea, payload }),
				unwrite: () => deleteRows([toUri(TOOLBENCH.idea, id)]),
			},
			'garden.feed.ideaCaptured',
			{ title: idea.title }
		)
		return { idea, undo }
	}

	setStatus(id: string, status: IdeaStatus, statusLabel: string): { idea: Idea | undefined; undo: Undo } {
		const idea = this.ideas.find((entry) => entry.id === id)
		const feedKey = status === 'archived' ? 'garden.feed.ideaArchived' : 'garden.feed.ideaMoved'
		if (!idea) return { idea, undo: () => {} }

		const before = $state.snapshot(idea)
		const after: Idea = {
			...before,
			status,
			touchedAt: nowIso(),
			log: [
				...before.log,
				{ id: newId(), at: nowIso(), key: 'domains.toolbench.ideas.log.moved', values: { status: statusLabel } },
			],
		}
		const put = (next: Idea) => (this.ideas = this.ideas.map((entry) => (entry.id === id ? next : entry)))
		const payload = ({ id: _id, ...rest }: Idea): IdeaPayload => rest
		const undo = this.#commit(
			{
				apply: () => put(after),
				revert: () => put(before),
				write: () => updateEntity(id, payload(after)),
				unwrite: () => updateEntity(id, payload(before)),
			},
			feedKey,
			{ title: idea.title, status: statusLabel }
		)
		return { idea, undo }
	}

	ideaById(id: string): Idea | undefined {
		return this.ideas.find((idea) => idea.id === id)
	}

	projectById(id: string): Project | undefined {
		return this.projects.find((project) => project.id === id)
	}

	/**
	 * Appends what was said in a brainstorm to the idea's thread: the owner's ask and the Gardener's answer, its own
	 * words kept with the idea (D-76). The idea counts as touched. The undo takes the messages back out.
	 */
	appendBrainstorm(id: string, messages: BrainstormMessage[]): { idea: Idea | undefined; undo: Undo } {
		const idea = this.ideas.find((entry) => entry.id === id)
		if (!idea || !messages.length) return { idea, undo: () => {} }
		const before = $state.snapshot(idea)
		const after: Idea = { ...before, touchedAt: nowIso(), brainstorm: [...before.brainstorm, ...messages] }
		const put = (next: Idea) => (this.ideas = this.ideas.map((entry) => (entry.id === id ? next : entry)))
		const payload = ({ id: _id, ...rest }: Idea): IdeaPayload => rest
		const undo = this.#commit(
			{
				apply: () => put(after),
				revert: () => put(before),
				write: () => updateEntity(id, payload(after)),
				unwrite: () => updateEntity(id, payload(before)),
			},
			'garden.feed.ideaBrainstormed',
			{ title: idea.title }
		)
		return { idea, undo }
	}

	/** Adds next steps to a project: what an expanded plan commits. The tasks themselves are the shell's (Today). */
	addNextSteps(id: string, steps: string[]): { project: Project | undefined; undo: Undo } {
		const project = this.projects.find((entry) => entry.id === id)
		if (!project || !steps.length) return { project, undo: () => {} }
		const before = $state.snapshot(project)
		const after: Project = { ...before, next: [...before.next, ...steps] }
		const put = (next: Project) => (this.projects = this.projects.map((entry) => (entry.id === id ? next : entry)))
		const payload = ({ id: _id, ...rest }: Project): ProjectPayload => rest
		const undo = this.#commit(
			{
				apply: () => put(after),
				revert: () => put(before),
				write: () => updateEntity(id, payload(after)),
				unwrite: () => updateEntity(id, payload(before)),
			},
			'garden.feed.projectPlanned',
			{ name: project.name, count: steps.length }
		)
		return { project, undo }
	}

	remove(id: string): { idea: Idea | undefined; undo: Undo } {
		const idea = this.ideas.find((entry) => entry.id === id)
		const before = $state.snapshot(this.ideas)
		const uri = toUri(TOOLBENCH.idea, id)
		const undo = this.#commit(
			{
				apply: () => (this.ideas = this.ideas.filter((entry) => entry.id !== id)),
				// the list as it was, so the idea returns to its place
				revert: () => (this.ideas = before),
				write: () => deleteRows([uri]),
				unwrite: () => restoreRows([uri]),
			},
			'garden.feed.ideaDeleted',
			{ title: idea?.title ?? '' }
		)
		return { idea, undo }
	}

	/** Fills the store from the kit's sample dataset; the undo puts back whatever was there. */
	seed(domainName: string): Undo {
		const before = $state.snapshot({ ideas: this.ideas, projects: this.projects })
		const after = toolbenchRows(seedData(), newId)
		const remove = (uris: string[]): BatchOp[] => uris.map((uri) => ({ op: 'delete', uri }))
		const restore = (uris: string[]): BatchOp[] => uris.map((uri) => ({ op: 'restore', uri }))
		const old = toolbenchUris(before)
		const sample = toolbenchUris(after.data)
		const show = (data: ToolbenchData) => {
			this.ideas = data.ideas
			this.projects = data.projects
		}
		return this.#commit(
			{
				apply: () => show(after.data),
				revert: () => show(before),
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
		const entry = feedKey ? feed.record('toolbench', feedKey, values) : undefined
		return () => {
			change.revert()
			this.#queue.enqueue(change.unwrite)
			if (entry) feed.forget(entry.id)
		}
	}
}

export const toolbench = new ToolbenchStore()
