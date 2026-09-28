import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastStore } from './toast.svelte.js'

describe('ToastStore', () => {
	beforeEach(() => vi.useFakeTimers())
	afterEach(() => vi.useRealTimers())

	it('shows one toast at a time and replaces it', () => {
		const store = new ToastStore()
		store.show({ message: 'first' })
		store.show({ message: 'second' })
		expect(store.current?.message).toBe('second')
		expect(store.current?.id).toBe(2)
	})

	it('dismisses after the duration, and later after a pause', () => {
		const store = new ToastStore()
		store.show({ message: 'logged', duration: 8000 })
		vi.advanceTimersByTime(5000)
		store.pause()
		vi.advanceTimersByTime(10000)
		expect(store.current?.message).toBe('logged')
		store.resume()
		vi.advanceTimersByTime(2999)
		expect(store.current?.message).toBe('logged')
		vi.advanceTimersByTime(1)
		expect(store.current).toBeNull()
	})

	it('dismisses on demand', () => {
		const store = new ToastStore()
		store.show({ message: 'x' })
		store.dismiss()
		expect(store.current).toBeNull()
		vi.advanceTimersByTime(9000)
		expect(store.current).toBeNull()
	})
})
