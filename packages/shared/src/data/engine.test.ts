import { describe, expect, it } from 'vitest'
import { createEngine, DATA_KEY, LOCAL_CALENDAR_SOURCE, type EngineStorage } from './engine.js'
import { dataErrorCode } from './errors.js'
import { newId } from './ulid.js'

function memory(): EngineStorage & { map: Map<string, string> } {
	const map = new Map<string, string>()
	return { map, getItem: (key) => map.get(key) ?? null, setItem: (key, value) => void map.set(key, value) }
}

/** An engine whose clock stands still unless moved, so the stamps show the counter at work. */
function setup() {
	const storage = memory()
	const clock = { now: 1_790_000_000_000 }
	const engine = createEngine(storage, { now: () => clock.now, node: 0xab })
	return { storage, clock, engine }
}

const codeOf = (run: () => unknown) => {
	try {
		run()
	} catch (error) {
		return dataErrorCode(error)
	}
	return 'no error'
}

describe('engine', () => {
	it('creates, reads and replaces an entity', () => {
		const { engine } = setup()
		const created = engine.createEntity({ type: 'recipe', payload: { name: 'Dal', serves: 2 } })
		expect(created.uri).toBe(`eden://recipe/${created.id}`)
		expect(created.createdAt).toBe('000001a0c4506c00-00000000-000000ab')
		expect(created.updatedAt).toBe(created.createdAt)
		expect(created).toMatchObject({ deletedAt: null, mirror: false, source: null, links: [] })

		const updated = engine.updateEntity(created.id, { name: 'Dal tadka' })
		expect(updated.payload).toEqual({ name: 'Dal tadka' })
		expect(updated.createdAt).toBe(created.createdAt)
		expect(updated.updatedAt).toBe('000001a0c4506c00-00000001-000000ab')
		expect(engine.queryEntities({ type: 'recipe' })).toEqual([updated])
		expect(engine.queryEntities({ type: 'idea' })).toEqual([])
	})

	it('keeps what it is given apart from what it holds', () => {
		const { engine } = setup()
		const payload = { tags: ['quick'] }
		const created = engine.createEntity({ type: 'recipe', payload })
		payload.tags.push('changed after')
		created.payload.tags.push('changed on the result')
		expect(engine.queryEntities({ type: 'recipe' }).map((row) => row.payload)).toEqual([{ tags: ['quick'] }])
	})

	it('grants, renews, revokes and checks', () => {
		const { engine } = setup()
		const check = { subject: 'anthropic', resource: 'allergy', resourceType: 'registry', access: 'read' } as const
		expect(engine.checkGrant(check)).toEqual({ allowed: false, reason: 'no-grant' })
		expect(engine.checkGrant({ ...check, resource: 'recipe' })).toEqual({ allowed: true, reason: 'default' })

		const granted = engine.grant({ ...check, lifetime: 'standing', origin: 'onboarding' })
		expect(granted.uri).toBe(`eden://grant/${granted.id}`)
		expect(granted).toMatchObject({ narrowing: null, deletedAt: null, createdAt: granted.updatedAt })
		expect(engine.checkGrant(check)).toEqual({ allowed: true, reason: 'grant', grantId: granted.id })

		const renewed = engine.grant({ ...check, lifetime: 'session', origin: 'confirm', narrowing: { a: 1 } })
		expect(renewed.id).toBe(granted.id)
		expect(renewed).toMatchObject({ lifetime: 'session', origin: 'confirm', narrowing: { a: 1 } })
		expect(renewed.updatedAt > granted.updatedAt).toBe(true)
		expect(engine.queryGrants()).toHaveLength(1)

		const revoked = engine.revoke(granted.id)
		expect(revoked.deletedAt).toBe(revoked.updatedAt)
		expect(engine.queryGrants()).toEqual([])
		expect(engine.queryGrants({ includeRevoked: true })).toEqual([revoked])
		expect(engine.revoke(granted.id)).toEqual(revoked)
		expect(engine.checkGrant(check).reason).toBe('no-grant')

		expect(
			codeOf(() => engine.grant({ ...check, resource: 'identity-document', lifetime: 'standing', origin: 'settings' }))
		).toBe('grant:never')
		expect(
			codeOf(() => engine.grant({ ...check, access: 'write-draft', lifetime: 'standing', origin: 'settings' }))
		).toBe('grant:invalid')
		expect(codeOf(() => engine.checkGrant({ ...check, resource: 'secret-sauce' }))).toBe('grant:invalid')
		expect(codeOf(() => engine.revoke(newId()))).toBe('not-found')
		expect(engine.checkGrant({ ...check, resource: 'pay', resourceType: 'tool', access: 'write' }).reason).toBe('never')
	})

	it('records egress by destination and day and refuses vault-ai', () => {
		const storage = memory()
		const day = { today: '2026-09-29' }
		const engine = createEngine(storage, { now: () => 1_790_000_000_000, node: 0xab, today: () => day.today })
		engine.recordEgress('open-meteo', 120)
		engine.recordEgress('open-meteo', 80)
		engine.recordEgress('nws', 0)
		day.today = '2026-09-30'
		engine.recordEgress('open-meteo', 5)
		expect(engine.queryEgress()).toEqual([
			{ destination: 'open-meteo', day: '2026-09-30', requests: 1, bytesOut: 5 },
			{ destination: 'nws', day: '2026-09-29', requests: 1, bytesOut: 0 },
			{ destination: 'open-meteo', day: '2026-09-29', requests: 2, bytesOut: 200 },
		])
		expect(engine.queryEgress({ from: '2026-09-30' })).toHaveLength(1)
		expect(engine.queryEgress({ to: '2026-09-29' })).toHaveLength(2)
		expect(codeOf(() => engine.recordEgress('vault-ai', 1))).toBe('egress:never')
		expect(codeOf(() => engine.recordEgress('Open Meteo', 1))).toBe('egress:invalid')
		// Ninety days on, the old days are gone.
		day.today = '2026-12-30'
		engine.recordEgress('nws', 1)
		expect(engine.queryEgress().map((row) => row.day)).toEqual(['2026-12-30'])
	})

	it('asserts, edits with history, deletes and restores a fact', () => {
		const { engine, clock } = setup()
		const nuts = engine.assertFact({
			type: 'allergy',
			value: { kind: 'food', substance: 'tree nuts', severity: 'mild' },
			provenance: 'user-asserted',
			note: 'since the picnic',
		})
		expect(nuts.uri).toBe(`eden://fact/${nuts.id}`)
		expect(nuts).toMatchObject({ confidence: null, validFrom: null, deletedAt: null, createdAt: nuts.updatedAt })
		expect(engine.queryFacts()).toEqual([nuts])

		clock.now += 1000
		const severe = engine.updateFact(nuts.id, {
			value: { kind: 'food', substance: 'tree nuts', severity: 'severe' },
			note: null,
		})
		expect(severe.updatedAt > nuts.updatedAt).toBe(true)
		expect(severe.createdAt).toBe(nuts.createdAt)
		expect(engine.queryFactHistory(nuts.id)).toEqual([
			{
				factId: nuts.id,
				type: 'allergy',
				value: nuts.value,
				note: 'since the picnic',
				validFrom: null,
				validUntil: null,
				replacedAt: severe.updatedAt,
			},
		])
		// An edit that changes only the source keeps nothing.
		engine.updateFact(nuts.id, { source: 'eden://recipe/x' })
		expect(engine.queryFactHistory(nuts.id)).toHaveLength(1)
		// Thirty days on, the history is gone.
		clock.now += 31 * 24 * 60 * 60 * 1000
		expect(engine.queryFactHistory(nuts.id)).toEqual([])

		const deleted = engine.deleteFact(nuts.id)
		expect(deleted.deletedAt).toBe(deleted.updatedAt)
		expect(engine.queryFacts()).toEqual([])
		expect(engine.queryFacts({ includeDeleted: true })).toEqual([deleted])
		expect(engine.deleteFact(nuts.id)).toEqual(deleted)
		expect(codeOf(() => engine.updateFact(nuts.id, { note: 'x' }))).toBe('not-found')
		const restored = engine.restoreFact(nuts.id)
		expect(restored.deletedAt).toBeNull()
		expect(engine.queryFacts()).toEqual([restored])

		expect(codeOf(() => engine.assertFact({ type: 'recipe' as never, value: 'x', provenance: 'user-asserted' }))).toBe(
			'fact:invalid'
		)
		expect(codeOf(() => engine.assertFact({ type: 'skill', value: 'Rust', provenance: 'ai-inferred' }))).toBe(
			'fact:invalid'
		)
		expect(codeOf(() => engine.updateFact(nuts.id, { colour: 'green' } as never))).toBe('fact:invalid')
		expect(codeOf(() => engine.updateFact(nuts.id, { provenance: 'integration' } as never))).toBe('fact:invalid')
		expect(codeOf(() => engine.deleteFact(newId()))).toBe('not-found')
	})

	it('renews a system-derived fact in place and hands back the effective set', () => {
		const clock = { now: 1_790_000_000_000 }
		const home = createEngine(memory(), { now: () => clock.now, node: 0xab, today: () => '2026-09-30' })
		const area = (city: string) => ({
			type: 'home-area' as const,
			value: { city, region: 'Texas', country: 'United States' },
			provenance: 'system-derived' as const,
			source: 'setting:home',
		})
		const first = home.assertFact(area('Austin'))
		clock.now += 1000
		const moved = home.assertFact(area('Houston'))
		expect(moved.id).toBe(first.id)
		expect(moved.value).toEqual({ city: 'Houston', region: 'Texas', country: 'United States' })
		expect(home.queryFacts()).toHaveLength(1)
		expect(home.queryFactHistory(first.id).map((entry) => entry.value)).toEqual([first.value])
		expect(codeOf(() => home.assertFact({ type: 'allergy', value: {}, provenance: 'system-derived' }))).toBe(
			'fact:invalid'
		)

		// The owner's own word comes first, then the latest; the window is judged by the day.
		const thai = home.assertFact({
			type: 'cuisine-preference',
			value: { name: 'Thai', weight: 0.5 },
			provenance: 'ai-inferred',
			confidence: 0.6,
		})
		clock.now += 1000
		const mexican = home.assertFact({
			type: 'cuisine-preference',
			value: { name: 'Mexican', weight: 0.7 },
			provenance: 'ai-inferred',
			confidence: 0.7,
		})
		const japanese = home.assertFact({
			type: 'cuisine-preference',
			value: { name: 'Japanese', weight: 0.9 },
			provenance: 'user-asserted',
		})
		const past = home.assertFact({
			type: 'dietary-preference',
			value: 'low-sodium',
			provenance: 'user-asserted',
			validUntil: '2020-01-31',
		})
		const ids = (facts: { id: string }[]) => facts.map((fact) => fact.id)
		expect(ids(home.queryFacts({ types: ['cuisine-preference'] }))).toEqual([japanese.id, mexican.id, thai.id])
		expect(ids(home.queryFacts({ owner: 'kitchen' }))).toEqual([japanese.id, mexican.id, thai.id])
		expect(ids(home.queryFacts({ owner: 'kitchen', includeExpired: true }))).toContain(past.id)
		expect(ids(home.queryFacts({ at: '2020-01-31', types: ['dietary-preference'] }))).toEqual([past.id])
		expect(home.queryFacts({ owner: 'weather' })).toEqual([])
		expect(ids(home.queryFacts({ owner: 'substrate' }))).toEqual([first.id])
		expect(codeOf(() => home.queryFacts({ at: 'someday' }))).toBe('fact:invalid')

		// The owner's word over what was inferred: the fact becomes theirs and its confidence goes.
		const owned = home.updateFact(thai.id, { provenance: 'user-asserted' })
		expect(owned).toMatchObject({ provenance: 'user-asserted', confidence: null })
		expect(codeOf(() => home.updateFact(thai.id, { confidence: 0.5 }))).toBe('fact:invalid')
	})

	it('keeps grants and the ledger across a reload and tolerates an old document', () => {
		const { storage, engine } = setup()
		const granted = engine.grant({
			subject: 'anthropic',
			resource: 'allergy',
			resourceType: 'registry',
			access: 'read',
			lifetime: 'standing',
			origin: 'onboarding',
		})
		engine.recordEgress('nws', 10)
		const named = engine.assertFact({ type: 'preferred-name', value: 'Rowan', provenance: 'user-asserted' })
		const again = createEngine(storage, { now: () => 1_790_000_000_000 })
		expect(again.queryGrants()).toEqual([granted])
		expect(again.queryEgress()).toHaveLength(1)
		expect(again.queryFacts()).toEqual([named])

		// A document from before the grant store has neither list.
		const document = JSON.parse(storage.map.get(DATA_KEY)!) as Record<string, unknown>
		delete document.grants
		delete document.egress
		delete document.facts
		delete document.factHistory
		storage.map.set(DATA_KEY, JSON.stringify(document))
		const old = createEngine(storage, { now: () => 1_790_000_000_000 })
		expect(old.queryGrants()).toEqual([])
		expect(old.queryEgress()).toEqual([])
		expect(old.queryFacts()).toEqual([])
		expect(old.queryEntities({ type: 'calendar-source' })).toHaveLength(1)
	})

	it('survives a reload, and keeps its node', () => {
		const { storage, engine } = setup()
		const created = engine.createEntity({ type: 'recipe', payload: { name: 'Dal' } })
		const again = createEngine(storage, { now: () => 1_790_000_000_000 })
		expect(again.queryEntities({ type: 'recipe' })).toEqual([created])
		expect(again.createEntity({ type: 'recipe', payload: {} }).updatedAt).toBe('000001a0c4506c00-00000001-000000ab')
	})

	it('returns rows in the order they were made', () => {
		const { engine } = setup()
		const names = ['a', 'b', 'c', 'd']
		for (const name of names) engine.createEntity({ type: 'recipe', payload: { name } })
		expect(engine.queryEntities<{ name: string }>({ type: 'recipe' }).map((row) => row.payload.name)).toEqual(names)
	})

	it('refuses what is malformed', () => {
		const { engine } = setup()
		const id = newId()
		engine.createEntity({ id, type: 'recipe', payload: {} })
		for (const bad of [
			() => engine.createEntity({ type: 'Recipe', payload: {} }),
			() => engine.createEntity({ type: 'task', payload: {} }),
			// well formed, and in no registry; then a type of Phase 2, which nothing may create yet
			() => engine.createEntity({ type: 'gadget', payload: {} }),
			() => engine.createEntity({ type: 'workout-log', payload: {} }),
			() => engine.createEntity({ id: 'r-01', type: 'recipe', payload: {} }),
			() => engine.createEntity({ id, type: 'recipe', payload: {} }),
			() => engine.createEntity({ type: 'recipe', payload: [] as unknown as object }),
			() => engine.createEntity({ type: 'forecast', payload: {}, mirror: true }),
			() => engine.createEntity({ type: 'forecast', payload: {}, source: 'open-meteo' }),
			() => engine.deleteRows(['recipe/01']),
		]) {
			expect(codeOf(bad)).toBe('invalid')
		}
		expect(engine.queryEntities({ type: 'recipe' })).toHaveLength(1)
	})

	it('writes a tombstone and takes it back', () => {
		const { engine } = setup()
		const created = engine.createEntity({ type: 'recipe', payload: { name: 'Dal' } })

		const deleted = engine.deleteRows([created.uri])[0]!
		expect(deleted.updatedAt > created.updatedAt).toBe(true)
		expect(engine.queryEntities({ type: 'recipe' })).toEqual([])
		const [kept] = engine.queryEntities({ type: 'recipe', includeDeleted: true })
		expect(kept).toMatchObject({ deletedAt: deleted.updatedAt, updatedAt: deleted.updatedAt, payload: { name: 'Dal' } })

		expect(engine.deleteRows([created.uri])).toEqual([])
		expect(codeOf(() => engine.updateEntity(created.id, {}))).toBe('not-found')

		const restored = engine.restoreRows([created.uri])[0]!
		expect(restored.updatedAt > deleted.updatedAt).toBe(true)
		expect(engine.restoreRows([created.uri])).toEqual([])
		expect(engine.queryEntities({ type: 'recipe' })).toMatchObject([{ deletedAt: null, payload: { name: 'Dal' } }])
	})

	it('does not find a row under another type, or one that was never there', () => {
		const { engine } = setup()
		const idea = engine.createEntity({ type: 'idea', payload: {} })
		expect(codeOf(() => engine.deleteRows([`eden://recipe/${idea.id}`]))).toBe('not-found')
		expect(codeOf(() => engine.deleteRows([`eden://recipe/${newId()}`]))).toBe('not-found')
		expect(codeOf(() => engine.updateEntity(newId(), {}))).toBe('not-found')
	})

	it('filters by ids and by link', () => {
		const { engine } = setup()
		const project = engine.createEntity({ type: 'project', payload: { name: 'Kiln build' } })
		const kiln = engine.createEntity({ type: 'idea', payload: { title: 'Kiln' } })
		const loom = engine.createEntity({ type: 'idea', payload: { title: 'Loom' } })
		engine.link(kiln.uri, { uri: project.uri, relation: 'part-of', label: 'Kiln build' })

		expect(engine.queryEntities({ type: 'idea', ids: [loom.id] }).map((row) => row.id)).toEqual([loom.id])
		expect(engine.queryEntities({ type: 'idea', ids: [] })).toEqual([])
		const linked = engine.queryEntities({ type: 'idea', linkedTo: project.uri })
		expect(linked.map((row) => row.id)).toEqual([kiln.id])
		expect(linked.flatMap((row) => row.links)).toMatchObject([
			{ owner: kiln.uri, uri: project.uri, relation: 'part-of' },
		])
	})

	it('adds, removes and brings back a link', () => {
		const { engine } = setup()
		const project = engine.createEntity({ type: 'project', payload: {} })
		const idea = engine.createEntity({ type: 'idea', payload: {} })

		const first = engine.link(idea.uri, { uri: project.uri, relation: 'part-of', label: 'Kiln build' })
		expect(engine.queryLinks({ target: project.uri })).toEqual([first])
		expect(engine.queryLinks({ owner: idea.uri, relation: 'about' })).toEqual([])

		engine.unlink(idea.uri, project.uri, 'part-of')
		engine.unlink(idea.uri, project.uri, 'part-of')
		expect(engine.queryLinks()).toEqual([])

		const again = engine.link(idea.uri, { uri: project.uri, relation: 'part-of', label: 'The kiln' })
		expect(again).toMatchObject({ label: 'The kiln', deletedAt: null, createdAt: first.createdAt })
		expect(again.updatedAt > first.updatedAt).toBe(true)

		// the target may be gone; the owner may not
		engine.deleteRows([project.uri])
		expect(engine.queryLinks({ target: project.uri })).toHaveLength(1)
		engine.deleteRows([idea.uri])
		expect(codeOf(() => engine.link(idea.uri, { uri: project.uri, relation: 'part-of' }))).toBe('not-found')
		expect(codeOf(() => engine.link(project.uri, { uri: idea.uri, relation: 'likes' as 'about' }))).toBe('invalid')
	})

	it('keeps a mirror unique by its source, and an overlay among the live rows', () => {
		const { engine } = setup()
		const mirror = { type: 'forecast', payload: {}, mirror: true, source: 'open-meteo', externalId: 'home' }
		const overlay = { type: 'forecast', payload: {}, source: 'open-meteo', externalId: 'home' }

		engine.createEntity(mirror)
		expect(codeOf(() => engine.createEntity(mirror))).toBe('invalid')

		// the overlay shares the key with its mirror, and is unique on its own side
		const first = engine.createEntity(overlay)
		expect(codeOf(() => engine.createEntity(overlay))).toBe('invalid')
		engine.deleteRows([first.uri])
		engine.createEntity(overlay)
		engine.createEntity({ ...overlay, externalId: 'work' })
	})

	it('applies a batch whole or not at all', () => {
		const { storage, engine } = setup()
		const project = newId()
		const idea = newId()
		const result = engine.applyBatch([
			{ op: 'createEntity', input: { id: project, type: 'project', payload: { name: 'Kiln build' } } },
			{ op: 'createEntity', input: { id: idea, type: 'idea', payload: { title: 'Kiln' } } },
			{ op: 'updateEntity', id: idea, payload: { title: 'Kiln', projectId: project } },
			{ op: 'link', owner: `eden://idea/${idea}`, link: { uri: `eden://project/${project}`, relation: 'part-of' } },
			{ op: 'delete', uri: `eden://project/${project}` },
			{ op: 'restore', uri: `eden://project/${project}` },
		])
		expect(result.applied).toBe(true)
		expect(result.rows.map((row) => row.id)).toEqual([project, idea, idea])
		const stamps = result.rows.map((row) => row.updatedAt)
		expect([...stamps].sort()).toEqual(stamps)

		const before = storage.map.get(DATA_KEY)
		expect(
			codeOf(() =>
				engine.applyBatch(
					[
						{ op: 'createEntity', input: { type: 'recipe', payload: {} } },
						{ op: 'delete', uri: `eden://recipe/${newId()}` },
					],
					'legacy-import:kitchen'
				)
			)
		).toBe('not-found')
		expect(storage.map.get(DATA_KEY)).toBe(before)
	})

	it('applies a marked batch once', () => {
		const { engine } = setup()
		const batch = [{ op: 'createEntity' as const, input: { type: 'recipe', payload: { name: 'Dal' } } }]

		expect(engine.applyBatch(batch, 'legacy-import:kitchen').applied).toBe(true)
		expect(engine.applyBatch(batch, 'legacy-import:kitchen')).toEqual({ applied: false, rows: [] })
		expect(engine.queryEntities({ type: 'recipe' })).toHaveLength(1)

		// an empty batch still leaves its marker
		expect(engine.applyBatch([], 'legacy-import:toolbench').applied).toBe(true)
		expect(engine.applyBatch(batch, 'legacy-import:toolbench').applied).toBe(false)
		expect(codeOf(() => engine.applyBatch(batch, 'Not A Marker'))).toBe('invalid')
	})

	it('starts over from a document it cannot read', () => {
		const storage = memory()
		storage.setItem(DATA_KEY, '{ not json')
		const engine = createEngine(storage)
		expect(engine.queryEntities({ type: 'recipe' })).toEqual([])
		expect(engine.createEntity({ type: 'recipe', payload: {} }).deletedAt).toBeNull()
	})

	it('keeps a task with its defaults and patches it', () => {
		const { engine } = setup()
		const task = engine.create('task', {
			kind: 'checklist',
			title: 'Cook the dal',
			due: '2026-10-01',
			items: [{ text: 'Soak', done: true }],
		})
		expect(task).toMatchObject({
			uri: `eden://task/${task.id}`,
			type: 'task',
			priority: 'none',
			done: false,
			streak: 0,
			notes: null,
			mirror: false,
			deletedAt: null,
			links: [],
		})

		const patched = engine.update('task', task.id, { done: true, completedAt: '2026-10-01T13:00:00Z', due: null })
		expect(patched).toMatchObject({
			done: true,
			due: null,
			title: 'Cook the dal',
			items: [{ text: 'Soak', done: true }],
		})
		expect(patched.updatedAt > task.updatedAt).toBe(true)

		for (const bad of [
			() => engine.update('task', task.id, { title: null as unknown as string }),
			() => engine.update('task', task.id, { colour: 'red' } as object),
			() => engine.update('task', task.id, { kind: 'spaceship' as 'todo' }),
			() => engine.create('task', { kind: 'todo' } as never),
			() => engine.create('task', { kind: 'todo', title: 'x', colour: 'red' } as never),
			() => engine.create('place', { kind: 'venue', name: 'Half a point', lat: 30.3 }),
			() => engine.create('event', { kind: 'local-event', title: 'x', startAt: '2026-10-01', attendees: ['a'] }),
		]) {
			expect(codeOf(bad)).toBe('invalid')
		}
		expect(codeOf(() => engine.update('task', newId(), { done: true }))).toBe('not-found')
		expect(codeOf(() => engine.update('event', task.id, { title: 'x' }))).toBe('not-found')
		expect(codeOf(() => engine.attach())).toBe('unavailable')
	})

	it('seeds the local calendar source, which an event belongs to', () => {
		const { engine } = setup()
		const source = engine.getRow(`eden://calendar-source/${LOCAL_CALENDAR_SOURCE}`)
		expect(source).toMatchObject({ payload: { kind: 'local' }, updatedAt: '0000000000000000-00000000-00000000' })

		const event = engine.create('event', { kind: 'shop-day', title: 'Shop', startAt: '2026-10-03', allDay: true })
		expect(event).toMatchObject({ calendarSourceId: LOCAL_CALENDAR_SOURCE, status: 'confirmed', allDay: true })
		expect(engine.getRow(event.uri)).toEqual(event)
		expect(engine.getRow(`eden://task/${event.id}`)).toBeNull()

		const snapped = engine.snapshot(event.uri, { title: 'Shop' })
		expect(snapped).toMatchObject({ snapshot: { title: 'Shop' } })
		expect(snapped.updatedAt > event.updatedAt).toBe(true)
	})

	it('allows one home', () => {
		const { engine } = setup()
		const home = { kind: 'home' as const, name: 'Home', lat: 30.3, lng: -97.7 }
		const first = engine.create('place', home)
		expect(codeOf(() => engine.create('place', home))).toBe('invalid')
		expect(
			codeOf(() => engine.update('place', engine.create('place', { kind: 'venue', name: 'Cafe' }).id, { kind: 'home' }))
		).toBe('invalid')

		engine.deleteRows([first.uri])
		engine.create('place', home)
		expect(codeOf(() => engine.restoreRows([first.uri]))).toBe('invalid')
	})

	it('filters primitives by kind, time, place and link', () => {
		const { engine } = setup()
		const market = engine.create('place', { kind: 'venue', name: 'Market' })
		const at = [{ uri: market.uri, relation: 'at' as const, label: 'Market' }]
		const about = [{ uri: market.uri, relation: 'about' as const, label: 'Market' }]
		engine.create('task', { kind: 'todo', title: 'early', due: '2026-09-30' })
		engine.create('task', { kind: 'todo', title: 'inside', due: '2026-10-02', links: at })
		engine.create('task', { kind: 'reminder', title: 'timed', at: '2026-10-03T09:00:00Z', links: about })
		engine.create('task', { kind: 'todo', title: 'late', due: '2026-10-09' })
		engine.create('task', { kind: 'todo', title: 'undated' })
		const titles = (filter = {}) => engine.query('task', filter).map((row) => row.title)

		expect(titles()).toEqual(['early', 'inside', 'timed', 'late', 'undated'])
		expect(titles({ kinds: ['reminder'] })).toEqual(['timed'])
		expect(titles({ kinds: [] })).toEqual([])
		expect(titles({ from: '2026-10-01', to: '2026-10-03T23:59:59Z' })).toEqual(['inside', 'timed'])
		expect(titles({ to: '2026-09-30' })).toEqual(['early'])
		expect(titles({ place: market.uri })).toEqual(['inside'])
		expect(titles({ linkedTo: market.uri })).toEqual(['inside', 'timed'])
		expect(titles({ linkedTo: market.uri, relation: 'about' })).toEqual(['timed'])

		engine.create('event', { kind: 'local-event', title: 'trip', startAt: '2026-10-01', endAt: '2026-10-05' })
		expect(engine.query('event', { from: '2026-10-04', to: '2026-10-08' })).toHaveLength(1)
		expect(engine.query('event', { from: '2026-10-06', to: '2026-10-08' })).toHaveLength(0)
	})

	it('writes primitives in a batch, but not an attachment', () => {
		const { engine } = setup()
		const id = newId()
		const result = engine.applyBatch([
			{ op: 'createPrimitive', type: 'task', input: { id, kind: 'todo', title: 'Restock rice' } },
			{ op: 'updatePrimitive', type: 'task', id, patch: { done: true } },
		])
		expect(result.rows).toMatchObject([{ done: false }, { done: true }])
		expect(
			codeOf(() => engine.applyBatch([{ op: 'createPrimitive', type: 'attachment' as 'task', input: {} as never }]))
		).toBe('invalid')
	})
})
