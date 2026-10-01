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
		domains: [
			{ id: 'kitchen', name: 'Hearth' },
			{ id: 'weather', name: 'Sky' },
		],
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

	it('scrubs the message and the thread as it scrubs the rows', async () => {
		const pack = await buildPack(
			request({
				thread: [message(15, 'owner', 'Mail the list to a@b.io'), message(17, 'gardener', 'I cannot send mail.')],
				message: 'Then text it to 512-555-0134',
			}),
			readers()
		)
		expect(pack.messages[0]).toEqual({ role: 'user', content: 'Mail the list to [email]' })
		expect(pack.messages.at(-1)).toMatchObject({
			content: [{ type: 'text' }, { type: 'text', text: 'Then text it to [phone]' }],
		})
		const bare = await buildPack(request({ reads: ['grocery-list'], message: 'Text 512-555-0134' }), readers())
		expect(bare.messages.at(-1)).toEqual({ role: 'user', content: 'Text [phone]' })
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
		expect(pack.system[0]!.text).toContain('which they opened from Hearth')
		expect(pack.system[0]!.text).toContain('- Hearth (kitchen): food at home')
		expect(pack.system[0]!.text).toContain('- Sky (weather): the weather')
		expect(pack.system[0]!.text).toContain('Every tool call appears in the thread as a card')
		expect(pack.system[0]!.text).not.toContain('kitchen_suggest-recipes')
		expect(pack.system[1]!.text).toContain('Now: Wednesday 2026-09-30, 04:40 (America/Chicago).')
		expect(pack.system[1]!.text).toContain('You can see: dietary-preference (3), allergy (1), recipe (3)')
		expect(pack.system[1]!.text).toContain('Locked: medical-dietary-restriction.')
		const context = contextOf(pack)
		expect(context.startsWith('<context>\n## dietary-preference (3 rows)\n')).toBe(true)
		expect(context.endsWith('\n</context>')).toBe(true)
		expect(pack.tools).toHaveLength(index.length)
		expect((pack.tools[0] as { name: string }).name).toBe('kitchen_suggest-recipes')
		// A read with no rows is still on the chip, at zero.
		const empty = await buildPack(request({ reads: ['grocery-list'] }), readers())
		expect(empty.canSee).toEqual([{ id: 'grocery-list', count: 0 }])
		expect(empty.messages.at(-1)).toEqual({ role: 'user', content: 'And tomorrow?' })
	})

	it('replays a reply as it happened: its words, the tools it called and what each answered', async () => {
		const reply = (n: number, blocks: unknown[]): Message => ({ ...message(n, 'gardener', ''), blocks })
		const call = (callId: string, name: string, input: unknown, output?: unknown) => ({
			id: callId,
			name,
			domain: 'substrate',
			tool: name,
			access: 'read',
			input,
			...(output === undefined ? {} : { output }),
		})
		const long = { days: 'x'.repeat(3_000) }
		const thread = [
			message(15, 'owner', 'Remind me to call a@b.io on Friday'),
			reply(16, [
				{ kind: 'can-see', items: [], locked: [], trimmed: [], rows: {} },
				{ kind: 'text', text: 'Drafting it.' },
				{
					kind: 'tool',
					state: 'done',
					call: call('toolu_1', 'create-task', { title: 'Call a@b.io' }, { status: 'drafted' }),
				},
				{ kind: 'draft', draft: { kind: 'task', title: 'Call' }, state: 'committed', callId: 'toolu_1' },
				{ kind: 'tool', state: 'done', call: call('toolu_2', 'weather_forecast', {}, long) },
				{ kind: 'text', text: 'It is drafted.' },
			]),
			message(17, 'owner', 'And the weather?'),
			reply(18, [
				{ kind: 'tool', state: 'done', call: call('toolu_3', 'weather_forecast', {}, long) },
				{
					kind: 'tool',
					state: 'cancelled',
					call: call('toolu_4', 'complete-task', { taskId: 'x' }, { error: 'no', cancelled: true }),
				},
				{ kind: 'tool', state: 'running', call: call('toolu_5', 'summarize-day', {}) },
			]),
		]
		const pack = await buildPack(request({ thread, message: 'Thanks' }), readers())
		expect(pack.messages.slice(0, -1)).toEqual([
			{ role: 'user', content: 'Remind me to call [email] on Friday' },
			{
				role: 'assistant',
				content: [
					{ type: 'text', text: 'Drafting it.' },
					{ type: 'tool_use', id: 'toolu_1', name: 'create-task', input: { title: 'Call [email]' } },
					{ type: 'tool_use', id: 'toolu_2', name: 'weather_forecast', input: {} },
				],
			},
			{
				role: 'user',
				content: [
					{
						type: 'tool_result',
						tool_use_id: 'toolu_1',
						content: JSON.stringify({ status: 'drafted', card: 'kept by the owner' }),
						is_error: false,
					},
					// an earlier reply's long result is left out, and says to call again
					{
						type: 'tool_result',
						tool_use_id: 'toolu_2',
						content: expect.stringContaining('Call the tool again'),
						is_error: false,
					},
				],
			},
			{ role: 'assistant', content: 'It is drafted.' },
			{ role: 'user', content: 'And the weather?' },
			{
				role: 'assistant',
				content: [
					{ type: 'tool_use', id: 'toolu_3', name: 'weather_forecast', input: {} },
					{ type: 'tool_use', id: 'toolu_4', name: 'complete-task', input: { taskId: 'x' } },
					{ type: 'tool_use', id: 'toolu_5', name: 'summarize-day', input: {} },
				],
			},
			{
				role: 'user',
				content: [
					// the last reply keeps its results whole
					{ type: 'tool_result', tool_use_id: 'toolu_3', content: JSON.stringify(long), is_error: false },
					{
						type: 'tool_result',
						tool_use_id: 'toolu_4',
						content: JSON.stringify({ error: 'no', cancelled: true }),
						is_error: true,
					},
					// a call the app closed on never answered
					{
						type: 'tool_result',
						tool_use_id: 'toolu_5',
						content: expect.stringContaining('interrupted'),
						is_error: true,
					},
				],
			},
		])
	})

	it('trims the thread an exchange at a time, and opens on the owner', async () => {
		const reply: Message = {
			...message(16, 'gardener', ''),
			blocks: [
				{
					kind: 'tool',
					state: 'done',
					call: {
						id: 'toolu_1',
						name: 'toolbench_brainstorm',
						domain: 'toolbench',
						tool: 'brainstorm',
						access: 'read',
						input: {},
						output: { reply: 'Start small.' },
					},
				},
				{ kind: 'text', text: 'Start small.' },
			],
		}
		// a thread that opens on a reply (a tool run from a button) is given the owner's turn it lacks
		const opened = await buildPack(request({ thread: [reply], message: 'Go on' }), readers())
		expect(opened.messages[0]).toMatchObject({ role: 'user', content: expect.stringContaining('from a button') })
		expect(opened.messages[1]).toMatchObject({ role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_1' }] })
		expect(opened.messages[2]).toMatchObject({
			role: 'user',
			content: [{ type: 'tool_result', tool_use_id: 'toolu_1' }],
		})
		expect(opened.messages[3]).toEqual({ role: 'assistant', content: 'Start small.' })
		// a call and its answer leave together
		const bare = await buildPack(
			request({ thread: [reply], message: 'Go on', tokenCap: 1, outputReserve: 0 }),
			readers()
		)
		expect(bare.messages).toHaveLength(1)
		expect(bare.trimmed).toContain('thread')
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
		expect(bare.system[1]!.text).toContain('Trimmed: recipe, stock-item, local-event, task, thread.')
		expect(bare.estimatedInputTokens).toBeGreaterThan(1)
	})
})
