// Toolbench's shapes (product/domains/toolbench.md). The store holds them with their ids; a row's payload is the
// same shape without the id, which the row carries itself.
import type { EntityTypeId } from '../../registry/index.js'

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
	/** The id of the project it became. */
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
	/** The newest first. */
	ideas: Idea[]
	projects: Project[]
}

/** The registry ids of Toolbench's entity types (product/substrate/registry.md). */
export const TOOLBENCH = { idea: 'idea', project: 'project' } as const satisfies Record<string, EntityTypeId>

export type IdeaPayload = Omit<Idea, 'id'>
export type ProjectPayload = Omit<Project, 'id'>
