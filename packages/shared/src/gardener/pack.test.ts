import { describe, expect, it } from 'vitest'
import { dataErrorCode } from '../data/errors.js'
import type { GrantCheck } from '../grants/types.js'
import { declarations } from '../manifest/index.js'
import type { Fact } from '../profile/types.js'
import { buildPack, WINDOW, type Pack, type PackReaders, type PackRequest, type PackRow } from './pack.js'
import { ANTHROPIC_SEED } from './providers.js'
import type { Message } from './runtime-types.js'
import { toolIndex, toolsFor } from './tools.js'

const ULID = '01J9ZQ4M3T8R5V2X7Y6W1B0CD'
const id = (n: number) => `${ULID}${'0123456789ABCDEFGHJKMNPQRS'[n]}`
const stamp = (n: number) => `${n.toString(16).padStart(16, '0')}-00000000-000000ab`
const NOW = Date.UTC(2026, 8, 30, 9, 40)
const DAY = 24 * 60 * 60 * 1000

const fact = (n: number, type: string, provenance: Fact['provenance'], value: unknown): Fact => ({
	uri: `eden://fact/${id(n)}`,
	id: id(n),
	type: type as Fact['type'],
	value,
	provenance,
	confidence: provenance === 'user-asserted' ? null : 0.7,
	validFrom: null,
	validUntil: null,
	source: null,
	note: null,
	createdAt: stamp(n),
	updatedAt: stamp(n),
	deletedAt: null,
})

const row = (n: number, type: string, fields: Record<string, unknown>): PackRow & Record<string, unknown> => ({
	uri: `eden://${type}/${id(n)}`,
	id: id(n),
	type,
	createdAt: stamp(n),
	updatedAt: stamp(n),
	deletedAt: null,
	mirror: false,
	source: null,
	externalId: null,
	snapshot: null,
	links: [],
	...fields,
})

const message = (n: number, role: Message['role'], text: string | null): Message => ({
	uri: `eden://message/${id(n)}`,
	id: id(n),
	threadId: id(20),
	role,
	blocks: text === null ? [{ kind: 'tool', state: 'done' }] : [{ kind: 'text', text }],
	requestId: null,
	createdAt: stamp(n),
	updatedAt: stamp(n),
	deletedAt: null,
})

const FACTS: Fact[] = [
	fact(1, 'dietary-preference', 'domain-derived', 'vegetarian'),
	fact(2, 'dietary-preference', 'user-asserted', 'pescatarian'),
	fact(3, 'allergy', 'user-asserted', { substance: 'tree nuts', contact: 'a@b.io' }),
	fact(4, 'dietary-preference', 'domain-derived', 'no pork'),
]
const RECIPES = [
	row(5, 'recipe', { payload: { name: 'Dal' } }),
	row(6, 'recipe', { payload: { name: 'Miso salmon' } }),
	row(7, 'recipe', { payload: { name: 'Curry from the shop', phone: '512-555-0134' }, mirror: true, source: 'web' }),
]
const STOCK = [
	row(8, 'stock-item', { payload: { name: 'rice' } }),
	row(9, 'stock-item', { payload: { name: 'leeks' } }),
]
const EVENTS = [row(10, 'event', { kind: 'local-event', title: 'Market', startAt: '2026-10-02' })]
const TASKS = [
	row(11, 'task', { kind: 'todo', title: 'Restock rice', due: '2026-10-01' }),
	row(12, 'task', { kind: 'routine', title: 'Water the plants', due: null }),
]
const PLACES = [
	row(13, 'place', { kind: 'venue', name: 'Market' }),
	row(14, 'place', { kind: 'home', name: 'Home', address: '1 Main St' }),
]

interface Fake extends PackReaders {
	calls: unknown[]
}

function readers(grantedIds: string[] = ['allergy']): Fake {
	const calls: unknown[] = []
	return {
		calls,
		async facts(types) {
			calls.push(['facts', types])
			return FACTS.filter((entry) => types.includes(entry.type))
		},
		async entities(type) {
			calls.push(['entities', type])
			return type === 'recipe' ? RECIPES : type === 'stock-item' ? STOCK : []
		},
		async primitives(primitive, query) {
			calls.push(['primitives', primitive, query])
			return primitive === 'task' ? TASKS : primitive === 'event' ? EVENTS : PLACES
		},
		async check(check: GrantCheck) {
			calls.push(['check', check])
			return grantedIds.includes(check.resource)
				? { allowed: true, reason: 'grant', grantId: `grant-${check.resource}` }
				: { allowed: false, reason: 'no-grant' }
		},
	}
}

const index = toolIndex(declarations)

