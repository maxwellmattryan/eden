import { describe, expect, it } from 'vitest'
import {
	LAST_ROUND,
	lastTurn,
	matchCall,
	outcomesLine,
	PAST_LAST_ROUND,
	roundNote,
	transcriptOf,
} from './claude-code.js'
import type { Message, MessageBlock } from './runtime-types.js'

let n = 0
const message = (role: Message['role'], blocks: MessageBlock[]): Message => {
	n += 1
	const id = `01ARZ3NDEKTSV4RRFFQ69G5F${String(n).padStart(2, '0')}`
	return {
		uri: `eden://message/${id}`,
		id,
		threadId: 'thread',
		role,
		blocks,
		requestId: null,
		createdAt: '',
		updatedAt: '',
		deletedAt: null,
	}
}

const call = (id: string, name: string, input: unknown, output: unknown) =>
	({
		kind: 'tool',
		call: { id, name, domain: 'kitchen', tool: name, access: 'write-draft', input, output },
		state: 'done',
	}) as const

describe('the one message a process is sent', () => {
	it('is the pack’s last turn, its parts without the API’s cache breakpoints', () => {
		const pack = {
			messages: [
				{ role: 'user', content: 'earlier' },
				{
					role: 'user',
					content: [
						{ type: 'text', text: 'Now: …', cache_control: { type: 'ephemeral' } },
						{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AA' } },
						{ type: 'text', text: 'What is this?' },
					],
				},
			],
		}
		expect(lastTurn(pack)).toEqual({
			role: 'user',
			content: [
				{ type: 'text', text: 'Now: …' },
				{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AA' } },
				{ type: 'text', text: 'What is this?' },
			],
		})
		expect(lastTurn({ messages: [{ role: 'user', content: 'Hi' }] }).content).toEqual([{ type: 'text', text: 'Hi' }])
		expect(lastTurn({ messages: [] }).content).toEqual([])
	})
})

describe('the transcript a new session is seeded with', () => {
	it('writes the owner’s words, the replies, each call with its result and what became of its card', () => {
		const prior = [
			message('owner', [{ kind: 'text', text: 'Draft a task to call mum at mum@example.com' }]),
			message('gardener', [
				{ kind: 'text', text: 'Drafted.' },
				call('toolu_1', 'substrate_draft-task', { title: 'Call mum' }, { drafted: true }),
				{ kind: 'draft', draft: { kind: 'task', title: 'Call mum' }, state: 'committed', callId: 'toolu_1' },
				{ kind: 'text', text: 'Anything else?' },
			]),
			message('owner', [
				{ kind: 'attachment', id: 'a1', name: 'receipt.jpg', mime: 'image/jpeg', size: 1, hash: 'h' },
				{ kind: 'text', text: 'And this one' },
			]),
		]
		const text = transcriptOf(prior)
		expect(text.startsWith('<transcript>\n')).toBe(true)
		expect(text.endsWith('\n</transcript>')).toBe(true)
		const lines = text.split('\n').slice(2, -1)
		expect(lines).toEqual([
			'Owner: Draft a task to call mum at [email]',
			'Gardener: Drafted.',
			'Gardener called substrate_draft-task with {"title":"Call mum"}',
			'It answered: {"drafted":true,"card":"kept by the owner"}',
			'Gardener: Anything else?',
			'Owner attached a file: receipt.jpg',
			'Owner: And this one',
		])
		expect(text).not.toContain('mum@example.com')
	})

	it('says a failed call failed, and is empty for a thread with nothing before', () => {
		const failed = message('gardener', [
			{
				kind: 'tool',
				call: {
					id: 't',
					name: 'kitchen_add',
					domain: 'kitchen',
					tool: 'add',
					access: 'write',
					input: {},
					error: 'nope',
				},
				state: 'failed',
			},
		])
		expect(transcriptOf([failed])).toContain('It failed: {"error":"nope"}')
		expect(transcriptOf([])).toBe('')
	})
})

describe('the outcomes line', () => {
	it('names the kept and discarded cards of the previous reply', () => {
		const prior = [
			message('owner', [{ kind: 'text', text: 'Plan the week' }]),
			message('gardener', [
				{ kind: 'draft', draft: { kind: 'plan', title: 'Week of 2 Nov', tasks: [], events: [] }, state: 'committed' },
				{ kind: 'draft', draft: { kind: 'grocery', items: [{ name: 'Milk', qty: '1' }] }, state: 'discarded' },
				{ kind: 'draft', draft: { kind: 'task', title: 'Pending one' }, state: 'pending' },
				{
					kind: 'proposal',
					proposal: { id: 'p', type: 'dietary-preference', value: 'vegetarian', confidence: 0.8 },
					state: 'dismissed',
				},
			]),
		]
		expect(outcomesLine(prior)).toBe(
			'(Since your last reply the owner kept the plan “Week of 2 Nov” and discarded the grocery list of 1 item and the proposed dietary-preference fact.)'
		)
	})

	it('reads only the last reply, and is empty when nothing was kept or discarded', () => {
		const older = message('gardener', [{ kind: 'draft', draft: { kind: 'task', title: 'Old' }, state: 'committed' }])
		const latest = message('gardener', [{ kind: 'draft', draft: { kind: 'task', title: 'New' }, state: 'pending' }])
		expect(outcomesLine([older, message('owner', [{ kind: 'text', text: 'ok' }]), latest])).toBe('')
		expect(outcomesLine([older])).toBe('(Since your last reply the owner kept the task “Old”.)')
		expect(outcomesLine([])).toBe('')
	})
})

describe('the rounds of a message on Claude Code', () => {
	it('says nothing before the sixth round, the last-round line in it, and refuses from the seventh', () => {
		for (const round of [1, 2, 5]) expect(roundNote(round)).toBeNull()
		expect(roundNote(6)).toEqual({ kind: 'last', text: LAST_ROUND })
		expect(roundNote(7)).toEqual({ kind: 'past', text: PAST_LAST_ROUND })
		expect(roundNote(12)?.kind).toBe('past')
	})
})

describe('matching a call through the bridge to its streamed tool use', () => {
	const uses = [
		{ id: 'toolu_1', name: 'read-rows', input: { kind: 'task' } },
		{ id: 'toolu_2', name: 'read-rows', input: { kind: 'task' } },
		{ id: 'toolu_3', name: 'read-rows', input: { kind: 'event', limit: { n: 2, of: [1, 2] } } },
	]

	it('matches by the tool-use id when there is one', () => {
		expect(matchCall(uses, { name: 'read-rows', input: { kind: 'task' }, toolUseId: 'toolu_2' })?.id).toBe('toolu_2')
	})

	it('otherwise takes the oldest with the same name and an equal input', () => {
		expect(matchCall(uses, { name: 'read-rows', input: { kind: 'task' } })?.id).toBe('toolu_1')
		expect(matchCall(uses, { name: 'read-rows', input: { limit: { of: [1, 2], n: 2 }, kind: 'event' } })?.id).toBe(
			'toolu_3'
		)
		expect(matchCall(uses, { name: 'read-rows', input: { kind: 'task' }, toolUseId: 'toolu_9' })?.id).toBe('toolu_1')
		expect(matchCall(uses, { name: 'read-rows', input: { kind: 'place' } })).toBeUndefined()
		expect(matchCall(uses, { name: 'agenda', input: { kind: 'task' } })).toBeUndefined()
		expect(
			matchCall(uses, { name: 'read-rows', input: { kind: 'event', limit: { n: 2, of: [2, 1] } } })
		).toBeUndefined()
	})
})
