// Photon (photon.komoot.io), a geocoder over OpenStreetMap that needs no key (D-128): a name in, places out. It is
// given the name and a point to look near, rounded to two decimals as every outgoing coordinate is (D-60, D-131), and
// never where the owner is. Its terms ask for moderate use, so callers go through `throttle` at one request a second.
import { getJson } from '../egress/fetch.js'
import { rounded, withinBounds, type LngLat } from './coordinates.js'
import type { GeocodeHit, GeocodeQuery, Geocoder } from './types.js'

export const PHOTON_URL = 'https://photon.komoot.io/api/'
/** The languages Photon names things in; any other is left to its default. */
const LANGUAGES = ['en', 'de', 'fr']

interface PhotonFeature {
	geometry?: { coordinates?: [number, number] }
	properties?: {
		name?: string
		osm_type?: string
		osm_id?: number
		osm_key?: string
		osm_value?: string
		housenumber?: string
		street?: string
		district?: string
		locality?: string
		city?: string
		state?: string
		country?: string
	}
}

/** The address a request is made at: the name, the rounded point to look near, and the box to stay inside. */
export function photonUrl(query: GeocodeQuery): string {
	const params = new URLSearchParams({ q: query.text.trim(), limit: String(Math.min(10, query.limit ?? 5)) })
	if (query.near) {
		params.set('lat', rounded(query.near.lat))
		params.set('lon', rounded(query.near.lng))
	}
	if (query.within) {
		const { west, south, east, north } = query.within
		params.set('bbox', [west, south, east, north].map(rounded).join(','))
	}
	const lang = (query.lang ?? '').toLowerCase().split('-')[0] ?? ''
	if (LANGUAGES.includes(lang)) params.set('lang', lang)
	return `${PHOTON_URL}?${params.toString()}`
}

/** One answer as a hit; nothing for an answer with no name or no point. */
export function photonHit(feature: PhotonFeature): GeocodeHit | undefined {
	const properties = feature.properties ?? {}
	const [lng, lat] = feature.geometry?.coordinates ?? []
	if (!properties.name || typeof lng !== 'number' || typeof lat !== 'number') return undefined
	const point: LngLat = { lng, lat }
	const line = [properties.housenumber, properties.street].filter(Boolean).join(' ')
	return {
		name: properties.name,
		point,
		source: 'osm',
		// the object's type and number, as OpenStreetMap writes them together: N123, W456, R789
		externalId: `${(properties.osm_type ?? 'N').toUpperCase()}${properties.osm_id ?? ''}`,
		...(properties.osm_key && properties.osm_value ? { kind: `${properties.osm_key}:${properties.osm_value}` } : {}),
		...(line ? { addressLine: line } : {}),
		...(properties.district || properties.locality
			? { locality: properties.district ?? properties.locality }
			: properties.city
				? { locality: properties.city }
				: {}),
		...(properties.state ? { region: properties.state } : {}),
		...(properties.country ? { country: properties.country } : {}),
	}
}

type Get = <T>(source: string, destination: 'photon', url: string) => Promise<T>

/** Photon as a geocoder; `get` is the request, which a test replaces. */
export function createPhoton(get: Get = getJson): Geocoder {
	return {
		id: 'photon',
		name: 'Photon',
		destination: 'photon',
		async search(query) {
			if (!query.text.trim()) return []
			const answer = await get<{ features?: PhotonFeature[] }>('Photon', 'photon', photonUrl(query))
			return (answer.features ?? [])
				.flatMap((feature) => photonHit(feature) ?? [])
				.filter((hit) => !query.within || withinBounds(hit.point, query.within))
		},
	}
}

export const photon = createPhoton()
