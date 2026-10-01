import { describe, expect, it } from 'vitest'
import { takes } from './row-drag.js'

describe('takes', () => {
	it('takes a drag of a group the target accepts', () => {
		expect(takes({ group: 'grocery-item' }, ['grocery-item'], false)).toBe(true)
		expect(takes({ group: 'task' }, ['grocery-item', 'task'], false)).toBe(true)
	})

	it('takes nothing while no drag is in progress', () => {
		expect(takes(undefined, ['grocery-item'], false)).toBe(false)
	})

	it('leaves a drag of another group alone', () => {
		expect(takes({ group: 'task' }, ['grocery-item'], false)).toBe(false)
		expect(takes({ group: 'task' }, [], false)).toBe(false)
	})

	it('is no target for a drag that began inside it', () => {
		expect(takes({ group: 'grocery-item' }, ['grocery-item'], true)).toBe(false)
	})
})
