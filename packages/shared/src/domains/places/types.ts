// Meadow's shapes (product/domains/places.md; D-133). A saved place is two rows of the owner's: a `venue` Place and
// the `place-profile` linked `about` it. What is found and not saved is a mirror of this device. The payloads here
// are what the rows hold; the store joins a Place and its profile into a `SavedPlace` for the page.
import type { Address } from '../../address/index.js'
import type { LngLat } from '../../geo/index.js'
import type { WeekHours } from './hours.js'

/** The ids of Meadow's rows in the registry. */
export const MEADOW = {
	profile: 'place-profile',
	vibe: 'vibe',
	collection: 'collection',
	visit: 'visit',
	suggestion: 'place-suggestion',
	listing: 'listing',
	detail: 'place-detail',
	photo: 'place-photo',
	outing: 'outing',
	venue: 'venue',
	favoriteVibe: 'favorite-vibe',
} as const

/** A vibe belongs to one facet: within a facet a filter is any of, across facets all of. */
export const FACETS = ['purpose', 'mood', 'setting', 'crowd'] as const
export type Facet = (typeof FACETS)[number]

/** Where a reading came from, and when it was read. */
export interface Sourced {
	source: string
	/** An instant. */
	asOf: string
}

export type PriceLevel = 1 | 2 | 3 | 4
export const PRICE_LEVELS: readonly PriceLevel[] = [1, 2, 3, 4]

/** Where a saved place's hours are kept: the week when they parsed, the words as written either way. */
export type PlaceHours = Sourced & { spec?: WeekHours; text?: string }

export interface SourceLink {
	url: string
	title: string
}

/** `place-profile` (T1): what Meadow keeps about a saved `venue` Place. */
export interface PlaceProfilePayload {
	placeId: string
	/** Bundled vibe ids, or a custom vibe's row id. */
	vibes: string[]
	price?: PriceLevel
	alcoholFree?: boolean
	favourite: boolean
	notes?: string
	/** The public address, in its parts (D-138); the Place's own `address` is T2 and only ever typed by hand. */
	address?: Address
	/** The address as one line, from before it had parts: read as the first line, never written. */
	addressLine?: string
	/** The part of town, as Meadow's lists name it. */
	locality?: string
	/** The place's ids at its sources: `{ osm: 'N123' }`. */
	providerIds: Record<string, string>
	hours?: PlaceHours
	rating?: Sourced & { value: number }
	/** The id of its `place-photo` Attachment, and the small square the row shows. */
	photoId?: string
	thumb?: string
	savedFrom?: {
		via: 'suggestion' | 'import' | 'manual' | 'listing'
		why?: string
		sources?: SourceLink[]
		at: string
	}
}

/** `vibe` (T0): a custom vibe. The bundled ones are code (`vibes.ts`). */
export interface VibePayload {
	label: string
	facet: Facet
}

/** `collection` (T1). */
export interface CollectionPayload {
	name: string
	placeIds: string[]
	note?: string
}

/** `visit` (T1), linked `at` its Place. */
export interface VisitPayload {
	placeId: string
	/** `YYYY-MM-DD`. */
	day: string
	rating?: 1 | 2 | 3 | 4 | 5
	note?: string
}

/** A place a source found, before it is anybody's row. */
export interface PlaceCandidate {
	name: string
	category?: string
	/** Where the geocoder put it; a candidate with none could not be placed and gets no pin. */
	point?: LngLat
	addressLine?: string
	locality?: string
	/** Why it fits what was asked, in a sentence. */
	why?: string
	vibes: string[]
	price?: PriceLevel
	alcoholFree?: boolean
	/** Hours as the source wrote them. */
	hoursText?: string
	website?: string
	sources: SourceLink[]
	providerIds: Record<string, string>
}

/** `place-suggestion` (T1), a mirror keyed by its source and the candidate's id there. */
export interface SuggestionPayload {
	candidate: PlaceCandidate
	/** What was asked, in words. */
	query: string
	foundAt: string
	dismissed?: boolean
}

