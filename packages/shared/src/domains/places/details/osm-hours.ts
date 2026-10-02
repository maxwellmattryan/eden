// Opening hours from OpenStreetMap, through Overpass (D-128, D-131): the request names a public OpenStreetMap object
// by its id and nothing else. The tags it answers also say the place's own website and phone, which the page keeps
// with their source. A place with no OpenStreetMap id is not covered.
import { getJson } from '../../../egress/fetch.js'
import { httpsAddress } from '../../../api/html.js'
import { parseOpeningHours } from '../hours.js'
import type { DetailSource, HoursDetail } from './types.js'

export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

const KINDS: Readonly<Record<string, string>> = { N: 'node', W: 'way', R: 'relation' }

/** The Overpass query for one object's tags, or nothing for an id that is not one. */
export function overpassQuery(osmId: string): string | undefined {
	const match = /^([NWR])(\d{1,12})$/.exec(osmId.trim().toUpperCase())
	if (!match) return undefined
	return `[out:json][timeout:10];${KINDS[match[1]!]}(${match[2]});out tags;`
}

/** What an Overpass answer says of a place's hours; nothing when it has none. */
export function hoursFromTags(tags: Record<string, unknown> | undefined): HoursDetail | null {
	const text = typeof tags?.opening_hours === 'string' ? tags.opening_hours.trim() : ''
	if (!text) return null
	const site = [tags?.website, tags?.['contact:website']].find((value) => typeof value === 'string') as
		string | undefined
	const website = site ? httpsAddress(site) : undefined
	const phone = [tags?.phone, tags?.['contact:phone']].find((value) => typeof value === 'string') as string | undefined
	const spec = parseOpeningHours(text)
	return {
		text: text.slice(0, 400),
		...(spec ? { spec } : {}),
		...(website ? { website } : {}),
		...(phone ? { phone: phone.trim().slice(0, 40) } : {}),
	}
}

type Get = <T>(source: string, destination: 'overpass', url: string) => Promise<T>

export function createOsmHours(get: Get = getJson): DetailSource<'hours'> {
	return {
		id: 'osm-hours',
		slot: 'hours',
		name: 'osm',
		destination: 'overpass',
		covers: (place) => !!place.osmId && overpassQuery(place.osmId) !== undefined,
		async fetch(place) {
			const query = place.osmId ? overpassQuery(place.osmId) : undefined
			if (!query) return null
			const answer = await get<{ elements?: { tags?: Record<string, unknown> }[] }>(
				'Overpass',
				'overpass',
				`${OVERPASS_URL}?data=${encodeURIComponent(query)}`
			)
			return hoursFromTags(answer.elements?.[0]?.tags)
		},
	}
}

export const osmHours = createOsmHours()
