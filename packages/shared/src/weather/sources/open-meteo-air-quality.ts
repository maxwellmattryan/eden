// Open-Meteo's air quality API as two supplementary sources (D-59), both keyless: the air quality index with its
// pollutants, worldwide, and pollen where the CAMS European model reaches. Outside Europe every pollen figure comes
// back null, which reads as "no coverage", not as a failure. Neither carries mold.
import { rounded } from '../coordinates.js'
import type { AirQuality, Allergen, AllergenKind, AllergenLevel } from '../model.js'
import { getJson, type AirQualitySource, type AllergenSource } from '../provider.js'
import type { HomePlace } from '../../types/index.js'

export const OPEN_METEO_AIR = 'Open-Meteo, CAMS'
const ENDPOINT = 'https://air-quality-api.open-meteo.com/v1/air-quality'

export interface OpenMeteoAirResponse {
	current: Partial<Record<AirField | PollenField, number | null>>
}
type AirField = 'us_aqi' | 'european_aqi' | 'pm2_5' | 'pm10' | 'ozone' | 'nitrogen_dioxide'
type PollenField =
	'alder_pollen' | 'birch_pollen' | 'grass_pollen' | 'mugwort_pollen' | 'olive_pollen' | 'ragweed_pollen'

const AIR_FIELDS: readonly AirField[] = ['us_aqi', 'european_aqi', 'pm2_5', 'pm10', 'ozone', 'nitrogen_dioxide']
const POLLEN: readonly { field: PollenField; kind: AllergenKind; scale: 'tree' | 'grass' }[] = [
	{ field: 'alder_pollen', kind: 'alder', scale: 'tree' },
	{ field: 'birch_pollen', kind: 'birch', scale: 'tree' },
	{ field: 'olive_pollen', kind: 'olive', scale: 'tree' },
	{ field: 'grass_pollen', kind: 'grass', scale: 'grass' },
	{ field: 'mugwort_pollen', kind: 'mugwort', scale: 'grass' },
	{ field: 'ragweed_pollen', kind: 'ragweed', scale: 'grass' },
]
/**
 * Grains per cubic metre at which a level begins (low, moderate, high, very high), after the UK Met Office's bands
 * for birch and for grass; the other trees read on birch's scale and the weeds on grass's. An approximation: a
 * person's threshold differs.
 */
const SCALE: Record<'tree' | 'grass', readonly [number, number, number, number]> = {
	tree: [1, 40, 80, 200],
	grass: [1, 30, 50, 150],
}

export function airUrl(place: HomePlace, fields: readonly string[]): string {
	const query = new URLSearchParams({
		latitude: rounded(place.latitude),
		longitude: rounded(place.longitude),
		current: fields.join(','),
		timezone: 'auto',
		timeformat: 'unixtime',
	})
	return `${ENDPOINT}?${query}`
}

/** The level a grain count reads as on a scale. */
export function pollenLevel(grains: number, scale: 'tree' | 'grass'): AllergenLevel {
	const [low, moderate, high, veryHigh] = SCALE[scale]
	if (grains >= veryHigh) return 'very-high'
	if (grains >= high) return 'high'
	if (grains >= moderate) return 'moderate'
	if (grains >= low) return 'low'
	return 'none'
}

/** The air as the model; null when the response carries no index at all. */
export function normalizeAirQuality(raw: OpenMeteoAirResponse): AirQuality | null {
	const current = raw.current ?? {}
	if (current.us_aqi == null && current.european_aqi == null) return null
	return {
		usAqi: current.us_aqi ?? null,
		europeanAqi: current.european_aqi ?? null,
		pm25: current.pm2_5 ?? null,
		pm10: current.pm10 ?? null,
		ozone: current.ozone ?? null,
		no2: current.nitrogen_dioxide ?? null,
	}
}

/** The pollen as the model; null when every figure is null, which is a place the model does not cover. */
export function normalizePollen(raw: OpenMeteoAirResponse): { items: Allergen[] } | null {
	const current = raw.current ?? {}
	const items = POLLEN.flatMap(({ field, kind, scale }) => {
		const grains = current[field]
		return grains == null ? [] : [{ kind, level: pollenLevel(grains, scale) }]
	})
	return items.length ? { items } : null
}

export const openMeteoAirQuality: AirQualitySource = {
	id: 'open-meteo-air-quality',
	name: OPEN_METEO_AIR,
	fetch: async (place) =>
		normalizeAirQuality(await getJson<OpenMeteoAirResponse>(OPEN_METEO_AIR, airUrl(place, AIR_FIELDS))),
}

export const openMeteoPollen: AllergenSource = {
	id: 'open-meteo-pollen',
	name: OPEN_METEO_AIR,
	fetch: async (place) =>
		normalizePollen(
			await getJson<OpenMeteoAirResponse>(
				OPEN_METEO_AIR,
				airUrl(
					place,
					POLLEN.map((pollen) => pollen.field)
				)
			)
		),
}
