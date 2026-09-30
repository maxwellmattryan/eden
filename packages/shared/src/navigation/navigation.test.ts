import { afterEach, describe, expect, it, vi } from 'vitest'
import { LAST_PLACE_KEY, isKnownPlace, lastPlace, rememberPlace, rememberScroll, scrollOf, tabOf } from './index.js'

const KNOWN = ['/garden', '/today', '/kitchen', '/weather']

describe('isKnownPlace', () => {
	it('takes a place and the pages under it, and nothing that merely starts alike', () => {
		expect(isKnownPlace('/kitchen', KNOWN)).toBe(true)
		expect(isKnownPlace('/kitchen/recipes', KNOWN)).toBe(true)
		expect(isKnownPlace('/kitchenette', KNOWN)).toBe(false)
		expect(isKnownPlace('/', KNOWN)).toBe(false)
		expect(isKnownPlace('/nowhere', KNOWN)).toBe(false)
	})
})

describe('lastPlace', () => {
	const store = new Map<string, string>()
	vi.stubGlobal('localStorage', {
		getItem: (key: string) => store.get(key) ?? null,
		setItem: (key: string, value: string) => void store.set(key, value),
		removeItem: (key: string) => void store.delete(key),
	})
	afterEach(() => store.clear())

	it('remembers a place and gives it back while it is still known', () => {
		rememberPlace('/kitchen/grocery')
		expect(store.get(LAST_PLACE_KEY)).toBe('/kitchen/grocery')
		expect(lastPlace(KNOWN)).toBe('/kitchen/grocery')
	})

	it('gives nothing for a place that is gone, or when nothing was remembered', () => {
		rememberPlace('/nowhere')
		expect(lastPlace(KNOWN)).toBeUndefined()
		store.clear()
		expect(lastPlace(KNOWN)).toBeUndefined()
	})
})

describe('scroll memory', () => {
	it('starts every tab at the top and keeps what it is given', () => {
		expect(scrollOf('weather')).toBe(0)
		rememberScroll('weather', 420)
		expect(scrollOf('weather')).toBe(420)
		rememberScroll('weather', 0)
		expect(scrollOf('weather')).toBe(0)
	})
})

describe('tabOf', () => {
	it('names the tab by the first segment of the route id, the Garden at the root', () => {
		expect(tabOf({ id: '/kitchen/[[tab]]' })).toBe('kitchen')
		expect(tabOf({ id: '/garden' })).toBe('garden')
		expect(tabOf({ id: '/' })).toBe('garden')
		expect(tabOf({ id: null })).toBe('garden')
		expect(tabOf(null)).toBe('garden')
		expect(tabOf(undefined)).toBe('garden')
	})
})
