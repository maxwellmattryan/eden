// Where Meadow measures from (D-131). Home is the `home` Place (D-38, D-141), held by the home store; this is
// the one function in Meadow that reads it. `point` is the rounded one, the same that leaves the device (D-60): the
// map opens on it and searches look near it. `exact` is where the home is, for what never leaves: its pin and the
// distances from it (D-142).
import { roundedPoint, type LngLat } from '../../geo/index.js'
import { home } from '../../home/store.svelte.js'
import type { SearchArea } from './types.js'

export interface HomeReading {
	label: string
	point: LngLat
	exact: LngLat
	city?: string
	region?: string
	country?: string
}

/** Home as Meadow may use it: its label, its point exact and rounded, and the area its address names. */
export function readHome(): HomeReading {
	const { label, latitude, longitude, area } = home.current
	const exact = { lng: longitude, lat: latitude }
	return {
		label,
		point: roundedPoint(exact),
		exact,
		...(area?.city ? { city: area.city } : {}),
		...(area?.region ? { region: area.region } : {}),
		...(area?.country ? { country: area.country } : {}),
	}
}

/** The point a search area is centred on. */
export function areaPoint(area: SearchArea): LngLat {
	return area.kind === 'named' ? roundedPoint(area.point) : readHome().point
}

/** A search area in words a model or a page can be given: a city and its region, never a coordinate. */
export function areaWords(area: SearchArea): string {
	if (area.kind === 'named') return [area.city ?? area.label, area.region].filter(Boolean).join(', ')
	const home = readHome()
	return [home.city ?? home.label, home.region].filter(Boolean).join(', ')
}

/** A search area read back from where it was kept. */
export function asArea(value: unknown): SearchArea {
	const raw = value as Partial<Extract<SearchArea, { kind: 'named' }>> | null
	if (
		raw &&
		raw.kind === 'named' &&
		typeof raw.label === 'string' &&
		raw.point &&
		Number.isFinite(raw.point.lng) &&
		Number.isFinite(raw.point.lat)
	) {
		return {
			kind: 'named',
			label: raw.label,
			point: { lng: raw.point.lng, lat: raw.point.lat },
			...(typeof raw.city === 'string' ? { city: raw.city } : {}),
			...(typeof raw.region === 'string' ? { region: raw.region } : {}),
			...(typeof raw.country === 'string' ? { country: raw.country } : {}),
		}
	}
	return { kind: 'home' }
}
