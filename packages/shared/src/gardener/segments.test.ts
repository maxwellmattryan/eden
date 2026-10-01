import { describe, expect, it } from 'vitest'
import type { MessageBlock, ToolState } from './runtime-types.js'
import { segmentsOf } from './segments.js'

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

	it('skips the can-see block, drafts and blank text, without breaking a run', () => {
		const blocks: MessageBlock[] = [
			{ kind: 'can-see', items: [], locked: [], trimmed: [], rows: {} },
			tool('a'),
			text('  '),
			tool('b'),
		]
		expect(shape(blocks)).toEqual([[1, 3]])
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
