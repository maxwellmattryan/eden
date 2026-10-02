// What kind of place a place is. The `venue` Place's `category` is free text in the substrate; Meadow keeps it to
// these, so a filter has something to hold and a row without a picture has a glyph. A source's own word for a place
// (OpenStreetMap's `amenity=cafe`) is read into one of them.
import type { IconName } from '@eden/ui-kit'

export const PLACE_CATEGORIES = [
	'cafe',
	'restaurant',
	'bar',
	'park',
	'museum',
	'music',
	'shop',
	'library',
	'venue',
] as const
export type PlaceCategory = (typeof PLACE_CATEGORIES)[number]

export const CATEGORY_GLYPHS: Readonly<Record<PlaceCategory, IconName>> = {
	cafe: 'cup-soda',
	restaurant: 'soup',
	bar: 'moon',
	park: 'tree-deciduous',
	museum: 'palette',
	music: 'ticket',
	shop: 'store',
	library: 'book-open',
	venue: 'map-pin',
}

export const categoryKey = (category: string) => `domains.places.categories.${category}`

export function isCategory(value: unknown): value is PlaceCategory {
	return typeof value === 'string' && (PLACE_CATEGORIES as readonly string[]).includes(value)
}

/** The glyph of a place's category; the plain pin for one with none, or with one Meadow does not know. */
export function categoryGlyph(category: string | undefined): IconName {
	return isCategory(category) ? CATEGORY_GLYPHS[category] : 'map-pin'
}

const OSM: Readonly<Record<string, PlaceCategory>> = {
	'amenity:cafe': 'cafe',
	'shop:coffee': 'cafe',
	'shop:tea': 'cafe',
	'amenity:restaurant': 'restaurant',
	'amenity:fast_food': 'restaurant',
	'amenity:food_court': 'restaurant',
	'amenity:ice_cream': 'restaurant',
	'shop:bakery': 'restaurant',
	'amenity:bar': 'bar',
	'amenity:pub': 'bar',
	'amenity:biergarten': 'bar',
	'amenity:nightclub': 'bar',
	'craft:brewery': 'bar',
	'leisure:park': 'park',
	'leisure:garden': 'park',
	'leisure:nature_reserve': 'park',
	'leisure:playground': 'park',
	'natural:beach': 'park',
	'tourism:museum': 'museum',
	'tourism:gallery': 'museum',
	'amenity:arts_centre': 'museum',
	'amenity:theatre': 'music',
	'amenity:music_venue': 'music',
	'amenity:cinema': 'music',
	'amenity:library': 'library',
	'shop:books': 'shop',
}

/** The category of a thing OpenStreetMap describes by a key and a value (`amenity:cafe`). */
export function categoryFromOsm(kind: string | undefined): PlaceCategory {
	if (!kind) return 'venue'
	const known = OSM[kind.toLowerCase()]
	if (known) return known
	return kind.toLowerCase().startsWith('shop:') ? 'shop' : 'venue'
}

/** A category a model or a form wrote, held to the list; `venue` for anything else. */
export function asCategory(value: unknown): PlaceCategory {
	if (isCategory(value)) return value
	const word = typeof value === 'string' ? value.trim().toLowerCase() : ''
	if (/coffee|caf[eé]|tea/.test(word)) return 'cafe'
	if (/restaurant|food|diner|eatery|bakery|pizz|taco/.test(word)) return 'restaurant'
	if (/bar|pub|brew|club|lounge|wine/.test(word)) return 'bar'
	if (/park|garden|trail|beach|lake/.test(word)) return 'park'
	if (/museum|gallery|art/.test(word)) return 'museum'
	if (/music|theat|cinema|venue|concert/.test(word)) return 'music'
	if (/librar/.test(word)) return 'library'
	if (/shop|store|market|book/.test(word)) return 'shop'
	return 'venue'
}
