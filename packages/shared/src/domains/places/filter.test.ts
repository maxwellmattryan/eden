import { describe, expect, it } from 'vitest'
import { asFilter, filterCount, filterPlaces, isFiltering, matches } from './filter.js'
import { parseOpeningHours } from './hours.js'
import { EMPTY_FILTER, type PlaceFilter, type SavedPlace } from './types.js'

const place = (given: Partial<SavedPlace> & { id: string; name: string }): SavedPlace => ({
	vibes: [],
	favourite: false,
	providerIds: {},
	...given,
})
const hours = (text: string) => ({ source: 'osm', asOf: '2026-09-29T12:00:00Z', text, spec: parseOpeningHours(text) })

const cosmic = place({
	id: 'p1',
	name: 'Cosmic Coffee',
	category: 'cafe',
	point: { lng: -97.7626, lat: 30.2269 },
	vibes: ['work-friendly', 'cozy', 'outdoors', 'social'],
	price: 2,
	favourite: true,
	locality: 'South Austin',
	hours: hours('Mo-Su 07:00-24:00'),
})
const nickel = place({
	id: 'p2',
	name: 'Nickel City',
	category: 'bar',
	point: { lng: -97.7281, lat: 30.2686 },
	vibes: ['catch-up', 'lively', 'late-night'],
	price: 1,
	hours: hours('Mo-Su 12:00-02:00'),
})
const zilker = place({
	id: 'p3',
	name: 'Zilker Park',
	category: 'park',
	point: { lng: -97.7669, lat: 30.2677 },
	vibes: ['read', 'calm', 'quiet', 'outdoors'],
	alcoholFree: true,
	favourite: true,
})
const cuvee = place({
	id: 'p4',
	name: 'Cuvée Coffee',
	category: 'cafe',
	vibes: ['deep-work', 'calm', 'industrial'],
	price: 2,
	alcoholFree: true,
	hours: { source: 'website', asOf: '2026-09-29T12:00:00Z', text: 'ring the bell' },
})
const all = [cosmic, nickel, zilker, cuvee]
const home = { lng: -97.73, lat: 30.31 }
const names = (filter: Partial<PlaceFilter>, context = {}) =>
	filterPlaces(all, { ...EMPTY_FILTER, ...filter }, { origin: home, ...context }).map((entry) => entry.name)

describe('filterPlaces', () => {
	it('keeps everything with no filter on, nearest first, and what has no point last', () => {
		expect(names({})).toEqual(['Nickel City', 'Zilker Park', 'Cosmic Coffee', 'Cuvée Coffee'])
		expect(isFiltering(EMPTY_FILTER)).toBe(false)
	})

	it('takes any of the vibes within a facet', () => {
		expect(names({ vibes: ['cozy', 'calm'] })).toEqual(['Zilker Park', 'Cosmic Coffee', 'Cuvée Coffee'])
	})

	it('takes one from every facet that has a vibe on', () => {
		// mood: cozy or calm; setting: outdoors
		expect(names({ vibes: ['cozy', 'calm', 'outdoors'] })).toEqual(['Zilker Park', 'Cosmic Coffee'])
		// purpose: deep work; setting: outdoors. Nothing is both
		expect(names({ vibes: ['deep-work', 'outdoors'] })).toEqual([])
	})

	it('files a custom vibe under its own facet, and ignores an id nobody knows', () => {
		const custom = [{ id: '01HX', label: 'Dog-friendly', facet: 'crowd' as const }]
		const dogs = { ...zilker, vibes: [...zilker.vibes, '01HX'] }
		const found = filterPlaces(
			[cosmic, dogs],
			{ ...EMPTY_FILTER, vibes: ['01HX', 'outdoors'] },
			{ customVibes: custom }
		)
		expect(found.map((entry) => entry.name)).toEqual(['Zilker Park'])
		expect(matches(cosmic, { ...EMPTY_FILTER, vibes: ['no-such-vibe'] })).toBe(true)
	})

	it('narrows by category, price, favourites and alcohol-free', () => {
		expect(names({ categories: ['cafe', 'park'] })).toEqual(['Zilker Park', 'Cosmic Coffee', 'Cuvée Coffee'])
		expect(names({ prices: [1] })).toEqual(['Nickel City'])
		// a place with no price is not a cheap one
		expect(names({ prices: [1, 2] })).not.toContain('Zilker Park')
		expect(names({ favourites: true })).toEqual(['Zilker Park', 'Cosmic Coffee'])
		expect(names({ alcoholFree: true })).toEqual(['Zilker Park', 'Cuvée Coffee'])
	})

	it('measures distance from the origin, and leaves out what has no point', () => {
		expect(names({ maxKm: 6 })).toEqual(['Nickel City', 'Zilker Park'])
		expect(names({ maxKm: 50 })).toEqual(['Nickel City', 'Zilker Park', 'Cosmic Coffee'])
		expect(names({ maxKm: 6 }, { origin: undefined })).toEqual([])
	})

	it('keeps only what is known to be open', () => {
		const morning = { now: new Date('2026-09-30T07:40:00-05:00'), timeZone: 'America/Chicago' }
		// the bar opens at noon, the park has no hours, and the cafe's hours did not parse
		expect(names({ openNow: true }, morning)).toEqual(['Cosmic Coffee'])
		const late = { now: new Date('2026-09-30T01:00:00-05:00'), timeZone: 'America/Chicago' }
		expect(names({ openNow: true }, late)).toEqual(['Nickel City'])
	})

	it('keeps to a collection', () => {
		const collections = [{ id: 'c1', name: 'Coworking', placeIds: ['p1', 'p4'] }]
		expect(names({ collection: 'c1' }, { collections })).toEqual(['Cosmic Coffee', 'Cuvée Coffee'])
		expect(names({ collection: 'gone' }, { collections })).toEqual([])
	})

	it('finds every word of the free text, case and accents aside, in a vibe’s name too', () => {
		expect(names({ text: 'cuvee' })).toEqual(['Cuvée Coffee'])
		expect(names({ text: 'COFFEE south' })).toEqual(['Cosmic Coffee'])
		expect(names({ text: 'late night' }, { vibeLabel: (id: string) => id.replace('-', ' ') })).toEqual(['Nickel City'])
		expect(names({ text: 'coffee jazz' })).toEqual([])
	})
})

describe('the filter as it is kept', () => {
	it('counts what is on', () => {
		expect(filterCount({ ...EMPTY_FILTER, vibes: ['cozy', 'calm'], openNow: true, maxKm: 5 })).toBe(4)
	})
	it('reads back only what a filter holds', () => {
		expect(asFilter(null)).toEqual(EMPTY_FILTER)
		expect(
			asFilter({ vibes: ['cozy', 3], prices: [2, 9], maxKm: -1, openNow: 'yes', favourites: true, text: 4 })
		).toEqual({
			...EMPTY_FILTER,
			vibes: ['cozy'],
			prices: [2],
			favourites: true,
		})
	})
})
