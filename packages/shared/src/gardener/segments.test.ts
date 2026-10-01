import { describe, expect, it } from 'vitest'
import type { MessageBlock, ToolState } from './runtime-types.js'
import { awaitsWords, segmentsOf } from './segments.js'

const text = (words: string): MessageBlock => ({ kind: 'text', text: words })
const tool = (id: string, state: ToolState = 'done', access: 'read' | 'write' = 'read'): MessageBlock => ({
	kind: 'tool',
	call: { id, name: `weather_${id}`, domain: 'weather', tool: id, access, input: {} },
	state,
})
const shape = (blocks: MessageBlock[], stateOf?: (state: ToolState) => ToolState) =>
	segmentsOf(blocks, stateOf).map((segment) =>
		segment.kind === 'run' ? segment.items.map((item) => item.index) : `${segment.kind}:${segment.index}`
	)

describe('segmentsOf', () => {
	it('keeps the order things happened in', () => {
		const blocks = [text('I will look.'), tool('a'), tool('b'), tool('c'), text('Around the 26th.')]
		expect(shape(blocks)).toEqual(['text:0', [1, 2, 3], 'text:4'])
	})

	it('leaves a single call as its own card', () => {
		expect(shape([text('One moment.'), tool('a'), text('Done.')])).toEqual(['text:0', 'card:1', 'text:2'])
	})

	it('skips the can-see block, the writing mark, drafts and blank text, without breaking a run', () => {
		const blocks: MessageBlock[] = [
			{ kind: 'can-see', items: [], locked: [], trimmed: [], rows: {} },
			{ kind: 'writing' },
			tool('a'),
			text('  '),
			tool('b'),
		]
		expect(shape(blocks)).toEqual([[2, 4]])
	})

	it('never folds a failure, a confirm owed or a write', () => {
		const blocks = [
			tool('a'),
			tool('b'),
			tool('c', 'failed'),
			tool('d'),
			tool('e', 'pending'),
			tool('f', 'done', 'write'),
		]
		expect(shape(blocks)).toEqual([[0, 1], 'card:2', 'card:3', 'card:4', 'card:5'])
	})

	it('folds a run still running, and one a gone request left behind', () => {
		const blocks = [tool('a'), tool('b', 'running')]
		expect(shape(blocks)).toEqual([[0, 1]])
		expect(shape(blocks, (state) => (state === 'running' ? 'cancelled' : state))).toEqual([[0, 1]])
	})

	it('lets a proposal or an error part two runs', () => {
		const blocks: MessageBlock[] = [
			tool('a'),
			tool('b'),
			{ kind: 'error', code: 'network', message: 'offline' },
			tool('c'),
		]
		expect(shape(blocks)).toEqual([[0, 1], 'card:2', 'card:3'])
	})
})

describe('awaitsWords', () => {
	const awaited = (blocks: MessageBlock[], stateOf?: (state: ToolState) => ToolState) =>
		awaitsWords(segmentsOf(blocks, stateOf), stateOf)

	it('is awaited before anything has arrived', () => {
		expect(awaited([{ kind: 'can-see', items: [], locked: [], trimmed: [], rows: {} }, { kind: 'writing' }])).toBe(true)
	})

	it('is not awaited while words stream', () => {
		expect(awaited([text('I will')])).toBe(false)
		expect(awaited([tool('a'), text('Around')])).toBe(false)
	})

	it('is awaited once the tools are through, alone or as a run', () => {
		expect(awaited([text('I will look.'), tool('a')])).toBe(true)
		expect(awaited([text('I will look.'), tool('a'), tool('b')])).toBe(true)
		expect(awaited([tool('a', 'failed')])).toBe(true)
	})

	it('leaves a running card to its spinner and a confirm to the owner', () => {
		expect(awaited([tool('a'), tool('b', 'running')])).toBe(false)
		expect(awaited([tool('a', 'running', 'write')])).toBe(false)
		expect(awaited([tool('a', 'pending', 'write')])).toBe(false)
	})

	it('is awaited after a proposal the tools left, which the request does not wait on', () => {
		const proposal = { id: 'p', type: 'preferred-name', value: 'Mo', text: 'You said so.' }
		expect(awaited([tool('a'), { kind: 'proposal', proposal, state: 'pending' } as MessageBlock])).toBe(true)
	})

	it('is not awaited after an error', () => {
		expect(awaited([tool('a'), { kind: 'error', code: 'network', message: 'offline' }])).toBe(false)
	})
})
