// Between Meadow's shapes and its rows (D-133). A saved place is a `venue` Place and a `place-profile` linked `about`
// it: `joinPlaces` reads the two back as one `SavedPlace`, and the functions below answer the writes that store one,
// change one and take one away, so the store and the sample data make the same rows.
import { cleanAddress, readAddress, type Address } from '../../address/index.js'
import { toUri, type BatchOp, type Entity, type PlaceInput, type PlacePatch, type PlaceRow } from '../../data/index.js'
import { readCategory } from './categories.js'
import {
	MEADOW,
	type Collection,
	type CollectionPayload,
	type CustomVibe,
	type MeadowData,
	type PlaceDraft,
	type PlaceProfilePayload,
	type SavedPlace,
	type Visit,
	type VisitPayload,
	type VibePayload,
} from './types.js'

/** Now, as an instant: what a row is stamped with when something was read or saved. */
export const instant = (): string => new Date().toISOString()

export const placeUri = (id: string) => toUri('place', id)
export const profileUri = (id: string) => toUri(MEADOW.profile, id)

/** A profile as it is stored: what is not set is left out, so a row holds no empty strings. */
export function profilePayload(place: SavedPlace | (PlaceDraft & { id: string })): PlaceProfilePayload {
	const saved = place as Partial<SavedPlace> & PlaceDraft
	const address = cleanAddress(place.address)
	return {
		placeId: place.id,
		vibes: [...place.vibes],
		...(place.price ? { price: place.price } : {}),
		...(place.alcoholFree !== undefined ? { alcoholFree: place.alcoholFree } : {}),
		favourite: place.favourite === true,
		...(place.notes?.trim() ? { notes: place.notes.trim() } : {}),
		...(address ? { address } : {}),
		...(place.locality?.trim() ? { locality: place.locality.trim() } : {}),
		providerIds: { ...(place.providerIds ?? {}) },
		...(place.hours ? { hours: place.hours } : {}),
		...(saved.rating ? { rating: saved.rating } : {}),
		...(saved.photoId ? { photoId: saved.photoId } : {}),
		...(saved.thumb ? { thumb: saved.thumb } : {}),
		...(place.savedFrom ? { savedFrom: place.savedFrom } : {}),
	}
}

/** The Place a draft makes: a `venue`, named at its source when a geocoder found it. */
export function placeInput(id: string, draft: PlaceDraft): PlaceInput {
	const osm = draft.providerIds?.osm
	return {
		id,
		kind: 'venue',
		name: draft.name.trim(),
		...(draft.point ? { lat: draft.point.lat, lng: draft.point.lng } : {}),
		...(draft.category ? { category: draft.category } : {}),
		...(draft.phone?.trim() ? { phone: draft.phone.trim() } : {}),
		...(draft.url?.trim() ? { url: draft.url.trim() } : {}),
		...(osm ? { source: 'osm', externalId: osm } : {}),
	}
}

/** The Place's fields as a saved place holds them now: what a change writes, with `null` where a field was emptied. */
export function placePatch(place: SavedPlace): PlacePatch {
	return {
		name: place.name.trim(),
		lat: place.point?.lat ?? null,
		lng: place.point?.lng ?? null,
		category: place.category ?? null,
		phone: place.phone?.trim() || null,
		url: place.url?.trim() || null,
	}
}

