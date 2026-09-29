// Toolbench's store (product/domains/toolbench.md): the ideas with their status, log and brainstorm thread, and the
// projects, one `toolbench` document. Every write snapshots first and hands back an undo for the toast (D-12) and
// lands in the Garden feed. The brainstorm thread renders stored messages only; the Gardener arrives with its substrate.
import { load, save } from '@eden/shared/persistence'
import { daysSince, nowIso } from '../dates.js'
import { garden } from '../garden/store.svelte.js'
import { parseIdea } from './parse.js'
import { seedData } from './seed.js'

export type IdeaStatus = 'idea' | 'exploring' | 'building' | 'archived'
export const IDEA_STATUSES: readonly IdeaStatus[] = ['idea', 'exploring', 'building', 'archived']

export interface LogEntry {
	id: string
	/** When, as an ISO timestamp. */
	at: string
	/** A written line (the sample's), or a locale key with its values for what the app wrote. */
	line?: string
	key?: string
	values?: Record<string, string | number>
}
export interface BrainstormMessage {
	id: string
	owner: boolean
	text: string
}
export interface Idea {
	id: string
	title: string
	status: IdeaStatus
	area: string
	/** The last time it changed, as an ISO timestamp; the resurfaced tile picks the one left longest. */
	touchedAt: string
	log: LogEntry[]
	brainstorm: BrainstormMessage[]
	projectId?: string
}
export interface Project {
	id: string
	name: string
	kind: string
	repo?: string
	next: string[]
	parts?: { name: string; price: number }[]
	estimate?: number
}
export interface ToolbenchData {
	ideas: Idea[]
	projects: Project[]
}
export type Undo = () => void

const DOCUMENT = 'toolbench'
const VERSION = 1
/** An idea untouched this long resurfaces on the Garden and carries its days in the list. */
export const RESURFACE_DAYS = 30

export class ToolbenchStore {
	ready = $state(false)
	saveFailed = $state(false)
	ideas = $state<Idea[]>([])
	projects = $state<Project[]>([])
	/** An idea a tile asked the Ideas view to open; the view reads it once. */
	reveal = $state<string>()

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

	async load() {
		const document = await load<ToolbenchData>(DOCUMENT)
		if (document) {
			this.ideas = document.data.ideas ?? []
			this.projects = document.data.projects ?? []
		}
		this.ready = true
	}

	async flush() {
		await this.persist()
	}

	capture(text: string): { idea: Idea; undo: Undo } {
		const parsed = parseIdea(text)
		const idea: Idea = {
			id: crypto.randomUUID(),
			title: parsed.title,
			status: 'idea',
			area: parsed.area,
			touchedAt: nowIso(),
			log: [{ id: crypto.randomUUID(), at: nowIso(), key: 'domains.toolbench.ideas.log.captured' }],
			brainstorm: [],
		}
		const undo = this.commit(() => this.ideas.unshift(idea), 'garden.feed.ideaCaptured', { title: idea.title })
		return { idea, undo }
	}

	setStatus(id: string, status: IdeaStatus, statusLabel: string): { idea: Idea | undefined; undo: Undo } {
		const idea = this.ideas.find((entry) => entry.id === id)
		const feedKey = status === 'archived' ? 'garden.feed.ideaArchived' : 'garden.feed.ideaMoved'
		const undo = this.commit(
			() => {
				const target = this.ideas.find((entry) => entry.id === id)
				if (!target) return
				target.status = status
				target.touchedAt = nowIso()
				target.log.push({
					id: crypto.randomUUID(),
					at: nowIso(),
					key: 'domains.toolbench.ideas.log.moved',
					values: { status: statusLabel },
				})
			},
			feedKey,
			{ title: idea?.title ?? '', status: statusLabel }
		)
		return { idea, undo }
	}

	remove(id: string): { idea: Idea | undefined; undo: Undo } {
		const idea = this.ideas.find((entry) => entry.id === id)
		const undo = this.commit(
			() => (this.ideas = this.ideas.filter((entry) => entry.id !== id)),
			'garden.feed.ideaDeleted',
			{ title: idea?.title ?? '' }
		)
		return { idea, undo }
	}

	seed(domainName: string): Undo {
		const data = seedData()
		return this.commit(
			() => {
				this.ideas = data.ideas
				this.projects = data.projects
			},
			'garden.feed.sampleAdded',
			{ domain: domainName }
		)
	}

	private commit(mutate: () => void, feedKey?: string, values?: Record<string, string | number>): Undo {
		const before = $state.snapshot({ ideas: this.ideas, projects: this.projects })
		mutate()
		void this.persist()
		const entry = feedKey ? garden.record('toolbench', feedKey, values) : undefined
		return () => {
			this.ideas = before.ideas
			this.projects = before.projects
			void this.persist()
			if (entry) garden.forget(entry.id)
		}
	}

	private async persist() {
		try {
			await save<ToolbenchData>(DOCUMENT, {
				version: VERSION,
				data: $state.snapshot({ ideas: this.ideas, projects: this.projects }),
			})
			this.saveFailed = false
		} catch {
			this.saveFailed = true
		}
	}
}

export const toolbench = new ToolbenchStore()
