// Between Toolbench's shapes and its rows: a whole `ToolbenchData` as the writes that store it (the sample data, and
// the document the store kept before the data layer), and the rows read back as a `ToolbenchData`.
import { toUri, type BatchOp, type Entity } from '../../data/index.js'
import { TOOLBENCH, type IdeaPayload, type ProjectPayload, type ToolbenchData } from './types.js'

export interface ToolbenchRows {
	/** The data with the ids its rows have. */
	data: ToolbenchData
	ops: BatchOp[]
}

const create = (type: string, id: string, payload: object): BatchOp => ({
	op: 'createEntity',
	input: { id, type, payload },
})

/**
 * The writes that store the data. Every idea and project takes a new id, whatever id it had, and an idea's
 * `projectId` follows its project; one that names no project in the data is dropped. The ideas are listed newest
 * first, so their ids are made from the last to the first: the newest has the greatest id, as a captured one will.
 */
export function toolbenchRows(source: Partial<ToolbenchData>, newId: () => string): ToolbenchRows {
	const ops: BatchOp[] = []
	const projectIds = new Map<string, string>()
	const projects = (source.projects ?? []).map((project) => {
		const id = newId()
		projectIds.set(project.id, id)
		return { ...project, id }
	})
	for (const { id, ...payload } of projects) ops.push(create(TOOLBENCH.project, id, payload satisfies ProjectPayload))

	const oldestFirst = [...(source.ideas ?? [])].reverse().map((idea) => {
		const { projectId: old, ...rest } = idea
		const projectId = old === undefined ? undefined : projectIds.get(old)
		return { ...rest, ...(projectId ? { projectId } : {}), id: newId() }
	})
	for (const { id, ...payload } of oldestFirst) ops.push(create(TOOLBENCH.idea, id, payload satisfies IdeaPayload))

	return { data: { ideas: oldestFirst.reverse(), projects }, ops }
}

/** The URIs of the rows the data is stored in. */
export function toolbenchUris(data: ToolbenchData): string[] {
	return [
		...data.projects.map((project) => toUri(TOOLBENCH.project, project.id)),
		...data.ideas.map((idea) => toUri(TOOLBENCH.idea, idea.id)),
	]
}

/** The rows as the store holds them: the ideas newest first, the projects in the order they were made. */
export function toolbenchFromRows(rows: {
	ideas: Entity<IdeaPayload>[]
	projects: Entity<ProjectPayload>[]
}): ToolbenchData {
	return {
		ideas: rows.ideas.map((row) => ({ ...row.payload, id: row.id })).reverse(),
		projects: rows.projects.map((row) => ({ ...row.payload, id: row.id })),
	}
}
