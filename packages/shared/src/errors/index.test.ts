import { describe, expect, it } from 'vitest'
import { isBenignErrorEvent } from './index.js'

describe('isBenignErrorEvent', () => {
	it('passes over the ResizeObserver loop notice, in both wordings', () => {
		expect(
			isBenignErrorEvent({ message: 'ResizeObserver loop completed with undelivered notifications.', error: null })
		).toBe(true)
		expect(isBenignErrorEvent({ message: 'ResizeObserver loop limit exceeded' })).toBe(true)
	})

	it('keeps a thrown error a crash, whatever its message', () => {
		expect(isBenignErrorEvent({ message: 'Uncaught TypeError: x is not a function', error: new TypeError('x') })).toBe(
			false
		)
		expect(isBenignErrorEvent({ message: 'ResizeObserver loop', error: new Error('ResizeObserver loop') })).toBe(false)
	})

	it('keeps an event with no message a crash', () => {
		expect(isBenignErrorEvent({})).toBe(false)
		expect(isBenignErrorEvent({ message: 'Script error.', error: null })).toBe(false)
	})
})
