// Where Meadow measures from (D-131). Home is still a setting (D-38): this is the one function that reads it, so
// when home becomes a Place row its point is read here and nowhere else (`engineering/meadow.md`, Handoffs). The
// point is the rounded one, the same that leaves the device (D-60): the map opens on it and distances are from it.
import { roundedPoint, type LngLat } from '../../geo/index.js'
import { settings } from '../../settings/index.js'
import type { SearchArea } from './types.js'

export interface HomeReading {
	label: string
	point: LngLat
	city?: string
	region?: string
	country?: string
}

/** Home as Meadow may use it: its label, its rounded point, and the area it is in when the geocoder named one. */
export function readHome(): HomeReading {
	const { label, latitude, longitude, area } = settings.home
	return {
		label,
		point: roundedPoint({ lng: longitude, lat: latitude }),
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