/** `listing` (T0), a mirror. */
export interface ListingPayload {
	title: string
	venueName?: string
	placeId?: string
	point?: LngLat
	/** A date for an all-day listing, an instant otherwise. */
	startAt: string
	endAt?: string
	allDay?: boolean
	timezone?: string
	category?: string
	price?: string
	url: string
	why?: string
	sources: SourceLink[]
	foundAt: string
}

export const DETAIL_SLOTS = ['hours', 'photo', 'rating', 'card'] as const
export type DetailSlot = (typeof DETAIL_SLOTS)[number]

/** `place-detail` (T0), a mirror: one slot of one place from one source. */
export interface DetailPayload {
	slot: DetailSlot
	/** The place it is about: a saved place's id, or a suggestion's. */
	placeKey: string
	status: 'ok' | 'unavailable' | 'failed'
	fetchedAt: string
	data?: unknown
}

/** What an `outing` Event's snapshot carries of its listing (D-37), so it renders where the listing never was. */
export interface OutingSnapshot {
	title: string
	startAt: string
	endAt?: string
	venueName?: string
	point?: LngLat
	url?: string
}

// ---- What the store holds ---------------------------------------------------------------------------------------

/** A saved place as the page sees it: the `venue` Place and its profile, joined. */
export interface SavedPlace {
	/** The Place's id. */
	id: string
	/** The profile's id; none for a `venue` Meadow did not make, which shows as a plain pin (D-133). */
	profileId?: string
	name: string
	point?: LngLat
	category?: string
	phone?: string
	url?: string
	vibes: string[]
	price?: PriceLevel
	alcoholFree?: boolean
	favourite: boolean
	notes?: string
	address?: Address
	locality?: string
	providerIds: Record<string, string>
	hours?: PlaceHours
	rating?: Sourced & { value: number }
	photoId?: string
	thumb?: string
	savedFrom?: PlaceProfilePayload['savedFrom']
}

export interface CustomVibe extends VibePayload {
	id: string
}
export interface Collection extends CollectionPayload {
	id: string
}
export interface Visit extends VisitPayload {
	id: string
}
export interface Suggestion extends SuggestionPayload {
	/** The mirror's row id. */
	id: string
	source: string
	externalId: string
}
export interface Listing extends ListingPayload {
	id: string
	source: string
	externalId: string
}
/** An outing as Meadow reads it from its Event. */
export interface Outing {
	/** The Event's id. */
	id: string
	status: 'tentative' | 'confirmed'
	title: string
	startAt: string
	/** The listing it came from: its source and its id there. */
	source?: string
	externalId?: string
	snapshot?: OutingSnapshot
}

/** Everything Meadow keeps, as plain data. */
export interface MeadowData {
	places: SavedPlace[]
	vibes: CustomVibe[]
	collections: Collection[]
	visits: Visit[]
}

/** The fields of a place the owner may set in its form. */
export interface PlaceDraft {
	name: string
	category?: string
	point?: LngLat
	phone?: string
	url?: string
	vibes: string[]
	price?: PriceLevel
	alcoholFree?: boolean
	favourite?: boolean
	notes?: string
	address?: Address
	locality?: string
	providerIds?: Record<string, string>
	hours?: PlaceHours
	savedFrom?: PlaceProfilePayload['savedFrom']
}

// ---- Per device ---------------------------------------------------------------------------------------------------

/** Where a search looks: around home, or around a place the owner named. Kept per device, never a row. */
export type SearchArea =
	{ kind: 'home' } | { kind: 'named'; label: string; point: LngLat; city?: string; region?: string; country?: string }

/** What narrows the saved places. Kept per device, never a row. */
export interface PlaceFilter {
	vibes: string[]
	categories: string[]
	prices: PriceLevel[]
	/** No farther than this from the search area's point, in kilometres. */
	maxKm?: number
	collection?: string
	alcoholFree: boolean
	openNow: boolean
	favourites: boolean
	text: string
}

export const EMPTY_FILTER: PlaceFilter = {
	vibes: [],
	categories: [],
	prices: [],
	alcoholFree: false,
	openNow: false,
	favourites: false,
	text: '',
}
