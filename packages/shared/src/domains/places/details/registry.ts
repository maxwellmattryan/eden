// The detail sources, in the order each slot tries them (D-128). OpenStreetMap first for hours, since it answers a
// structured string from a public id; then the place's own page; then what the search itself wrote, which asks
// nothing. A keyed source for `rating` or `card` (OQ-24) is another entry here.
import { parseOpeningHours } from '../hours.js'
import type { DetailSlot } from '../types.js'
import { osmHours } from './osm-hours.js'
import type { DetailData, DetailSource, PlaceRef } from './types.js'
import { websiteHours, websitePhoto } from './website.js'

/** What a web search wrote of a place's hours: no request, just the words, parsed when they can be. */
export const searchHours: DetailSource<'hours'> = {
	id: 'search',
	slot: 'hours',
	name: 'search',
	covers: (place) => !!place.hoursText?.trim(),
	async fetch(place) {
		const text = place.hoursText?.trim()
		if (!text) return null
		const spec = parseOpeningHours(text)
		return { text: text.slice(0, 400), ...(spec ? { spec } : {}) }
	},
}

export const DETAIL_SOURCES: readonly DetailSource[] = [osmHours, websiteHours, searchHours, websitePhoto]

/** The sources of a slot that are on and cover the place, in order. */
export function sourcesFor<S extends DetailSlot>(
	slot: S,
	place: PlaceRef,
	off: readonly string[] = [],
	sources: readonly DetailSource[] = DETAIL_SOURCES
): DetailSource<S>[] {
	return sources.filter(
		(source): source is DetailSource<S> => source.slot === slot && !off.includes(source.id) && source.covers(place)
	)
}

export interface DetailAnswer<S extends DetailSlot> {
	status: 'ok' | 'unavailable' | 'failed'
	/** The source that answered, or the last one that was tried. */
	source?: string
	data?: DetailData[S]
}

/**
 * One slot of one place: its sources tried in order until one answers. `unavailable` when none covers the place or
 * none had anything to say; `failed` when the last one tried could not be asked. Never throws.
 */
export async function fetchDetail<S extends DetailSlot>(
	slot: S,
	place: PlaceRef,
	context: { lang: string; off?: readonly string[]; sources?: readonly DetailSource[] }
): Promise<DetailAnswer<S>> {
	let failed: string | undefined
	let tried: string | undefined
	for (const source of sourcesFor(slot, place, context.off, context.sources)) {
		tried = source.id
		try {
			const data = await source.fetch(place, { lang: context.lang })
			if (data) return { status: 'ok', source: source.id, data }
		} catch {
			failed = source.id
		}
	}
	return failed && failed === tried ? { status: 'failed', source: failed } : { status: 'unavailable', source: tried }
}
