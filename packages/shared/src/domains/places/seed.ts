// The sample dataset (design/sample-data.md, "Meadow") mapped into the store's shapes: the five places with their
// vibes by facet, hours and small pictures, the two collections and the three visits. The hours are written as a
// source would give them, so "open now" has something to read.
import { meadowCollections, meadowPlaces, meadowVisits } from '@eden/ui-kit/sample-data'
import { nowIso, shiftSampleDate } from '../../dates/index.js'
import { asCategory } from './categories.js'
import { parseOpeningHours } from './hours.js'
import { type MeadowData, type SavedPlace } from './types.js'

/** The sample places' hours in OpenStreetMap's `opening_hours`, by place. */
const HOURS: Record<string, string> = {
	'p-01': 'Mo-Su 07:00-24:00',
	'p-02': 'Mo-Su 12:00-02:00',
	'p-03': 'Mo-Su 05:00-22:00',
	'p-04': 'Mo-Fr 07:00-17:00; Sa,Su 08:00-17:00',
}

export function seedData(): MeadowData {
	const asOf = nowIso()
	return {
		vibes: [],
		places: meadowPlaces.map((place): SavedPlace => {
			const text = HOURS[place.id]
			return {
				id: place.id,
				profileId: `${place.id}-profile`,
				name: place.name,
				point: { ...place.point },
				category: asCategory(place.category),
				vibes: [...place.vibes],
				...(place.price ? { price: place.price } : {}),
				...(place.alcoholFree !== undefined ? { alcoholFree: place.alcoholFree } : {}),
				favourite: place.favourite,
				...(place.notes ? { notes: place.notes } : {}),
				address: { country: 'US', line1: place.address, city: 'Austin', region: 'TX' },
				locality: place.locality,
				providerIds: {},
				...(text ? { hours: { source: 'sample', asOf, text, spec: parseOpeningHours(text) } } : {}),
				...(place.website ? { url: place.website } : {}),
				...(place.picture ? { thumb: place.picture } : {}),
				savedFrom: { via: 'manual', at: asOf },
			}
		}),
		collections: meadowCollections.map((collection) => ({
			id: collection.id,
			name: collection.name,
			placeIds: [...collection.placeIds],
			...('note' in collection && collection.note ? { note: collection.note } : {}),
		})),
		visits: meadowVisits.map((visit) => ({
			id: visit.id,
			placeId: visit.placeId,
			// "Sat 09-26": the day of the month is what moves with today
			day: shiftSampleDate(visit.day.slice(-5)),
			rating: visit.rating as 1 | 2 | 3 | 4 | 5,
			...('note' in visit && visit.note ? { note: visit.note } : {}),
		})),
	}
}
