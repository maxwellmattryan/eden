// Finding a place by name, to change home (product/domains/weather.md): Open-Meteo's geocoding API, keyless. What is
// sent is the name the owner typed and the language, nothing else. The place chosen is kept with the coordinates the
// service gave; what later leaves for a forecast is rounded like every coordinate (D-60).
import type { HomePlace } from '../types/index.js'
import { getJson } from './provider.js'
import { OPEN_METEO } from './providers/open-meteo.js'

export interface PlaceResult {
	id: string
	name: string
	/** The region and the country, as far as the service names them: "Texas, United States". */
	region: string
	/** The two apart, for `home-area`. */
	admin1?: string
	country?: string
	latitude: number
	longitude: number
}

export interface GeocodingResponse {
	results?: {
		id: number
		name: string
		latitude: number
		longitude: number
		admin1?: string
		country?: string
		/** GeoNames' feature code: `PPL…` is a populated place. */
		feature_code?: string
	}[]
}

const ENDPOINT = 'https://geocoding-api.open-meteo.com/v1/search'
/** Fewer letters than this find too much to be worth a request. */
export const MIN_QUERY = 2
const RESULTS = 10
const SHOWN = 6

export function searchUrl(query: string, language: string): string {
	const params = new URLSearchParams({ name: query.trim(), count: String(RESULTS), language, format: 'json' })
	return `${ENDPOINT}?${params}`
}

/**
 * The service's answer as places: the towns and cities among them, since home is somewhere people live, and
 * everything it found when none is one. A result without coordinates is dropped.
 */
export function normalizePlaces(raw: GeocodingResponse): PlaceResult[] {
	const found = (raw.results ?? []).filter(
		(place) => Number.isFinite(place.latitude) && Number.isFinite(place.longitude)
	)
	const towns = found.filter((place) => place.feature_code?.startsWith('PPL'))
	return (towns.length ? towns : found).slice(0, SHOWN).map((place) => ({
		id: String(place.id),
		name: place.name,
		region: [place.admin1, place.country].filter((part) => part && part !== place.name).join(', '),
		...(place.admin1 ? { admin1: place.admin1 } : {}),
		...(place.country ? { country: place.country } : {}),
		latitude: place.latitude,
		longitude: place.longitude,
	}))
}

/** Places by name; nothing for a query too short to search. Rejects with `OfflineError` when the service cannot answer. */
export async function searchPlaces(query: string, language: string): Promise<PlaceResult[]> {
	if (query.trim().length < MIN_QUERY) return []
	return normalizePlaces(
		await getJson<GeocodingResponse>(OPEN_METEO, 'open-meteo-geocoding', searchUrl(query, language))
	)
}

/** A result as the home place. */
export function homeFrom(place: PlaceResult): HomePlace {
	return {
		label: place.name,
		latitude: place.latitude,
		longitude: place.longitude,
		area: { city: place.name, region: place.admin1 ?? '', country: place.country ?? '' },
	}
}
