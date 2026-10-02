import { describe, expect, it } from 'vitest'
import { boundsAround } from './coordinates.js'
import { createPhoton, photonHit, photonUrl } from './photon.js'

const home = { lng: -97.734987, lat: 30.305123 }
const feature = (name: string, lng: number, lat: number, extra: Record<string, unknown> = {}) => ({
	geometry: { coordinates: [lng, lat] as [number, number] },
	properties: { name, osm_type: 'W', osm_id: 929874401, osm_key: 'amenity', osm_value: 'cafe', ...extra },
})

describe('photonUrl', () => {
	it('sends the name and a point rounded to two decimals, never the point itself (D-60)', () => {
		const url = new URL(photonUrl({ text: ' Cosmic Coffee ', near: home, lang: 'en-US', limit: 3 }))
		expect(url.origin + url.pathname).toBe('https://photon.komoot.io/api/')
		expect(Object.fromEntries(url.searchParams)).toEqual({
			q: 'Cosmic Coffee',
			limit: '3',
			lat: '30.31',
			lon: '-97.73',
			lang: 'en',
		})
		expect(url.href).not.toContain('30.305')
		expect(url.href).not.toContain('97.7349')
	})

	it('rounds the box it stays inside, and leaves out a language Photon does not name things in', () => {
		const url = new URL(photonUrl({ text: 'Radio Coffee', within: boundsAround(home, 40), lang: 'ja' }))
		const box = url.searchParams.get('bbox')!.split(',')
		expect(box).toHaveLength(4)
		for (const side of box) expect(side).toMatch(/^-?\d+\.\d{2}$/)
		expect(url.searchParams.has('lang')).toBe(false)
		expect(url.searchParams.has('lat')).toBe(false)
	})
})

describe('photonHit', () => {
	it('reads a place with its OpenStreetMap id, its kind and its address', () => {
		expect(
			photonHit(
				feature('Sour Duck Market', -97.7215781, 30.2799428, {
					osm_value: 'restaurant',
					osm_id: 382296728,
					housenumber: '1814',
					street: 'East Martin Luther King Jr Boulevard',
					city: 'Austin',
					state: 'Texas',
					country: 'United States',
				})
			)
		).toEqual({
			name: 'Sour Duck Market',
			point: { lng: -97.7215781, lat: 30.2799428 },
			source: 'osm',
			externalId: 'W382296728',
			kind: 'amenity:restaurant',
			addressLine: '1814 East Martin Luther King Jr Boulevard',
			locality: 'Austin',
			region: 'Texas',
			country: 'United States',
		})
	})

	it('answers nothing for what has no name or no point', () => {
		expect(photonHit({ properties: { name: 'Nowhere' } })).toBeUndefined()
		expect(photonHit({ geometry: { coordinates: [1, 2] }, properties: {} })).toBeUndefined()
	})
})

describe('the geocoder', () => {
	it('answers the hits inside the box, and asks nothing for an empty name', async () => {
		const asked: string[] = []
		const photon = createPhoton(async <T>(_source: string, destination: string, url: string) => {
			asked.push(`${destination} ${url}`)
			return {
				features: [
					feature('Cosmic Coffee + Beer Garden', -97.7626281, 30.2268918),
					feature('Cosmic Coffee', -77.2023331, 39.1186152),
					{ properties: { name: 'No point' } },
				],
			} as T
		})
		const hits = await photon.search({ text: 'Cosmic Coffee', near: home, within: boundsAround(home, 40) })
		expect(hits.map((hit) => hit.name)).toEqual(['Cosmic Coffee + Beer Garden'])
		expect(asked).toHaveLength(1)
		expect(asked[0]).toMatch(/^photon https:\/\/photon\.komoot\.io\/api\/\?q=Cosmic\+Coffee/)
		expect(await photon.search({ text: '   ' })).toEqual([])
		expect(asked).toHaveLength(1)
	})
})
