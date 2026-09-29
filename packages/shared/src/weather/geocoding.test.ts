import { describe, expect, it } from 'vitest'
import { homeFrom, normalizePlaces, searchPlaces, searchUrl } from './geocoding.js'

describe('searchUrl', () => {
	it('sends the name and the language, trimmed', () => {
		const url = new URL(searchUrl('  Austin ', 'ja'))
		expect(url.searchParams.get('name')).toBe('Austin')
		expect(url.searchParams.get('language')).toBe('ja')
		expect([...url.searchParams.keys()].sort()).toEqual(['count', 'format', 'language', 'name'])
	})
})

describe('normalizePlaces', () => {
	it('names the region and the country', () => {
		const places = normalizePlaces({
			results: [
				{
					id: 4671654,
					name: 'Austin',
					latitude: 30.26715,
					longitude: -97.74306,
					admin1: 'Texas',
					country: 'United States',
				},
				{ id: 1, name: 'Singapore', latitude: 1.29, longitude: 103.85, country: 'Singapore' },
			],
		})
		expect(places[0]).toEqual({
			id: '4671654',
			name: 'Austin',
			region: 'Texas, United States',
			latitude: 30.26715,
			longitude: -97.74306,
		})
		expect(places[1]?.region).toBe('')
	})

	it('keeps the towns and cities, and everything when there is none', () => {
		const town = { id: 1, name: 'Kyoto', latitude: 35.02, longitude: 135.75, feature_code: 'PPLA' }
		const heliport = { id: 2, name: 'Kyoto Heliport', latitude: 34.9, longitude: 135.7, feature_code: 'AIRH' }
		expect(normalizePlaces({ results: [heliport, town] }).map((place) => place.name)).toEqual(['Kyoto'])
		expect(normalizePlaces({ results: [heliport] }).map((place) => place.name)).toEqual(['Kyoto Heliport'])
	})

	it('is empty when nothing was found', () => {
		expect(normalizePlaces({})).toEqual([])
	})

	it('makes a result the home place', () => {
		const [place] = normalizePlaces({ results: [{ id: 2, name: 'Kyoto', latitude: 35.02, longitude: 135.75 }] })
		expect(homeFrom(place!)).toEqual({ label: 'Kyoto', latitude: 35.02, longitude: 135.75 })
	})
})

describe('searchPlaces', () => {
	it('asks nothing for a query too short to search', async () => {
		expect(await searchPlaces(' a ', 'en')).toEqual([])
	})
})
