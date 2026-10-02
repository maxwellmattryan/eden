import { describe, expect, it } from 'vitest'
import { dataErrorCode } from '../data/errors.js'
import type { GrantCheck } from '../grants/types.js'
import { declarations } from '../manifest/index.js'
import type { Fact } from '../profile/types.js'
import {
	buildPack,
	READ_ROWS_CHARS,
	readRows,
	WINDOW,
	type Pack,
	type PackReaders,
	type PackRequest,
	type PackRow,
} from './pack.js'
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
		tools: toolsFor(index),
		model: ANTHROPIC_SEED.models[1]!,
		outputReserve: 1_000,
		tokenCap: null,
		subject: 'anthropic',
		now: NOW,
		zone: 'America/Chicago',
		lang: 'en',
		domain: 'kitchen',
		domainName: 'Hearth',
		domains: [
			{ id: 'kitchen', name: 'Hearth' },
			{ id: 'weather', name: 'Sky' },
		],
		grade: 'standard',
		...over,
	}
}

/** What the last message opens with: the clock, the context block and, in a conversation, the index. */
function contextOf(pack: Pack): string {
	const last = pack.messages.at(-1) as { content: { text: string }[] }
	return last.content[0]!.text
}

/** A tool's own request: every row it declared goes up front, as a conversation's did before D-148. */
const whole = (over: Partial<PackRequest> = {}) => request({ mode: 'delegated', tools: [], ...over })
/** The breakpoint on the settled history's last block (D-147). */
const MARK = { cache_control: { type: 'ephemeral' } }
const HEAD = { type: 'text', text: expect.stringContaining('Now: ') }

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
		const pack = await buildPack(whole(), readers())
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

	it('carries a conversation the tasks trimmed, and a delegated request all of them', async () => {
		const tasks = [
			...TASKS,
			row(21, 'task', {
				kind: 'todo',
				title: 'Clean the gutters',
				due: '2026-08-01',
				done: true,
				completedAt: '2026-08-02T15:00:00.000Z',
			}),
			row(22, 'task', {
				kind: 'todo',
				title: 'Post the letter',
				due: '2026-09-29',
				done: true,
				completedAt: '2026-09-29T15:00:00.000Z',
			}),
		]
		const fake: PackReaders = { ...readers(), primitives: async (primitive) => (primitive === 'task' ? tasks : []) }
		// a conversation counts what `read-rows` would answer: what is open, and what was done lately
		const chat = contextOf(await buildPack(request({ reads: ['task'] }), fake))
		expect(chat).toContain('- task (substrate): 3 rows')
		expect(chat).not.toContain('Restock rice')
		const read = await readRows({ type: 'task', reach: ['task'], subject: 'anthropic', now: NOW, zone: 'UTC' }, fake)
		expect(read.text).toContain('Restock rice')
		expect(read.text).toContain('Post the letter')
		expect(read.text).not.toContain('Clean the gutters')
		// a tool's own request works from the tasks it declared, every one
		const delegated = contextOf(await buildPack(whole({ reads: ['task'] }), fake))
		expect(delegated).toContain('Clean the gutters')
		// and what the conversation is about is never left out: it is sent whole, ahead of the index
		const about = await buildPack(request({ reads: ['task'], focus: [tasks[2]!.uri] }), fake)
		expect(contextOf(about)).toContain('"title":"Clean the gutters"')
		expect(about.reads).toEqual([{ id: 'task', count: 1, rows: [tasks[2]!.id] }])
		expect(about.entities).toEqual([tasks[2]!.uri])
	})

	it('holds a by-kind primitive to its rows’ kinds: a T2 kind needs a grant', async () => {
		const locked = await buildPack(whole({ reads: ['place'] }), readers([]))
		expect(locked.reads).toEqual([{ id: 'place', count: 1, rows: [id(13)] }])
		expect(locked.tier).toBe('T1')
		const granted = await buildPack(whole({ reads: ['place'] }), readers(['home']))
		expect(granted.reads).toEqual([{ id: 'place', count: 2, rows: [id(14), id(13)] }])
		expect(granted.grants).toEqual(['grant-home'])
		expect(granted.tier).toBe('T2')
	})

	it('scrubs every string and wraps a mirror as untrusted', async () => {
		const context = contextOf(await buildPack(whole(), readers()))
		expect(context).not.toContain('a@b.io')
		expect(context).toContain('[email]')
		expect(context).not.toContain('512-555-0134')
		// three recipes are a table, and the mirrored one is wrapped on its own line
		expect(context).toContain(
			`## recipe (3 rows)\nid|name|phone\n<untrusted source="web">${id(7)}|Curry from the shop|[phone]</untrusted>\n${id(6)}|Miso salmon|\n`
		)
		// two stock items are an object a line, the payload's fields beside the id
		expect(context).toContain(`{"id":"${id(9)}","type":"stock-item","name":"leeks"}`)
		expect(context).not.toContain('uri')
		expect(context).not.toContain('links')
		expect(context).not.toContain('updatedAt')
	})

	it('scrubs the message and the thread as it scrubs the rows', async () => {
		const pack = await buildPack(
			request({
				thread: [message(15, 'owner', 'Mail the list to a@b.io'), message(17, 'gardener', 'I cannot send mail.')],
				message: 'Then text it to 512-555-0134',
			}),
			readers()
		)
		expect(pack.messages[0]).toEqual({
			role: 'user',
			content: [{ type: 'text', text: 'Mail the list to [email]', ...MARK }],
		})
		expect(pack.messages.at(-1)).toMatchObject({
			content: [{ type: 'text' }, { type: 'text', text: 'Then text it to [phone]' }],
		})
		const bare = await buildPack(request({ reads: ['grocery-list'], message: 'Text 512-555-0134' }), readers())
		expect(bare.messages.at(-1)).toEqual({ role: 'user', content: [HEAD, { type: 'text', text: 'Text [phone]' }] })
	})

	it('turns the thread into user and assistant turns, and opens the newest message with the clock and the rows', async () => {
		const pack = await buildPack(request(), readers())
		expect(pack.messages).toHaveLength(3)
		// the turn ahead of the last reply ends the settled history, on a breakpoint
		expect(pack.messages[0]).toEqual({ role: 'user', content: [{ type: 'text', text: 'What can I cook?', ...MARK }] })
		expect(pack.messages[1]).toEqual({ role: 'assistant', content: 'Dal.' })
		expect(pack.messages[2]).toMatchObject({
			role: 'user',
			content: [{ type: 'text' }, { type: 'text', text: 'And tomorrow?' }],
		})
		// the system prompt is one block, cached, and says nothing of the clock, the panel or the pack
		expect(pack.system).toHaveLength(1)
		expect(pack.system[0]).toMatchObject({ type: 'text', cache_control: { type: 'ephemeral' } })
		expect(pack.system[0]!.text).not.toContain('Hearth,')
		expect(pack.system[0]!.text).not.toContain('Now:')
		expect(pack.system[0]!.text).toContain('- Hearth (kitchen): food and household consumables at home')
		expect(pack.system[0]!.text).toContain('- Sky (weather): the weather')
		expect(pack.system[0]!.text).toContain('Every tool call appears in the thread as a card')
		expect(pack.system[0]!.text).not.toContain('kitchen_suggest-recipes')
		const head = contextOf(pack)
		expect(head.startsWith('Now: Wednesday 2026-09-30, 04:40 (America/Chicago).')).toBe(true)
		expect(head).toContain('The owner opened this conversation from Hearth.')
		expect(head).toContain('\n\n<context>\n## dietary-preference (3 rows)\n')
		expect(head).toContain('\n</context>\n\n<index>\n')
		expect(head.endsWith('\n</index>')).toBe(true)
		expect(pack.tools).toHaveLength(index.length)
		// A read with no rows is a line of the index, at zero, and nothing on the eye.
		const empty = await buildPack(request({ reads: ['grocery-list'] }), readers())
		expect(empty.canSee).toEqual([])
		expect(contextOf(empty)).toContain('<index>\n- grocery-list (kitchen): 0 rows\n</index>')
		expect(contextOf(empty)).not.toContain('<context>')
	})

	it('sends a conversation the facts of the substrate and of its domain, and an index of the rest (D-148)', async () => {
		const facts = [...FACTS, fact(23, 'preferred-name', 'user-asserted', 'Sam')]
		const fake: PackReaders = {
			...readers(),
			facts: async (types) => facts.filter((entry) => types.includes(entry.type)),
		}
		const reads = ['preferred-name', ...request().reads]
		const pack = await buildPack(request({ reads }), fake)
		// the kitchen's facts and the substrate's, whole; no entity, task or event row
		expect(pack.reads).toEqual([
			{ id: 'preferred-name', count: 1, rows: [id(23)] },
			{ id: 'dietary-preference', count: 3, rows: [id(2), id(4), id(1)] },
			{ id: 'allergy', count: 1, rows: [id(3)] },
		])
		expect(pack.canSee).toEqual(pack.reads.map(({ id, count }) => ({ id, count })))
		expect(pack.entities).toEqual([])
		expect(pack.tier).toBe('T2')
		const head = contextOf(pack)
		expect(head).toContain('"value":"Sam"')
		expect(head).not.toContain('Miso salmon')
		expect(head.slice(head.indexOf('<index>'))).toBe(
			[
				'<index>',
				'- recipe (kitchen): 3 rows',
				'- stock-item (kitchen): 2 rows',
				'- local-event (substrate): 1 rows',
				'- task (substrate): 2 rows',
				'- medical-dietary-restriction (health): locked',
				'</index>',
			].join('\n')
		)
		// opened from nowhere, or from another domain, the kitchen's facts are lines of the index like any other
		const global = await buildPack(request({ reads, domain: undefined, domainName: undefined }), fake)
		expect(global.reads).toEqual([{ id: 'preferred-name', count: 1, rows: [id(23)] }])
		expect(contextOf(global)).toContain('- dietary-preference (kitchen): 3 rows')
		expect(contextOf(global)).toContain('- allergy (kitchen): 1 rows')
		expect(contextOf(global)).not.toContain('pescatarian')
		expect(global.tier).toBe('T1')
	})

	it('sends the same system prompt and the same tools whatever panel asks (D-147)', async () => {
		const hearth = await buildPack(request(), readers())
		const sky = await buildPack(
			request({ domain: 'weather', domainName: 'Sky', now: NOW + DAY, message: 'Will it rain?' }),
			readers()
		)
		expect(JSON.stringify(sky.system)).toBe(JSON.stringify(hearth.system))
		expect(JSON.stringify(sky.tools)).toBe(JSON.stringify(hearth.tools))
		const names = (hearth.tools as { name: string }[]).map((tool) => tool.name)
		expect(names).toEqual([...names].sort())
	})

	it('ends the settled history on a breakpoint, and where the last request left its own (D-147)', async () => {
		const thread = [
			message(15, 'owner', 'One'),
			message(16, 'gardener', 'First.'),
			message(17, 'owner', 'Two'),
			message(18, 'gardener', 'Second.'),
			message(19, 'owner', 'Three'),
			message(21, 'gardener', 'Third.'),
		]
		const marks = (pack: Pack) =>
			pack.messages.flatMap((turn, at) => (JSON.stringify(turn).includes('cache_control') ? [at] : []))
		const pack = await buildPack(request({ thread, message: 'Four' }), readers())
		// ahead of the last reply, and ahead of the one before it; the newest message's own is the runtime's
		expect(marks(pack)).toEqual([2, 4])
		expect(pack.messages[4]).toEqual({ role: 'user', content: [{ type: 'text', text: 'Three', ...MARK }] })
		// the request before this one ended its settled history where this one's earlier breakpoint is
		const before = await buildPack(request({ thread: thread.slice(0, 4), message: 'Three' }), readers())
		expect(marks(before)).toEqual([0, 2])
		// and the turns behind it are the same words: a marker is a position, not content
		const words = (turns: unknown[]) =>
			JSON.stringify(turns, (key, value) => (key === 'cache_control' ? undefined : value)).replaceAll(
				/\[\{"type":"text","text":("(?:[^"\\]|\\.)*")\}\]/g,
				'$1'
			)
		expect(words(pack.messages.slice(0, 3))).toBe(words(before.messages.slice(0, 3)))
		// nothing to settle in a first message
		expect(marks(await buildPack(request({ thread: [] }), readers()))).toEqual([])
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
					call: call('toolu_1', 'draft-tasks', { title: 'Call a@b.io' }, { status: 'drafted' }),
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
					call: call('toolu_4', 'update-tasks', { taskId: 'x' }, { error: 'no', cancelled: true }),
				},
				{ kind: 'tool', state: 'running', call: call('toolu_5', 'agenda', {}) },
				{ kind: 'tool', state: 'done', call: call('toolu_6', 'read-rows', { type: 'recipe' }, '## recipe (0 rows)') },
			]),
		]
		const pack = await buildPack(request({ thread, message: 'Thanks' }), readers())
		expect(pack.messages.slice(0, -1)).toEqual([
			{ role: 'user', content: [{ type: 'text', text: 'Remind me to call [email] on Friday', ...MARK }] },
			{
				role: 'assistant',
				content: [
					{ type: 'text', text: 'Drafting it.' },
					{ type: 'tool_use', id: 'toolu_1', name: 'draft-tasks', input: { title: 'Call [email]' } },
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
			{ role: 'user', content: [{ type: 'text', text: 'And the weather?', ...MARK }] },
			{
				role: 'assistant',
				content: [
					{ type: 'tool_use', id: 'toolu_3', name: 'weather_forecast', input: {} },
					{ type: 'tool_use', id: 'toolu_4', name: 'update-tasks', input: { taskId: 'x' } },
					{ type: 'tool_use', id: 'toolu_5', name: 'agenda', input: {} },
					{ type: 'tool_use', id: 'toolu_6', name: 'read-rows', input: { type: 'recipe' } },
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
					// a result that is text already is replayed as it was sent, not as a JSON string
					{ type: 'tool_result', tool_use_id: 'toolu_6', content: '## recipe (0 rows)', is_error: false },
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
		expect(pack.estimatedInputTokens).toBe(
			tokens(pack.system[0]!.text) +
				tokens(contextOf(pack)) +
				tokens('What can I cook?') +
				tokens('Dal.') +
				tokens('And tomorrow?')
		)
	})

	it('trims the oldest entity rows first, round-robin, never a pinned row or a fact, then the thread', async () => {
		const full = await buildPack(whole(), readers())
		const focus = [`eden://recipe/${id(5)}`]
		const one = await buildPack(whole({ focus, tokenCap: full.estimatedInputTokens - 1, outputReserve: 0 }), readers())
		expect(one.trimmed).toEqual(['recipe'])
		expect(one.reads.find((read) => read.id === 'recipe')).toEqual({ id: 'recipe', count: 2, rows: [id(5), id(7)] })
		expect(one.estimatedInputTokens).toBeLessThan(full.estimatedInputTokens)

		const two = await buildPack(whole({ focus, tokenCap: one.estimatedInputTokens - 1, outputReserve: 0 }), readers())
		expect(two.trimmed).toEqual(['recipe', 'stock-item'])
		expect(two.reads.find((read) => read.id === 'stock-item')?.rows).toEqual([id(9)])

		const bare = await buildPack(whole({ focus, tokenCap: 1, outputReserve: 0 }), readers())
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
		expect(contextOf(bare)).toContain('Trimmed: recipe, stock-item, local-event, task, thread.')
		expect(bare.estimatedInputTokens).toBeGreaterThan(1)
	})

	it('answers one id’s rows on demand, through the pack’s own gate and writer (D-148)', async () => {
		const reach = ['recipe', 'stock-item', 'allergy', 'medical-dietary-restriction', 'task']
		const ask = (type: string, ids?: string[], fake = readers()) =>
			readRows({ type, ...(ids ? { ids } : {}), reach, subject: 'anthropic', now: NOW, zone: 'America/Chicago' }, fake)

		const recipes = await ask('recipe')
		expect(recipes.text).toBe(
			[
				'## recipe (3 rows)',
				'id|name|phone',
				`<untrusted source="web">${id(7)}|Curry from the shop|[phone]</untrusted>`,
				`${id(6)}|Miso salmon|`,
				`${id(5)}|Dal|`,
			].join('\n')
		)
		expect(recipes.read).toEqual({ id: 'recipe', count: 3, rows: [id(7), id(6), id(5)] })
		expect(recipes.entities).toEqual([7, 6, 5].map((n) => `eden://recipe/${id(n)}`))
		expect(recipes.tier).toBe('T0')

		// by id: the rows named, and a word for the ones that are not there
		const one = await ask('recipe', [id(5), 'nope'])
		expect(one.text).toBe(
			`## recipe (1 rows)\n{"id":"${id(5)}","type":"recipe","name":"Dal"}\n\nNo row of recipe in reach has the id "nope".`
		)
		expect(one.read).toEqual({ id: 'recipe', count: 1, rows: [id(5)] })

		// a T2 fact under its grant: the grant is kept and the thread's tier follows
		const allergy = await ask('allergy')
		expect(allergy.text).toContain('[email]')
		expect(allergy.grants).toEqual(['grant-allergy'])
		expect(allergy.tier).toBe('T2')
		expect(allergy.entities).toEqual([])

		// refused: locked, never shared, outside the conversation's reach, not an id at all
		const locked = await ask('medical-dietary-restriction')
		expect(locked).toMatchObject({ locked: 'medical-dietary-restriction', error: expect.stringContaining('locked') })
		expect(locked.text).toBeUndefined()
		expect(locked.read).toBeUndefined()
		for (const type of ['grocery-list', 'identity-document', 'secret-sauce']) {
			const refused = await ask(type)
			expect(refused.error, type).toContain('not a type you can read')
			expect(refused.text, type).toBeUndefined()
		}
		const never = await readRows(
			{ type: 'identity-document', reach: ['identity-document'], subject: 'anthropic', now: NOW, zone: 'UTC' },
			readers()
		)
		expect(never.error).toContain('never shared')
	})

	it('answers a great many rows as their ids and names, to be asked for by id', async () => {
		const many = Array.from({ length: 400 }, (_, n) =>
			row(n % 26, 'recipe', {
				id: `R${n}`,
				uri: `eden://recipe/R${n}`,
				payload: { name: `Dish ${n}`, steps: ['Chop.', 'Fry.', 'Serve.'], minutes: 30 },
				...(n === 0 ? { mirror: true, source: 'web' } : {}),
			})
		)
		const fake: PackReaders = { ...readers(), entities: async () => many }
		const ask = { type: 'recipe', reach: ['recipe'], subject: 'anthropic', now: NOW, zone: 'UTC' }
		const listed = await readRows(ask, fake)
		expect(listed.text!.length).toBeLessThan(READ_ROWS_CHARS)
		expect(listed.text).toContain('## recipe (400 rows; too many to send whole')
		expect(listed.text).toContain('\nid|name\n')
		expect(listed.text).toContain('R7|Dish 7')
		expect(listed.text).toContain('<untrusted source="web">R0|Dish 0</untrusted>')
		expect(listed.text).not.toContain('Chop.')
		// names alone are not rows read: nothing joins the audit entry
		expect(listed.read).toBeUndefined()
		expect(listed.entities).toEqual([])
		const some = await readRows({ ...ask, ids: ['R7', 'R8', 'R9'] }, fake)
		expect(some.text).toContain('R7|Dish 7|["Chop.","Fry.","Serve."]|30')
		expect(some.read).toMatchObject({ id: 'recipe', count: 3 })
		expect([...some.read!.rows].sort()).toEqual(['R7', 'R8', 'R9'])
	})
})
