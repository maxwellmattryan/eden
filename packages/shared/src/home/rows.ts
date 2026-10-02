// Between the home and its row (D-141): home is the one Place of kind `home` (D-38). Its `address` column holds
// the address's parts (D-138), and the area a model may be told of (city, region, country) is read from them.
import {
	cleanAddress,
	countryCode,
	countryName,
	encodeAddress,
	readAddress,
	regionName,
	type Address,
} from '../address/index.js'
import type { PlaceInput, PlacePatch, PlaceRow } from '../data/types.js'
import type { LngLat } from '../geo/coordinates.js'
import type { HomeArea, HomePlace } from '../types/index.js'

/** The home: where it is, what it is called, and its address when the owner gave one. No `id` until it has a row. */
export interface Home extends HomePlace {
	id?: string
	/** T2: kept on the device, never sent to a model. */
	address?: Address
}

/** What the owner sets when they change their home. */
export interface HomeDraft {
	label: string
	/** The exact point; only its rounding ever leaves the device (D-60). */
	point: LngLat
	address?: Address
}

/** The area an address is in, in words: nothing without a city. */
export function areaOf(address: Address | undefined): HomeArea | undefined {
	if (!address?.city) return undefined
	return {
		city: address.city,
		region: regionName(address.country, address.region),
		country: address.country ? countryName(address.country) : '',
	}
}

/** The home a row holds; nothing for a row with no point. */
export function homeFromRow(row: PlaceRow): Home | undefined {
	if (row.lat === null || row.lng === null) return undefined
	const address = readAddress(row.address)
	const area = areaOf(address)
	return {
		id: row.id,
		label: row.name,
		latitude: row.lat,
		longitude: row.lng,
		...(address ? { address } : {}),
		...(area ? { area } : {}),
	}
}

export const draftOf = (home: Home): HomeDraft => ({
	label: home.label,
	point: { lng: home.longitude, lat: home.latitude },
	...(home.address ? { address: home.address } : {}),
})

export const homeInput = (draft: HomeDraft): PlaceInput => ({
	kind: 'home',
	name: draft.label.trim(),
	lat: draft.point.lat,
	lng: draft.point.lng,
	...(encodeAddress(draft.address) ? { address: encodeAddress(draft.address) } : {}),
})

export const homePatch = (draft: HomeDraft): PlacePatch => ({
	name: draft.label.trim(),
	lat: draft.point.lat,
	lng: draft.point.lng,
	address: encodeAddress(draft.address) || null,
})

/** What Sky keeps of the home beside a forecast: its name, its point and its area, never its address. */
export function forecastPlace(home: Home): HomePlace {
	const { label, latitude, longitude, area } = home
	return { label, latitude, longitude, ...(area ? { area: { ...area } } : {}) }
}

/**
 * The home as it was kept before it had a row: the `eden:home` setting, a label and a point with the area the
 * city search named. Nothing for a value that is not one.
 */
export function legacyHome(json: string | null): HomeDraft | undefined {
	let parsed: unknown
	try {
		parsed = JSON.parse(json ?? 'null')
	} catch {
		return undefined
	}
	const place = parsed as Partial<HomePlace> | null
	if (
		typeof place !== 'object' ||
		place === null ||
		typeof place.label !== 'string' ||
		!place.label.trim() ||
		!Number.isFinite(place.latitude) ||
		!Number.isFinite(place.longitude)
	) {
		return undefined
	}
	const area = place.area as Partial<HomeArea> | undefined
	const address =
		area && typeof area.city === 'string'
			? cleanAddress({
					country: typeof area.country === 'string' ? countryCode(area.country) : undefined,
					city: area.city,
					region: typeof area.region === 'string' ? area.region : undefined,
				})
			: undefined
	return {
		label: place.label,
		point: { lng: place.longitude as number, lat: place.latitude as number },
		...(address ? { address } : {}),
	}
}

/** What reading the home needs of the device; a test stands in for each. */
export interface HomeIo {
	query(): Promise<PlaceRow[]>
	create(input: PlaceInput): Promise<PlaceRow>
	/** The old setting as it is stored, and its removal. */
	legacy(): string | null
	clear(): void
}

/**
 * The home's row. A home still kept as the old setting is given its row here, once: the guard is that no row
 * exists while the setting does, not a marker, so a bundle from before the change brings its home with it.
 * Nothing when the owner has never chosen one.
 */
export async function resolveHome(io: HomeIo): Promise<Home | undefined> {
	const [row] = await io.query()
	const kept = io.legacy()
	if (row) {
		if (kept !== null) io.clear()
		return homeFromRow(row)
	}
	const draft = legacyHome(kept)
	if (!draft) return undefined
	const made = await io.create(homeInput(draft))
	io.clear()
	return homeFromRow(made)
}
