import { describe, expect, it } from 'vitest'
import { parseQuickLog, quickLogTarget } from './parse'

const candidates = [
	{ key: 'kitchen.add-to-grocery', words: ['Grocery', 'Add', 'Hearth'] },
	{ key: 'toolbench.capture-idea', words: ['Idea', 'Capture an idea', 'Toolbench'] },
	{ key: 'fitness.log-weight', words: ['Weight'] },
]

describe('parseQuickLog', () => {
	it('names an action by a word and gives it the rest, with or without the verb', () => {
		expect(parseQuickLog('log weight 82.4', candidates)).toEqual({ key: 'fitness.log-weight', value: '82.4' })
		expect(parseQuickLog('Grocery  oat milk x2', candidates)).toEqual({
			key: 'kitchen.add-to-grocery',
			value: 'oat milk x2',
		})
		expect(parseQuickLog('idea: A seed library', candidates)).toEqual({
			key: 'toolbench.capture-idea',
			value: 'A seed library',
		})
	})

	it('takes the longest name, and keeps the case of the value', () => {
		expect(parseQuickLog('capture an idea Sourdough Tracker', candidates)).toEqual({
			key: 'toolbench.capture-idea',
			value: 'Sourdough Tracker',
		})
	})

	it('answers nothing for a line that names no action, half a word, or no value', () => {
		expect(parseQuickLog('log sleep 7', candidates)).toBeUndefined()
		expect(parseQuickLog('ideas for dinner', candidates)).toBeUndefined()
		expect(parseQuickLog('log weight', candidates)).toBeUndefined()
		expect(parseQuickLog('', candidates)).toBeUndefined()
	})

	it('keeps a value that starts with the verb', () => {
		expect(parseQuickLog('idea log cabin plans', candidates)).toEqual({
			key: 'toolbench.capture-idea',
			value: 'log cabin plans',
		})
	})
})

describe('quickLogTarget', () => {
	it('launches a launch and opens the sheet for the rest', () => {
		expect(quickLogTarget({ kind: 'launch' })).toBe('launch')
		expect(quickLogTarget({ kind: 'text' })).toBe('sheet')
	})
})
