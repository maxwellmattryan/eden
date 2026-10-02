import { describe, expect, it } from 'vitest'
import { withBreakpoint } from './cache.js'

const MARK = { type: 'ephemeral' }

/** Every block carrying a marker, as `turn.block`. */
function marks(messages: unknown[]): string[] {
	return messages.flatMap((message, turn) => {
		const { content } = message as { content: unknown }
		if (!Array.isArray(content)) return []
		return content.flatMap((block, at) => ('cache_control' in (block as object) ? [`${turn}.${at}`] : []))
	})
}

describe('withBreakpoint', () => {
	it('turns a turn of plain words into one marked text block', () => {
		const out = withBreakpoint([{ role: 'user', content: 'What is for dinner?' }])
		expect(out).toEqual([
			{ role: 'user', content: [{ type: 'text', text: 'What is for dinner?', cache_control: MARK }] },
		])
	})

	it('marks the last block of the last turn and no other', () => {
		const messages = [
			{ role: 'user', content: 'Earlier' },
			{ role: 'assistant', content: [{ type: 'text', text: 'A reply' }] },
			{
				role: 'user',
				content: [
					{ type: 'text', text: '<context>…</context>' },
					{ type: 'text', text: 'And now?' },
				],
			},
		]
		const out = withBreakpoint(messages)
		expect(marks(out)).toEqual(['2.1'])
		expect(out[0]).toBe(messages[0])
		expect(out[1]).toBe(messages[1])
	})

	it('marks a tool result, the block a later round ends on', () => {
		const out = withBreakpoint([
			{ role: 'user', content: 'Add milk' },
			{ role: 'assistant', content: [{ type: 'tool_use', id: 'a', name: 'add', input: {} }] },
			{
				role: 'user',
				content: [
					{ type: 'tool_result', tool_use_id: 'a', content: '{}' },
					{ type: 'tool_result', tool_use_id: 'b', content: '{}' },
				],
			},
		])
		expect(marks(out)).toEqual(['2.1'])
	})

	it('changes nothing it was given', () => {
		const messages = [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }]
		const before = JSON.stringify(messages)
		withBreakpoint(messages)
		expect(JSON.stringify(messages)).toBe(before)
	})

	it('moves forward round by round, leaving one marker and the earlier bytes as they were', () => {
		const first = [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }]
		const second = [
			...first,
			{ role: 'assistant', content: [{ type: 'tool_use', id: 'a', name: 'agenda', input: {} }] },
			{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'a', content: '[]' }] },
		]
		expect(marks(withBreakpoint(first))).toEqual(['0.0'])
		// an already marked tail, sent again with more after it, keeps only the newest marker
		const again = withBreakpoint([...withBreakpoint(first), ...second.slice(1)])
		expect(marks(again)).toEqual(['2.0'])
		expect(again[0]).toEqual(first[0])
	})

	it('keeps a marker ahead of `from`, the settled history', () => {
		const out = withBreakpoint(
			[
				{ role: 'user', content: [{ type: 'text', text: 'Old', cache_control: MARK }] },
				{ role: 'assistant', content: [{ type: 'text', text: 'Reply', cache_control: MARK }] },
				{ role: 'user', content: 'New' },
			],
			1
		)
		expect(marks(out)).toEqual(['0.0', '2.0'])
	})

	it('leaves a last turn with nothing to mark as it came', () => {
		const empty = [{ role: 'user', content: '' }]
		expect(withBreakpoint(empty)).toEqual(empty)
		const reasoning = [{ role: 'assistant', content: [{ type: 'thinking', thinking: '…', signature: 's' }] }]
		expect(withBreakpoint(reasoning)).toEqual(reasoning)
		expect(withBreakpoint([])).toEqual([])
	})
})
