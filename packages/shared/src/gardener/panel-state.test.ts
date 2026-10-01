import { afterEach, describe, expect, it, vi } from 'vitest'
import { GARDENER_PANEL_KEY, gardenerPanelState, rememberGardenerPanel } from './panel-state.js'

describe('the Gardener panel record', () => {
	const store = new Map<string, string>()
	vi.stubGlobal('localStorage', {
		getItem: (key: string) => store.get(key) ?? null,
		setItem: (key: string, value: string) => void store.set(key, value),
		removeItem: (key: string) => void store.delete(key),
	})
	afterEach(() => store.clear())

	it('is shut, on no domain and no recorded conversation, when nothing was kept', () => {
		expect(gardenerPanelState()).toEqual({ open: false })
	})

	it('reads what cannot be parsed, or is not a record, as nothing kept', () => {
		for (const kept of ['{', 'true', '"open"', 'null', '[]']) {
			store.set(GARDENER_PANEL_KEY, kept)
			expect(gardenerPanelState()).toEqual({ open: false })
		}
	})

	it('drops the keys of the wrong type and keeps the rest', () => {
		store.set(GARDENER_PANEL_KEY, JSON.stringify({ open: 'yes', domain: 3, thread: 'a1' }))
		expect(gardenerPanelState()).toEqual({ open: false, thread: 'a1' })
		store.set(GARDENER_PANEL_KEY, JSON.stringify({ open: true, domain: '', thread: 7 }))
		expect(gardenerPanelState()).toEqual({ open: true })
	})

	it('records a change over what was kept', () => {
		rememberGardenerPanel({ open: true, domain: 'kitchen' })
		rememberGardenerPanel({ thread: 'a1' })
		expect(gardenerPanelState()).toEqual({ open: true, domain: 'kitchen', thread: 'a1' })
		rememberGardenerPanel({ open: false, domain: undefined })
		expect(gardenerPanelState()).toEqual({ open: false, thread: 'a1' })
	})

	it('keeps a new conversation apart from no conversation recorded', () => {
		rememberGardenerPanel({ open: true })
		expect('thread' in gardenerPanelState()).toBe(false)
		rememberGardenerPanel({ thread: null })
		expect(gardenerPanelState().thread).toBeNull()
	})
})
