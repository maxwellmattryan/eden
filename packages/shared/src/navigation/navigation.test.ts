import { afterEach, describe, expect, it, vi } from 'vitest'
import {
	LAST_PLACE_KEY,
	bindNavigation,
	holdBack,
	isKnownPlace,
	lastPlace,
	navigation,
	rememberPlace,
	rememberScroll,
	rememberTabPlace,
	scrollOf,
	tabOf,
	tabPlace,
	takeBack,
	type PlaceId,
} from './index.js'

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

describe('tab places', () => {
	it('gives nothing for a tab not yet visited and the last pathname for one that was', () => {
		expect(tabPlace('kitchen')).toBeUndefined()
		rememberTabPlace('kitchen', '/kitchen/recipes')
		rememberTabPlace('kitchen', '/kitchen/stock')
		expect(tabPlace('kitchen')).toBe('/kitchen/stock')
		expect(tabPlace('weather')).toBeUndefined()
	})
})

describe('the back stack', () => {
	it('answers false with nothing held', () => {
		expect(takeBack()).toBe(false)
	})

	it('asks the latest handler first and stops at the one that uses the press', () => {
		const calls: string[] = []
		const releaseList = holdBack(() => (calls.push('list'), true))
		const releaseDetail = holdBack(() => (calls.push('detail'), true))
		expect(takeBack()).toBe(true)
		expect(calls).toEqual(['detail'])
		releaseDetail()
		expect(takeBack()).toBe(true)
		expect(calls).toEqual(['detail', 'list'])
		releaseList()
		expect(takeBack()).toBe(false)
	})

	it('passes over a handler that does not use the press, and releases twice without harm', () => {
		const calls: string[] = []
		const releaseUnder = holdBack(() => (calls.push('under'), true))
		const releaseIdle = holdBack(() => (calls.push('idle'), false))
		expect(takeBack()).toBe(true)
		expect(calls).toEqual(['idle', 'under'])
		releaseIdle()
		releaseIdle()
		releaseUnder()
		expect(takeBack()).toBe(false)
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

describe('the navigation seam', () => {
	const paths: Partial<Record<PlaceId, string>> = { garden: '/garden', gardener: '/gardener', kitchen: '/kitchen' }
	const at = (address: string, tab?: string, id: string | null = null) => ({
		url: new URL(address, 'http://localhost'),
		params: { tab },
		route: { id },
	})

	it('answers quietly while no app is bound', async () => {
		expect(navigation.href({ place: 'kitchen', tab: 'recipes' })).toBeUndefined()
		await expect(navigation.open({ place: 'garden' })).resolves.toBeUndefined()
		expect(navigation.tab).toBeUndefined()
		expect([...navigation.search]).toEqual([])
		expect(navigation.place).toBe('garden')
	})

	it('resolves through the app, appends the search and reads the page', async () => {
		const goto = vi.fn(async () => {})
		let page = at('/gardener/audit?tool=add-items&range=7d', 'audit', '/gardener/[[tab]]')
		const unbind = bindNavigation({
			resolve: ({ place, tab }) => {
				const path = paths[place]
				return path === undefined ? undefined : tab ? `${path}/${tab}` : path
			},
			goto,
			page: () => page,
		})

		expect(navigation.href({ place: 'kitchen', tab: 'recipes' })).toBe('/kitchen/recipes')
		expect(navigation.href({ place: 'gardener', tab: 'audit', search: 'tool=add-items' })).toBe(
			'/gardener/audit?tool=add-items'
		)
		expect(navigation.href({ place: 'gardener', search: '?range=7d' })).toBe('/gardener?range=7d')
		expect(navigation.href({ place: 'gardener', search: '' })).toBe('/gardener')
		expect(navigation.href({ place: 'more' })).toBeUndefined()

		await navigation.open({ place: 'gardener', tab: 'audit', search: 'range=7d' }, { noScroll: true, keepFocus: true })
		expect(goto).toHaveBeenLastCalledWith('/gardener/audit?range=7d', { noScroll: true, keepFocus: true })
		await navigation.open({ place: 'more' })
		expect(goto).toHaveBeenCalledTimes(1)

		expect(navigation.tab).toBe('audit')
		expect(navigation.search.get('tool')).toBe('add-items')
		expect(navigation.place).toBe('gardener')
		page = at('/kitchen', undefined, '/kitchen/[[tab]]')
		expect(navigation.tab).toBeUndefined()
		expect(navigation.place).toBe('kitchen')

		unbind()
		expect(navigation.href({ place: 'garden' })).toBeUndefined()
		expect(navigation.place).toBe('garden')
	})
})