function request(over: Partial<PackRequest> = {}): PackRequest {
	return {
		reads: [
			'dietary-preference',
			'allergy',
			'medical-dietary-restriction',
			'recipe',
			'stock-item',
			'local-event',
			'task',
		],
		thread: [message(15, 'owner', 'What can I cook?'), message(16, 'gardener', null), message(17, 'gardener', 'Dal.')],
		message: 'And tomorrow?',
		tools: toolsFor(index, 'kitchen'),
		model: ANTHROPIC_SEED.models[1]!,
		outputReserve: 1_000,
		tokenCap: null,
		subject: 'anthropic',
		now: NOW,
		zone: 'America/Chicago',
		lang: 'en',
		domainName: 'Hearth',
		grade: 'standard',
		...over,
	}
}

/** The context block of the last message, or nothing. */
function contextOf(pack: Pack): string {
	const last = pack.messages.at(-1) as { content: string | { text: string }[] }
	return typeof last.content === 'string' ? '' : last.content[0]!.text
}

describe('buildPack', () => {
	it('gates the reads: T2 under a grant or locked, T3 never', async () => {
		const fake = readers()
		const pack = await buildPack(request(), fake)
		expect(pack.locked).toEqual(['medical-dietary-restriction'])
		expect(pack.grants).toEqual(['grant-allergy'])
		expect(pack.canSee.map((item) => item.id)).not.toContain('medical-dietary-restriction')
		expect(fake.calls.filter((call) => (call as string[])[0] === 'check')).toEqual([
			['check', { subject: 'anthropic', resource: 'allergy', resourceType: 'registry', access: 'read' }],
			[
				'check',
				{ subject: 'anthropic', resource: 'medical-dietary-restriction', resourceType: 'registry', access: 'read' },
			],
		])
		expect(pack.tier).toBe('T2')
		expect((await buildPack(request({ reads: ['recipe'] }), readers())).tier).toBe('T0')

		const never = await buildPack(request({ reads: ['identity-document'] }), readers()).catch((error) =>
			dataErrorCode(error)
		)
		expect(never).toBe('gardener:never')
		const unknown = await buildPack(request({ reads: ['secret-sauce'] }), readers()).catch((error) =>
			dataErrorCode(error)
		)
		expect(unknown).toBe('gardener:invalid')
	})

	it('orders the sections as declared, facts by the owner’s word then newest, entities newest first', async () => {
		const pack = await buildPack(request(), readers())
		expect(pack.reads).toEqual([
			{ id: 'dietary-preference', count: 3, rows: [id(2), id(4), id(1)] },
			{ id: 'allergy', count: 1, rows: [id(3)] },
			{ id: 'recipe', count: 3, rows: [id(7), id(6), id(5)] },
			{ id: 'stock-item', count: 2, rows: [id(9), id(8)] },
			{ id: 'local-event', count: 1, rows: [id(10)] },
			{ id: 'task', count: 2, rows: [id(12), id(11)] },
		])
		expect(pack.canSee).toEqual(pack.reads.map(({ id, count }) => ({ id, count })))
		expect(pack.entities).toEqual(
			[7, 6, 5, 9, 8, 10, 12, 11].map(
				(n) => `eden://${RECIPES.concat(STOCK, EVENTS, TASKS).find((r) => r.id === id(n))!.type}/${id(n)}`
			)
		)
		const context = contextOf(pack)
		expect(context.indexOf('## dietary-preference (3 rows)')).toBeLessThan(context.indexOf('## allergy (1 rows)'))
		expect(context.indexOf('## recipe (3 rows)')).toBeLessThan(context.indexOf('## task (2 rows)'))
	})

	it('reads primitives in the window, and tasks without one', async () => {
		const fake = readers()
		await buildPack(request({ reads: ['local-event', 'task', 'event', 'place'] }), fake)
		const from = new Date(NOW - WINDOW.back * DAY).toISOString()
		const to = new Date(NOW + WINDOW.ahead * DAY).toISOString()
		expect(fake.calls.filter((call) => (call as string[])[0] === 'primitives')).toEqual([
			['primitives', 'event', { kinds: ['local-event'], from, to }],
			['primitives', 'task', {}],
			['primitives', 'event', { from, to }],
			['primitives', 'place', { from, to }],
		])
	})

	it('holds a by-kind primitive to its rows’ kinds: a T2 kind needs a grant', async () => {
		const locked = await buildPack(request({ reads: ['place'] }), readers([]))
		expect(locked.reads).toEqual([{ id: 'place', count: 1, rows: [id(13)] }])
		expect(locked.tier).toBe('T1')
		const granted = await buildPack(request({ reads: ['place'] }), readers(['home']))
		expect(granted.reads).toEqual([{ id: 'place', count: 2, rows: [id(14), id(13)] }])
		expect(granted.grants).toEqual(['grant-home'])
		expect(granted.tier).toBe('T2')
	})

	it('scrubs every string and wraps a mirror as untrusted', async () => {
		const context = contextOf(await buildPack(request(), readers()))
		expect(context).not.toContain('a@b.io')
		expect(context).toContain('[email]')
		expect(context).not.toContain('512-555-0134')
		expect(context).toContain('<untrusted source="web">{"id":"' + id(7))
		expect(context).toContain('[phone]"}}</untrusted>')
		expect(context).not.toContain('"uri"')
		expect(context).not.toContain('"links"')
	})

	it('turns the thread into user and assistant turns and puts the context before the message', async () => {
		const pack = await buildPack(request(), readers())
		expect(pack.messages).toHaveLength(3)
		expect(pack.messages[0]).toEqual({ role: 'user', content: 'What can I cook?' })
		expect(pack.messages[1]).toEqual({ role: 'assistant', content: 'Dal.' })
		expect(pack.messages[2]).toMatchObject({
			role: 'user',
			content: [{ type: 'text' }, { type: 'text', text: 'And tomorrow?' }],
		})
		expect(pack.system[0]).toMatchObject({ type: 'text', cache_control: { type: 'ephemeral' } })
		expect(pack.system[0]!.text).toContain('I am open inside Hearth.')
		expect(pack.system[1]!.text).toContain('I can see: dietary-preference (3), allergy (1), recipe (3)')
		expect(pack.system[1]!.text).toContain('Locked without a grant: medical-dietary-restriction.')
		expect(pack.tools).toHaveLength(index.length)
		expect((pack.tools[0] as { name: string }).name).toBe('kitchen_suggest-recipes')
		// A read with no rows is still on the chip, at zero.
		const empty = await buildPack(request({ reads: ['grocery-list'] }), readers())
		expect(empty.canSee).toEqual([{ id: 'grocery-list', count: 0 }])
		expect(empty.messages.at(-1)).toEqual({ role: 'user', content: 'And tomorrow?' })
	})

	it('estimates the input as a quarter of its characters', async () => {
		const pack = await buildPack(request(), readers())
		const tokens = (text: string) => Math.ceil(text.length / 4)
		const turns = pack.messages.slice(0, -1) as { content: string }[]
		expect(pack.estimatedInputTokens).toBe(
			tokens(pack.system[0]!.text) +
				tokens(pack.system[1]!.text) +
				tokens(contextOf(pack)) +
				turns.reduce((sum, turn) => sum + tokens(turn.content), 0) +
				tokens('And tomorrow?')
		)
	})

	it('trims the oldest entity rows first, round-robin, never a pinned row or a fact, then the thread', async () => {
		const full = await buildPack(request(), readers())
		const focus = [`eden://recipe/${id(5)}`]
		const one = await buildPack(
			request({ focus, tokenCap: full.estimatedInputTokens - 1, outputReserve: 0 }),
			readers()
		)
		expect(one.trimmed).toEqual(['recipe'])
		expect(one.reads.find((read) => read.id === 'recipe')).toEqual({ id: 'recipe', count: 2, rows: [id(5), id(7)] })
		expect(one.estimatedInputTokens).toBeLessThan(full.estimatedInputTokens)

		const two = await buildPack(request({ focus, tokenCap: one.estimatedInputTokens - 1, outputReserve: 0 }), readers())
		expect(two.trimmed).toEqual(['recipe', 'stock-item'])
		expect(two.reads.find((read) => read.id === 'stock-item')?.rows).toEqual([id(9)])

		const bare = await buildPack(request({ focus, tokenCap: 1, outputReserve: 0 }), readers())
		expect(bare.trimmed).toEqual(['recipe', 'stock-item', 'local-event', 'task', 'thread'])
		expect(bare.reads).toEqual([
			{ id: 'dietary-preference', count: 3, rows: [id(2), id(4), id(1)] },
			{ id: 'allergy', count: 1, rows: [id(3)] },
			{ id: 'recipe', count: 1, rows: [id(5)] },
			{ id: 'stock-item', count: 0, rows: [] },
			{ id: 'local-event', count: 0, rows: [] },
			{ id: 'task', count: 0, rows: [] },
		])
		expect(bare.canSee).toContainEqual({ id: 'task', count: 0 })
		expect(bare.messages).toHaveLength(1)
		expect(bare.system[1]!.text).toContain('Trimmed to fit: recipe, stock-item, local-event, task, thread.')
		expect(bare.estimatedInputTokens).toBeGreaterThan(1)
	})
})
