import { describe, expect, it } from 'vitest'
import { createEngine, DATA_KEY, LOCAL_CALENDAR_SOURCE, type EngineStorage } from './engine.js'
import { dataErrorCode } from './errors.js'
import type { Entity } from './types.js'
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

	it('declares schedules, takes what is due once and keeps a one-shot until it is taken', () => {
		const { storage, clock, engine } = setup()
		const start = clock.now
		engine.declareSchedules([{ name: 'weather.alerts', every: 300 }])
		engine.setSchedule('kitchen.shop-day', start + 60_000)
		expect(engine.takeDueSchedules()).toEqual([{ name: 'weather.alerts', dueAt: start }])
		expect(engine.takeDueSchedules()).toEqual([])

		// An hour on, the alerts missed eleven periods and are due once; the one-shot is due and then gone.
		clock.now = start + 60 * 60_000
		expect(engine.takeDueSchedules()).toEqual([
			{ name: 'kitchen.shop-day', dueAt: start + 60_000 },
			{ name: 'weather.alerts', dueAt: start + 300_000 },
		])
		expect(engine.cancelSchedule('kitchen.shop-day')).toBe(false)
		engine.setSchedule('kitchen.shop-day', clock.now + 60_000)
		expect(engine.cancelSchedule('kitchen.shop-day')).toBe(true)

		// The schedules survive a reload, and a declaration that stands moves nothing.
		const again = createEngine(storage, { now: () => clock.now })
		again.declareSchedules([{ name: 'weather.alerts', every: 300 }])
		expect(again.takeDueSchedules()).toEqual([])
		clock.now += 300_000
		expect(again.takeDueSchedules()).toHaveLength(1)

		expect(codeOf(() => engine.declareSchedules([{ name: 'weather.alerts', every: 30 }]))).toBe('schedule:invalid')
		expect(codeOf(() => engine.setSchedule('weather.alerts', clock.now))).toBe('schedule:invalid')
		expect(engine.cancelSchedule('weather.alerts')).toBe(false)
	})

	it('keeps a signal with its cards, once for a key, and marks a card read', () => {
		const { storage, clock, engine } = setup()
		const expiring = (day: string) =>
			engine.emitSignal({
				name: 'stock.expiring',
				tier: 'T0',
				payload: { uris: [], count: 2 },
				dedupeKey: day,
				deliveries: [{ rule: 'kitchen.expiring-digest', channel: 'in-app' }],
			})
		const first = expiring('2026-09-29')!
		expect(first.signal).toMatchObject({ name: 'stock.expiring', payload: { uris: [], count: 2 }, at: clock.now })
		expect(first.deliveries).toEqual([
			{
				id: first.deliveries[0]!.id,
				signalId: first.signal.id,
				rule: 'kitchen.expiring-digest',
				channel: 'in-app',
				read: false,
				name: 'stock.expiring',
				payload: { uris: [], count: 2 },
				tier: 'T0',
				at: clock.now,
			},
		])
		// The same key again is a dedupe hit: nothing is answered and nothing is written.
		expect(expiring('2026-09-29')).toBeNull()
		const second = expiring('2026-09-30')!
		// A signal no rule answers is kept all the same, with no card.
		expect(engine.emitSignal({ name: 'idea.stale', tier: 'T1' })?.deliveries).toEqual([])

		// The latest first; a card is read once; the inbox survives a reload.
		const ids = (cards: { id: string }[]) => cards.map((card) => card.id)
		expect(ids(engine.queryInbox())).toEqual([second.deliveries[0]!.id, first.deliveries[0]!.id])
		expect(engine.markInboxRead(ids(first.deliveries))).toBe(1)
		expect(engine.markInboxRead(ids(first.deliveries))).toBe(0)
		const again = createEngine(storage, { now: () => clock.now })
		expect(ids(again.queryInbox({ unreadOnly: true }))).toEqual(ids(second.deliveries))
		expect(again.queryInbox({ limit: 1 })).toHaveLength(1)

		// A withdrawn signal's card leaves the inbox; its key stays spent, so it is not emitted again.
		const alert = () =>
			engine.emitSignal({
				name: 'weather.alert',
				tier: 'T0',
				dedupeKey: 'urn:1',
				deliveries: [{ rule: 'weather.severe-alert', channel: 'os' }],
			})
		const issued = alert()!
		expect(engine.withdrawSignal('weather.alert', 'urn:1')).toEqual(ids(issued.deliveries))
		expect(engine.withdrawSignal('weather.alert', 'urn:1')).toEqual([])
		expect(engine.queryInbox()).toHaveLength(2)
		expect(alert()).toBeNull()

		expect(codeOf(() => engine.emitSignal({ name: 'expiring', tier: 'T0' }))).toBe('signal:invalid')
		expect(
			codeOf(() =>
				engine.emitSignal({
					name: 'grocery.shop-day',
					tier: 'T0',
					deliveries: [
						{ rule: 'kitchen.shop-day-reminder', channel: 'os' },
						{ rule: 'kitchen.shop-day-reminder', channel: 'in-app' },
					],
				})
			)
		).toBe('signal:invalid')

		// Thirty days on the signals stay; a millisecond past that they go with their cards, and the key is free again.
		clock.now += 30 * 24 * 60 * 60 * 1000
		engine.emitSignal({ name: 'idea.stale', tier: 'T1' })
		expect(engine.queryInbox()).toHaveLength(2)
		clock.now += 1
		expect(expiring('2026-09-29')).not.toBeNull()
		expect(engine.queryInbox()).toHaveLength(1)
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
		delete document.schedules
		delete document.signals
		delete document.inbox
		storage.map.set(DATA_KEY, JSON.stringify(document))
		const old = createEngine(storage, { now: () => 1_790_000_000_000 })
		expect(old.queryGrants()).toEqual([])
		expect(old.queryEgress()).toEqual([])
		expect(old.queryFacts()).toEqual([])
		expect(old.takeDueSchedules()).toEqual([])
		expect(old.queryInbox()).toEqual([])
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

	it('puts a mirror, replaces it and drops it', () => {
		const { engine } = setup()
		const put = (payload: object) =>
			engine.applyBatch([
				{ op: 'putMirror', input: { type: 'forecast', source: 'open-meteo', externalId: '30.31,-97.74', payload } },
			]).rows[0] as Entity

		const first = put({ temp: 21 })
		expect(first.mirror).toBe(true)

		// putting it again replaces the row it names: the same id, a later stamp, the new payload whole
		const second = put({ hi: 30 })
		expect(second.id).toBe(first.id)
		expect(second.payload).toEqual({ hi: 30 })
		expect(second.updatedAt > first.updatedAt).toBe(true)
		expect(engine.queryEntities({ type: 'forecast' })).toHaveLength(1)

		// a deleted mirror still holds its key, and a put brings it back
		engine.deleteRows([first.uri])
		expect(engine.queryEntities({ type: 'forecast' })).toHaveLength(0)
		const third = put({ hi: 31 })
		expect(third.id).toBe(first.id)
		expect(third.deletedAt).toBeNull()

		// a drop takes the row and its links, and leaves no tombstone
		const place = `eden://place/${newId()}`
		engine.applyBatch([
			{ op: 'link', owner: first.uri, link: { uri: place, relation: 'at' } },
			{ op: 'dropMirror', uri: first.uri },
		])
		expect(engine.queryEntities({ type: 'forecast', includeDeleted: true })).toEqual([])
		expect(engine.queryLinks({ target: place })).toEqual([])
	})

	it('refuses to drop what is not a mirror', () => {
		const { engine } = setup()
		const recipe = engine.createEntity({ type: 'recipe', payload: { name: 'Dal' } })
		expect(codeOf(() => engine.applyBatch([{ op: 'dropMirror', uri: recipe.uri }]))).toBe('invalid')
		expect(engine.queryEntities({ type: 'recipe' })).toHaveLength(1)
		expect(codeOf(() => engine.applyBatch([{ op: 'dropMirror', uri: `eden://forecast/${newId()}` }]))).toBe('not-found')
		// a mirror names a registered type and carries an object, as any entity does
		const bad = { source: 'nws', externalId: 'a' }
		expect(
			codeOf(() => engine.applyBatch([{ op: 'putMirror', input: { ...bad, type: 'spaceship', payload: {} } }]))
		).toBe('invalid')
		expect(
			codeOf(() =>
				engine.applyBatch([{ op: 'putMirror', input: { ...bad, type: 'alert', payload: 'text' as unknown as object } }])
			)
		).toBe('invalid')
	})

	it('sweeps the mirrors past their retention', () => {
		const { engine, clock } = setup()
		engine.applyBatch([
			{ op: 'putMirror', input: { type: 'alert', source: 'nws', externalId: 'a', payload: {} } },
			{ op: 'createEntity', input: { type: 'recipe', payload: { name: 'Dal' } } },
		])
		const day = 24 * 60 * 60 * 1000
		clock.now += 6 * day
		expect(engine.queryEntities({ type: 'alert' })).toHaveLength(1)
		clock.now += 2 * day
		expect(engine.queryEntities({ type: 'alert', includeDeleted: true })).toEqual([])
		// what is not a mirror is the owner's, however old
		expect(engine.queryEntities({ type: 'recipe' })).toHaveLength(1)
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

	it('attaches a file given as bytes, and keeps the bytes for the session only', () => {
		const { engine, storage, clock } = setup()
		const bytes = new Uint8Array([1, 2, 3])
		const thread = `eden://thread/${newId()}`
		const row = engine.attachBytes(
			{
				kind: 'photo',
				fileName: 'basket.png',
				mime: 'image/png',
				thumbnail: 'data:image/jpeg;base64,AAAA',
				captured: { width: 4, height: 3 },
				links: [{ uri: thread, relation: 'part-of' }],
			},
			bytes,
			'abc'
		)
		expect(row).toMatchObject({
			type: 'attachment',
			kind: 'photo',
			fileName: 'basket.png',
			mime: 'image/png',
			size: 3,
			hash: 'abc',
			store: 'workspace',
			thumbnail: 'data:image/jpeg;base64,AAAA',
		})
		expect(engine.query('attachment', { linkedTo: thread, relation: 'part-of' }).map((entry) => entry.id)).toEqual([
			row.id,
		])
		// a copy: what the caller does to its bytes afterwards changes nothing here
		bytes[0] = 9
		expect(engine.readAttachment(row.id)).toEqual(new Uint8Array([1, 2, 3]))

		expect(codeOf(() => engine.attachBytes({ kind: 'photo', fileName: 'a.png' }, new Uint8Array(), 'h'))).toBe(
			'invalid'
		)
		expect(codeOf(() => engine.attachBytes({ kind: 'spaceship' as 'photo', fileName: 'a.png' }, bytes, 'h'))).toBe(
			'invalid'
		)
		expect(codeOf(() => engine.readAttachment(newId()))).toBe('not-found')

		// the next load has the row and not the bytes
		const again = createEngine(storage, { now: () => clock.now })
		expect(again.query('attachment', {}).map((entry) => entry.id)).toEqual([row.id])
		expect(again.readAttachment(row.id)).toBeNull()
		engine.deleteRows([row.uri])
		expect(codeOf(() => engine.readAttachment(row.id))).toBe('not-found')
	})

	it('deletes a thread’s attachments with it and restores them with it', () => {
		const { engine } = setup()
		const thread = engine.createThread({ domain: null, title: 'Dinner', tier: 'T0' })
		const file = (name: string) =>
			engine.attachBytes(
				{ kind: 'photo', fileName: name, links: [{ uri: thread.uri, relation: 'part-of' }] },
				new Uint8Array([1]),
				'h'
			)
		const kept = file('a.png')
		const gone = file('b.png')
		engine.deleteRows([gone.uri])
		const live = () => engine.query('attachment', {}).map((row) => row.id)

		engine.deleteThread(thread.id)
		expect(live()).toEqual([])
		engine.restoreThread(thread.id)
		// the one deleted before the thread stays gone
		expect(live()).toEqual([kept.id])
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

	it('keeps threads and messages with tombstones, and takes the messages with the thread', () => {
		const { engine, clock } = setup()
		const thread = engine.createThread({ title: 'Dinner', domain: 'kitchen' })
		expect(thread.uri).toBe(`eden://thread/${thread.id}`)
		expect(thread).toMatchObject({ domain: 'kitchen', tier: 'T0', deletedAt: null, createdAt: thread.updatedAt })

		clock.now += 1000
		const asked = engine.appendMessage({ threadId: thread.id, role: 'owner', blocks: [{ kind: 'text', text: 'Hi' }] })
		const answered = engine.appendMessage({ threadId: thread.id, role: 'gardener', blocks: [], requestId: newId() })
		expect(asked.uri).toBe(`eden://message/${asked.id}`)
		expect(engine.queryMessages(thread.id)).toEqual([asked, answered])
		// The thread is touched by a message and is the latest updated.
		expect(engine.queryThreads()[0]?.updatedAt).toBe(answered.createdAt)

		clock.now += 1000
		const retitled = engine.updateThread(thread.id, { title: 'Dinner plans', tier: 'T2', domain: null })
		expect(retitled).toMatchObject({ title: 'Dinner plans', tier: 'T2', domain: null })
		expect(retitled.updatedAt > thread.updatedAt).toBe(true)
		const edited = engine.updateMessage(answered.id, [{ kind: 'text', text: 'Dal.' }])
		expect(edited.blocks).toEqual([{ kind: 'text', text: 'Dal.' }])
		expect(edited.updatedAt > answered.updatedAt).toBe(true)

		clock.now += 1000
		const deleted = engine.deleteThread(thread.id)
		expect(deleted.deletedAt).toBe(deleted.updatedAt)
		expect(engine.queryThreads()).toEqual([])
		expect(engine.queryThreads({ includeDeleted: true })).toEqual([deleted])
		expect(engine.queryMessages(thread.id)).toEqual([])
		expect(engine.deleteThread(thread.id)).toEqual(deleted)
		expect(codeOf(() => engine.appendMessage({ threadId: thread.id, role: 'owner', blocks: [] }))).toBe(
			'thread:invalid'
		)
		expect(codeOf(() => engine.appendMessage({ threadId: newId(), role: 'owner', blocks: [] }))).toBe('thread:invalid')

		clock.now += 1000
		const restored = engine.restoreThread(thread.id)
		expect(restored.deletedAt).toBeNull()
		expect(engine.queryMessages(thread.id).map((row) => row.id)).toEqual([asked.id, answered.id])
		expect(engine.queryMessages(thread.id).every((row) => row.updatedAt === restored.updatedAt)).toBe(true)
		expect(engine.queryThreads({ domain: 'kitchen' })).toEqual([])
		expect(engine.restoreThread(thread.id)).toEqual(restored)

		expect(codeOf(() => engine.createThread({ title: ' ' }))).toBe('thread:invalid')
		expect(codeOf(() => engine.createThread({ title: 'x', tier: 'T3' as 'T2' }))).toBe('thread:invalid')
		expect(codeOf(() => engine.updateThread(newId(), { title: 'x' }))).toBe('not-found')
		expect(codeOf(() => engine.updateMessage(newId(), []))).toBe('not-found')

		clock.now += 1000
		const gone = engine.deleteMessage(answered.id)
		expect(gone.deletedAt).toBe(gone.updatedAt)
		expect(engine.queryMessages(thread.id).map((row) => row.id)).toEqual([asked.id])
		expect(engine.deleteMessage(answered.id)).toEqual(gone)
		expect(codeOf(() => engine.deleteMessage(newId()))).toBe('not-found')
		expect(codeOf(() => engine.appendMessage({ threadId: thread.id, role: 'bot' as 'owner', blocks: [] }))).toBe(
			'thread:invalid'
		)
	})

	it('renews a policy row in place and refuses a key that is not kebab-case', () => {
		const { engine, clock } = setup()
		expect(engine.getPolicy('gardener')).toBeNull()
		const first = engine.setPolicy('gardener', { monthlyCapUsd: 10 })
		expect(first).toMatchObject({ key: 'gardener', value: { monthlyCapUsd: 10 }, deletedAt: null })
		clock.now += 1000
		const second = engine.setPolicy('gardener', { monthlyCapUsd: 25 })
		expect(second.createdAt).toBe(first.createdAt)
		expect(second.updatedAt > first.updatedAt).toBe(true)
		expect(second.value).toEqual({ monthlyCapUsd: 25 })
		expect(engine.getPolicy('gardener')).toEqual(second)
		expect(codeOf(() => engine.setPolicy('Gardener', {}))).toBe('policy:invalid')
		expect(codeOf(() => engine.setPolicy('gardener.v2', {}))).toBe('policy:invalid')
	})

	it('keeps the audit log for ninety days, counts the rows read and sums the spend', () => {
		const { engine, clock } = setup()
		const rice = newId()
		const dal = newId()
		const entry = (at: number, rows: string[], costUsd: number) =>
			engine.recordAudit({
				at,
				surface: 'panel',
				threadId: null,
				parentRequestId: null,
				tool: null,
				domain: null,
				declaredGrade: 'standard',
				grade: 'standard',
				source: 'map',
				provider: 'anthropic',
				model: 'claude-sonnet-5-5',
				reads: [
					{ id: 'stock-item', count: rows.length, rows },
					{ id: 'recipe', count: rows.length, rows },
				],
				entities: [],
				tools: [],
				confirmOutcome: null,
				tokensIn: 100,
				tokensOut: 10,
				cacheRead: 0,
				costUsd,
				outcome: 'ok',
				grants: [],
				image: null,
			})
		const old = entry(clock.now - 91 * 24 * 60 * 60 * 1000, [rice], 0.5)
		const a = entry(clock.now - 1000, [rice, dal], 0.25)
		const b = entry(clock.now, [rice], 0.125)
		expect(old.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
		expect(engine.queryAudit()).toEqual([b, a])
		expect(engine.queryAudit({ fromMs: clock.now })).toEqual([b])
		expect(engine.queryAudit({ toMs: clock.now - 1000, limit: 1 })).toEqual([a])
		// A row read twice in one entry counts once for it.
		expect(engine.auditUsage()).toEqual({ [rice]: 2, [dal]: 1 })
		expect(engine.auditSpend(clock.now - 1000)).toBe(0.375)
		expect(engine.auditSpend(clock.now + 1)).toBe(0)
		expect(codeOf(() => entry(-1, [], 0))).toBe('audit:invalid')
		expect(codeOf(() => engine.recordAudit({ ...a, outcome: 'lost' as 'ok' }))).toBe('audit:invalid')
		// Ninety days on, the rest are swept when the workspace opens.
		clock.now += 90 * 24 * 60 * 60 * 1000 + 1
		expect(engine.queryAudit()).toEqual([])
		expect(engine.auditUsage()).toEqual({})
		// The rollup of what they came to is never swept (D-115).
		expect(engine.queryUsage()).toEqual([
			{
				bucket: null,
				provider: null,
				model: null,
				grade: null,
				kind: null,
				domain: null,
				tool: null,
				requests: 3,
				tokensIn: 300,
				tokensOut: 30,
				cacheRead: 0,
				cacheWrite: 0,
				costUsd: 0.875,
			},
		])
	})

	it('pages the audit log and rolls each entry into its day', () => {
		const { engine, clock } = setup()
		const thread = newId()
		const base = {
			surface: 'global-chat',
			threadId: thread,
			parentRequestId: null,
			tool: null,
			domain: null,
			declaredGrade: 'light' as const,
			grade: 'light' as const,
			source: 'map' as const,
			provider: 'anthropic',
			model: 'claude-haiku-4-5-20251001',
			reads: [],
			entities: [],
			tools: [],
			confirmOutcome: null,
			tokensIn: 100,
			tokensOut: 10,
			cacheRead: 0,
			outcome: 'ok' as const,
			grants: [],
			image: null,
		}
		const chat = engine.recordAudit({ ...base, at: clock.now, costUsd: 0.5, cacheWrite: 40, day: '2026-09-30' })
		const tool = engine.recordAudit({
			...base,
			at: clock.now + 1,
			surface: 'delegated',
			parentRequestId: chat.id,
			tool: 'plan',
			domain: 'kitchen',
			grade: 'deep',
			model: 'claude-opus-5-5',
			costUsd: 2,
			day: '2026-10-01',
		})
		const stopped = engine.recordAudit({ ...base, at: clock.now + 2, costUsd: 0, outcome: 'budget', day: '2026-10-01' })
		expect(chat.cacheWrite).toBe(40)
		expect(tool.cacheWrite).toBe(0)
		expect(chat).not.toHaveProperty('day')

		expect(engine.queryAuditPage()).toEqual({ rows: [stopped, tool, chat], total: 3 })
		expect(engine.queryAuditPage({ order: 'cost', limit: 1, offset: 1 })).toEqual({ rows: [chat], total: 3 })
		expect(engine.queryAuditPage({ kinds: ['tool'], tools: ['kitchen.plan'] }).rows).toEqual([tool])
		expect(engine.auditFacets()).toEqual({
			models: ['claude-haiku-4-5-20251001', 'claude-opus-5-5'],
			tools: ['kitchen.plan'],
		})
		// the request the budget stopped never left: it is in the log, and in no sum
		expect(engine.auditThreadTotals()).toEqual([
			{ threadId: thread, requests: 2, tokensIn: 200, tokensOut: 20, costUsd: 2.5, lastAt: clock.now + 1 },
		])
		expect(
			engine.queryUsage({ groupBy: ['day', 'kind'] }).map((row) => [row.bucket, row.kind, row.requests, row.costUsd])
		).toEqual([
			['2026-09-30', 'conversation', 1, 0.5],
			['2026-10-01', 'tool', 1, 2],
		])
		expect(engine.queryUsage({ fromDay: '2026-10-01' })[0]).toMatchObject({ requests: 1, cacheWrite: 0, costUsd: 2 })
		expect(codeOf(() => engine.queryUsage({ fromDay: 'today' }))).toBe('usage:invalid')
		expect(codeOf(() => engine.recordAudit({ ...base, at: 1, costUsd: 0, day: '2026-13-01' }))).toBe('audit:invalid')
	})
})
