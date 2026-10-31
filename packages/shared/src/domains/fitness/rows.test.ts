import { describe, expect, it } from 'vitest'
import { createEngine, type EngineStorage } from '../../data/engine.js'
import { createIdGenerator, isUlid } from '../../data/ulid.js'
import { fitnessFromRows, fitnessRows, fitnessUris } from './rows.js'
import { seedData } from './seed.js'
import { FITNESS, SESSION_KIND } from './types.js'

function memory(): EngineStorage {
	const map = new Map<string, string>()
	return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => void map.set(key, value) }
}

const seed = seedData({ venues: [{ id: 'p-castle', name: 'Castle Hill Fitness' }], stock: [] })

function readBack(engine: ReturnType<typeof createEngine>) {
	return fitnessFromRows({
		exercises: engine.queryEntities({ type: FITNESS.exercise }),
		templates: engine.queryEntities({ type: FITNESS.template }),
		logs: engine.queryEntities({ type: FITNESS.log }),
		sessions: engine.query('event', { kinds: [SESSION_KIND] }),
		gyms: engine.queryEntities({ type: FITNESS.gym }),
		supplements: engine.queryEntities({ type: FITNESS.supplement }),
		intakes: engine.queryEntities({ type: FITNESS.intake }),
		metrics: engine.queryEntities({ type: FITNESS.metric }),
		goals: engine.queryEntities({ type: FITNESS.goal }),
	} as Parameters<typeof fitnessFromRows>[0])
}

describe('fitness rows', () => {
	it('gives every record a new id, and what points at another follows it', () => {
		const { data, ops } = fitnessRows(seed, createIdGenerator())
		const ids = [
			...data.templates,
			...data.logs,
			...data.sessions,
			...data.gyms,
			...data.supplements,
			...data.intakes,
			...data.metrics,
		].map((record) => record.id)
		expect(ids.every(isUlid)).toBe(true)
		expect(new Set(ids).size).toBe(ids.length)

		// Monday's Pull A follows its template and its gym
		const pullA = data.logs.find((log) => log.title === 'Pull A' && log.rpe === 7)!
		expect(pullA.templateId).toBe(data.templates.find((template) => template.title === 'Pull A')!.id)
		expect(pullA.gymId).toBe(data.gyms.find((gym) => gym.name === 'Castle Hill Fitness')!.id)
		// Friday's session follows Push A; the intakes follow their supplement
		expect(data.sessions[0]!.templateId).toBe(data.templates.find((template) => template.title === 'Push A')!.id)
		expect(new Set(data.intakes.map((intake) => intake.supplementId))).toEqual(
			new Set(data.supplements.map((supplement) => supplement.id))
		)
		// a pointer at nothing in the data is dropped
		const orphan = fitnessRows({ ...seed, gyms: [] }, createIdGenerator())
		expect(orphan.data.logs.every((log) => log.gymId === undefined)).toBe(true)
		// the bundled exercises keep their ids
		expect(data.templates[0]!.exercises[0]!.exerciseId).toBe('x-bench-press')

		expect(fitnessUris(data)).toHaveLength(ops.filter((op) => op.op !== 'link').length)
	})

	it('reads back from the rows what it wrote: the seed with new ids', () => {
		const engine = createEngine(memory())
		const written = fitnessRows(seed, createIdGenerator())
		engine.applyBatch(written.ops)
		const read = readBack(engine)
		expect(read).toEqual(written.data)

		// the same data as the seed, but for the ids
		const strip = (records: { id: string }[]) => records.map(({ id: _id, ...rest }) => rest)
		expect(read.logs.map((log) => [log.title, log.date, log.minutes, log.rpe])).toEqual(
			seed.logs.map((log) => [log.title, log.date, log.minutes, log.rpe])
		)
		expect(strip(read.metrics)).toEqual(strip(seed.metrics))
		expect(read.goal).toMatchObject({ kind: 'weight', target: 80, by: seed.goal!.by })
		expect(read.gyms.find((gym) => gym.name === 'Castle Hill Fitness')?.placeId).toBe('p-castle')
	})

	it('links a log done for a session to its Event', () => {
		const withSession = {
			...seed,
			logs: [{ ...seed.logs[0]!, templateId: 'wt-01', sessionId: seed.sessions[0]!.id }],
		}
		const engine = createEngine(memory())
		const written = fitnessRows(withSession, createIdGenerator())
		engine.applyBatch(written.ops)
		const log = written.data.logs[0]!
		expect(log.sessionId).toBe(written.data.sessions[0]!.id)
		const links = engine.queryLinks({ owner: `eden://${FITNESS.log}/${log.id}` })
		expect(links.map((link) => [link.relation, link.uri])).toEqual([['for', `eden://event/${log.sessionId}`]])
		expect(readBack(engine).logs[0]?.sessionId).toBe(log.sessionId)
	})

	it('takes data with parts missing', () => {
		expect(fitnessRows({}, createIdGenerator()).ops).toEqual([])
	})
})