/** A draft as the saved place it becomes, with the ids its two rows will have. */
export function draftPlace(id: string, profileId: string, draft: PlaceDraft): SavedPlace {
	const address = cleanAddress(draft.address)
	return {
		id,
		profileId,
		name: draft.name.trim(),
		...(draft.point ? { point: draft.point } : {}),
		...(draft.category ? { category: draft.category } : {}),
		...(draft.phone?.trim() ? { phone: draft.phone.trim() } : {}),
		...(draft.url?.trim() ? { url: draft.url.trim() } : {}),
		vibes: [...draft.vibes],
		...(draft.price ? { price: draft.price } : {}),
		...(draft.alcoholFree !== undefined ? { alcoholFree: draft.alcoholFree } : {}),
		favourite: draft.favourite === true,
		...(draft.notes?.trim() ? { notes: draft.notes.trim() } : {}),
		...(address ? { address } : {}),
		...(draft.locality?.trim() ? { locality: draft.locality.trim() } : {}),
		providerIds: { ...(draft.providerIds ?? {}) },
		...(draft.hours ? { hours: draft.hours } : {}),
		...(draft.savedFrom ? { savedFrom: draft.savedFrom } : {}),
	}
}

/** The writes that save a place: its Place, its profile, and the link from the one to the other. */
export function saveOps(place: SavedPlace): BatchOp[] {
	const profileId = place.profileId
	if (!profileId) return []
	return [
		{ op: 'createPrimitive', type: 'place', input: placeInput(place.id, place) },
		{ op: 'createEntity', input: { id: profileId, type: MEADOW.profile, payload: profilePayload(place) } },
		{
			op: 'link',
			owner: profileUri(profileId),
			link: { uri: placeUri(place.id), relation: 'about', label: place.name },
		},
	]
}

/** The rows a saved place is kept in: its Place and, when Meadow made it, its profile. */
export function placeUris(place: Pick<SavedPlace, 'id' | 'profileId'>): string[] {
	return [placeUri(place.id), ...(place.profileId ? [profileUri(place.profileId)] : [])]
}

/** A Place and its profile as the page sees them. A `venue` with no profile is a plain place (D-133). */
export function toSavedPlace(place: PlaceRow, profile?: Entity<PlaceProfilePayload>): SavedPlace {
	const payload = profile?.payload
	const has = place.lat !== null && place.lng !== null
	// a profile from before addresses had parts holds one line, read as the first (D-138)
	const address: Address | undefined =
		readAddress(payload?.address) ?? (payload?.addressLine ? { line1: payload.addressLine } : undefined)
	return {
		id: place.id,
		...(profile ? { profileId: profile.id } : {}),
		name: place.name,
		...(has ? { point: { lng: place.lng as number, lat: place.lat as number } } : {}),
		...(place.category ? { category: readCategory(place.category) } : {}),
		...(place.phone ? { phone: place.phone } : {}),
		...(place.url ? { url: place.url } : {}),
		vibes: Array.isArray(payload?.vibes) ? payload.vibes.filter((vibe) => typeof vibe === 'string') : [],
		...(payload?.price ? { price: payload.price } : {}),
		...(payload?.alcoholFree !== undefined ? { alcoholFree: payload.alcoholFree } : {}),
		favourite: payload?.favourite === true,
		...(payload?.notes ? { notes: payload.notes } : {}),
		...(address ? { address } : {}),
		...(payload?.locality ? { locality: payload.locality } : {}),
		providerIds: { ...(payload?.providerIds ?? {}) },
		...(payload?.hours ? { hours: payload.hours } : {}),
		...(payload?.rating ? { rating: payload.rating } : {}),
		...(payload?.photoId ? { photoId: payload.photoId } : {}),
		...(payload?.thumb ? { thumb: payload.thumb } : {}),
		...(payload?.savedFrom ? { savedFrom: payload.savedFrom } : {}),
	}
}

/**
 * The saved places from their rows, by name: every live `venue`, with its profile where it has one. A profile whose
 * Place is gone is left out, and of two profiles about one Place the later stands.
 */
export function joinPlaces(
	places: readonly PlaceRow[],
	profiles: readonly Entity<PlaceProfilePayload>[]
): SavedPlace[] {
	const byPlace = new Map<string, Entity<PlaceProfilePayload>>()
	for (const profile of profiles) {
		if (typeof profile.payload?.placeId === 'string') byPlace.set(profile.payload.placeId, profile)
	}
	return places
		.filter((place) => place.kind === 'venue' && !place.deletedAt && !place.mirror)
		.map((place) => toSavedPlace(place, byPlace.get(place.id)))
		.sort((a, b) => a.name.localeCompare(b.name))
}

