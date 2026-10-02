// The filter over saved places (D-133): local and instant, with no key and no network. Within a facet a place needs
// any one of the vibes that are on; across facets it needs one from each facet that has any on. The practical
// filters each narrow further. "Open now" keeps only what is known to be open: a place whose hours did not parse is
// left out while it is on, since the page cannot say it is open.
import { formatAddress } from '../../address/index.js'
import { haversineKm, type LngLat } from '../../geo/index.js'
import { readCategory } from './categories.js'
import { isOpenAt } from './hours.js'
import { FACETS, type Collection, type CustomVibe, type PlaceFilter, type SavedPlace } from './types.js'
import { facetOf } from './vibes.js'

export interface FilterContext {
	/** Where distances are measured from: home, or the area the owner searched. */
	origin?: LngLat
	collections?: readonly Collection[]
	customVibes?: readonly CustomVibe[]
	/** The instant "open now" is asked at, and the zone the places keep their clocks in. */
	now?: Date | number
	timeZone?: string
	/** A vibe's name in the owner's language, for the free-text line. */
	vibeLabel?: (id: string) => string
}

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** The words of the free-text line, folded: case, accents and extra spaces aside. */
export function filterWords(text: string): string[] {
	return fold(text).split(/\s+/).filter(Boolean)
}

/** Whether any filter is on. */
export function isFiltering(filter: PlaceFilter): boolean {
	return (
		filter.vibes.length > 0 ||
		filter.categories.length > 0 ||
		filter.prices.length > 0 ||
		filter.maxKm !== undefined ||
		filter.collection !== undefined ||
		filter.alcoholFree ||
		filter.openNow ||
		filter.favourites ||
		filter.text.trim().length > 0
	)
}

/** How many filters are on, for the chip that opens them on a phone. */
export function filterCount(filter: PlaceFilter): number {
	return (
		filter.vibes.length +
		filter.categories.length +
		filter.prices.length +
		[
			filter.maxKm !== undefined,
			filter.collection !== undefined,
			filter.alcoholFree,
			filter.openNow,
			filter.favourites,
		].filter(Boolean).length
	)
}

/** How far a place is from the origin, in kilometres; nothing when either has no point. */
export function distanceKm(place: { point?: LngLat }, origin: LngLat | undefined): number | undefined {
	return place.point && origin ? haversineKm(origin, place.point) : undefined
}

/** Whether a place's hours are known to make it open at the instant asked. */
export function openNow(place: SavedPlace, now: Date, timeZone: string): boolean {
	return place.hours?.spec ? isOpenAt(place.hours.spec, now, timeZone) : false
}

export function matches(place: SavedPlace, filter: PlaceFilter, context: FilterContext = {}): boolean {
	for (const facet of FACETS) {
		const on = filter.vibes.filter((vibe) => facetOf(vibe, context.customVibes) === facet)
		if (on.length && !on.some((vibe) => place.vibes.includes(vibe))) return false
	}
	if (filter.categories.length && !filter.categories.includes(place.category ?? 'venue')) return false
	if (filter.prices.length && !(place.price !== undefined && filter.prices.includes(place.price))) return false
	if (filter.maxKm !== undefined) {
		const km = distanceKm(place, context.origin)
		if (km === undefined || km > filter.maxKm) return false
	}
	if (filter.collection !== undefined) {
		const collection = context.collections?.find((entry) => entry.id === filter.collection)
		if (!collection?.placeIds.includes(place.id)) return false
	}
	if (filter.alcoholFree && place.alcoholFree !== true) return false
	if (filter.favourites && !place.favourite) return false
	if (filter.openNow && !openNow(place, new Date(context.now ?? Date.now()), context.timeZone ?? 'UTC')) return false
	const words = filterWords(filter.text)
	if (words.length) {
		const hay = fold(
			[
				place.name,
				place.notes,
				place.locality,
				formatAddress(place.address),
				place.category,
				...place.vibes.map((vibe) => context.vibeLabel?.(vibe) ?? vibe),
			]
				.filter(Boolean)
				.join(' ')
		)
		if (!words.every((word) => hay.includes(word))) return false
	}
	return true
}

/** The places a filter leaves, nearest the origin first; those with no point last, by name. */
export function filterPlaces(
	places: readonly SavedPlace[],
	filter: PlaceFilter,
	context: FilterContext = {}
): SavedPlace[] {
	return places
		.filter((place) => matches(place, filter, context))
		.map((place) => ({ place, km: distanceKm(place, context.origin) }))
		.sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity) || a.place.name.localeCompare(b.place.name))
		.map((entry) => entry.place)
}

/** A filter read back from where it was kept: anything that is not one is the empty filter's. */
export function asFilter(value: unknown): PlaceFilter {
	const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
	const strings = (list: unknown) =>
		Array.isArray(list) ? list.filter((entry): entry is string => typeof entry === 'string') : []
	const prices = (Array.isArray(raw.prices) ? raw.prices : []).filter(
		(price): price is 1 | 2 | 3 | 4 => price === 1 || price === 2 || price === 3 || price === 4
	)
	return {
		vibes: strings(raw.vibes),
		categories: strings(raw.categories).map(readCategory),
		prices,
		...(typeof raw.maxKm === 'number' && raw.maxKm > 0 ? { maxKm: raw.maxKm } : {}),
		...(typeof raw.collection === 'string' ? { collection: raw.collection } : {}),
		alcoholFree: raw.alcoholFree === true,
		openNow: raw.openNow === true,
		favourites: raw.favourites === true,
		text: typeof raw.text === 'string' ? raw.text.slice(0, 200) : '',
	}
}
