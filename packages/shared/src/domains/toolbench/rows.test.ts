import { describe, expect, it } from 'vitest'
import { createEngine, type EngineStorage } from '../../data/engine.js'
import { createIdGenerator, isUlid } from '../../data/ulid.js'
import { toolbenchFromRows, toolbenchRows, toolbenchUris } from './rows.js'
import { TOOLBENCH, type IdeaPayload, type ProjectPayload, type ToolbenchData } from './types.js'

// the document as the store kept it: the newest idea first
const document: ToolbenchData = {
	ideas: [
		{
			id: '9f1c2a34-5b6d-4e7f-8a9b-0c1d2e3f4a5b',
			title: 'Kiln controller',
			status: 'idea',
			area: 'hardware',
			touchedAt: '2026-09-29T15:02:11.000Z',
			log: [{ id: 'a1', at: '2026-09-29T15:02:11.000Z', key: 'domains.toolbench.ideas.log.captured' }],
			brainstorm: [],
		},
		{
			id: 'i-02',
			title: 'Flow field',
			status: 'building',
			area: 'art',
			touchedAt: '2026-09-20T12:00:00',
			log: [{ id: 'il-01', at: '2026-09-18T12:00:00', line: 'Ported the sketch' }],
			brainstorm: [{ id: 'bm-01', owner: true, text: 'Seeded noise?' }],
			projectId: 'p-01',
		},
		{
			id: 'i-01',
			title: 'Solar logger',
			status: 'exploring',
			area: 'homelab',
			touchedAt: '2026-08-19T12:00:00',
			log: [],
			brainstorm: [],
			projectId: 'p-gone',
		},
	],
	projects: [
		{ id: 'p-01', name: 'nannou flow field', kind: 'art', repo: 'eden-sketches', next: ['Tune the step'] },
		{ id: 'p-02', name: 'Rack shelf', kind: 'hardware', next: [], parts: [{ name: 'Rails', price: 38 }], estimate: 38 },
	],
}

function memory(): EngineStorage {
	const map = new Map<string, string>()
	return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => void map.set(key, value) }
}

describe('toolbench rows', () => {
	it('gives every idea and project a new id, and an idea follows its project', () => {
		const { data, ops } = toolbenchRows(document, createIdGenerator())
		const ids = [...data.ideas, ...data.projects].map((record) => record.id)
		expect(ids.every(isUlid)).toBe(true)
		expect(new Set(ids).size).toBe(ids.length)

		expect(data.ideas.map((idea) => idea.title)).toEqual(['Kiln controller', 'Flow field', 'Solar logger'])
		expect(data.ideas[1]?.projectId).toBe(data.projects[0]?.id)
		// a project that is not in the document is not pointed at
		expect(data.ideas[2]).not.toHaveProperty('projectId')
		expect(data.ideas[0]).not.toHaveProperty('projectId')
		// what is inside an idea keeps the ids it had
		expect(data.ideas[1]).toMatchObject({ log: document.ideas[1]?.log, brainstorm: document.ideas[1]?.brainstorm })
		expect(data.projects[1]).toMatchObject({ parts: [{ name: 'Rails', price: 38 }], estimate: 38 })

		expect(ops).toHaveLength(5)
		expect(toolbenchUris(data)).toHaveLength(5)
	})

	it('makes the newest idea the greatest id', () => {
		const { data } = toolbenchRows(document, createIdGenerator())
		const ids = data.ideas.map((idea) => idea.id)
		expect([...ids].sort().reverse()).toEqual(ids)
	})

	it('reads back from the rows what it wrote, newest first', () => {
		const engine = createEngine(memory())
		const written = toolbenchRows(document, createIdGenerator())
		engine.applyBatch(written.ops)
		const read = toolbenchFromRows({
			ideas: engine.queryEntities<IdeaPayload>({ type: TOOLBENCH.idea }),
			projects: engine.queryEntities<ProjectPayload>({ type: TOOLBENCH.project }),
		})
		expect(read).toEqual(written.data)
	})

	it('takes a document with parts missing', () => {
		expect(toolbenchRows({}, createIdGenerator())).toEqual({ data: { ideas: [], projects: [] }, ops: [] })
	})
})