export const toVibe = (row: Entity<VibePayload>): CustomVibe => ({ ...row.payload, id: row.id })
export const toCollection = (row: Entity<CollectionPayload>): Collection => ({
	name: row.payload.name,
	placeIds: Array.isArray(row.payload.placeIds) ? [...row.payload.placeIds] : [],
	...(row.payload.note ? { note: row.payload.note } : {}),
	id: row.id,
})
export const toVisit = (row: Entity<VisitPayload>): Visit => ({ ...row.payload, id: row.id })

/** The visits newest first: by day, then by the order they were logged. */
export function sortVisits(visits: readonly Visit[]): Visit[] {
	return [...visits].sort((a, b) => b.day.localeCompare(a.day) || b.id.localeCompare(a.id))
}

/** The writes that log a visit: the row, and its link `at` the place. */
export function visitOps(visit: Visit, placeName: string): BatchOp[] {
	const { id, ...payload } = visit
	return [
		{ op: 'createEntity', input: { id, type: MEADOW.visit, payload } },
		{
			op: 'link',
			owner: toUri(MEADOW.visit, id),
			link: { uri: placeUri(visit.placeId), relation: 'at', label: placeName },
		},
	]
}

export interface MeadowRows {
	/** The data with the ids its rows have. */
	data: MeadowData
	ops: BatchOp[]
}

/**
 * The writes that store a whole dataset (the sample data). Every row takes a new id, whatever id it had, and what
 * names a place (a collection, a visit) follows it; a visit of a place that is not in the data is dropped.
 */
export function meadowRows(source: MeadowData, newId: () => string): MeadowRows {
	const ops: BatchOp[] = []
	const placeIds = new Map<string, string>()
	const vibeIds = new Map<string, string>()

	const vibes = source.vibes.map((vibe) => {
		const id = newId()
		vibeIds.set(vibe.id, id)
		return { ...vibe, id }
	})
	for (const { id, ...payload } of vibes) ops.push({ op: 'createEntity', input: { id, type: MEADOW.vibe, payload } })

	const places = source.places.map((place) => {
		const id = newId()
		placeIds.set(place.id, id)
		// a sample's picture is the small square alone: it names no file
		const { photoId: _photo, ...rest } = place
		return { ...rest, id, profileId: newId(), vibes: place.vibes.map((vibe) => vibeIds.get(vibe) ?? vibe) }
	})
	for (const place of places) ops.push(...saveOps(place))

	const collections = source.collections.map((collection) => ({
		...collection,
		id: newId(),
		placeIds: collection.placeIds.flatMap((id) => placeIds.get(id) ?? []),
	}))
	for (const { id, ...payload } of collections) {
		ops.push({ op: 'createEntity', input: { id, type: MEADOW.collection, payload } })
	}

	const visits = source.visits.flatMap((visit) => {
		const placeId = placeIds.get(visit.placeId)
		return placeId ? [{ ...visit, id: newId(), placeId }] : []
	})
	for (const visit of visits) {
		ops.push(...visitOps(visit, places.find((place) => place.id === visit.placeId)?.name ?? ''))
	}

	return {
		data: {
			places: [...places].sort((a, b) => a.name.localeCompare(b.name)),
			vibes,
			collections,
			visits: sortVisits(visits),
		},
		ops,
	}
}

/** The URIs of the rows the data is stored in. */
export function meadowUris(data: MeadowData): string[] {
	return [
		...data.visits.map((visit) => toUri(MEADOW.visit, visit.id)),
		...data.collections.map((collection) => toUri(MEADOW.collection, collection.id)),
		...data.places.flatMap(placeUris),
		...data.vibes.map((vibe) => toUri(MEADOW.vibe, vibe.id)),
	]
}
