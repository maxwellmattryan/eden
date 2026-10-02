import { describe, expect, it } from 'vitest'
import type { Entity, PlaceRow } from '../../data/index.js'
import {
	draftPlace,
	joinPlaces,
	meadowRows,
	meadowUris,
	placePatch,
	profilePayload,
	saveOps,
	sortVisits,
	toSavedPlace,
} from './rows.js'
import type { MeadowData, PlaceProfilePayload } from './types.js'

const row = (given: Partial<PlaceRow> & { id: string; name: string }): PlaceRow =>
	({
		uri: `eden://place/${given.id}`,
		type: 'place',
		kind: 'venue',
		lat: null,
		lng: null,
		address: null,
		category: null,
		phone: null,
		url: null,
		createdAt: '',
		updatedAt: '',
		deletedAt: null,
		mirror: false,
		source: null,
		externalId: null,
		snapshot: null,
		links: [],
		...given,
	}) as PlaceRow
const profile = (id: string, payload: PlaceProfilePayload) =>
	({ id, type: 'place-profile', payload, uri: `eden://place-profile/${id}` }) as Entity<PlaceProfilePayload>

describe('a saved place and its two rows', () => {
	const draft = {
		name: ' Cosmic Coffee ',
		category: 'cafe',
		point: { lng: -97.7626, lat: 30.2269 },
		vibes: ['cozy', 'outdoors'],
		price: 2 as const,
		notes: '  Good porch. ',
		address: { country: 'US', line1: ' 121 Pickle Rd ', city: 'Austin', region: 'Texas', postalCode: '78704' },
		providerIds: { osm: 'W929874401' },
		url: 'https://example.com',
	}

	it('saves as a venue named at its source, a profile, and the link between them', () => {
		const place = draftPlace('P1', 'F1', draft)
		expect(place).toMatchObject({
			id: 'P1',
			profileId: 'F1',
			name: 'Cosmic Coffee',
			favourite: false,
			notes: 'Good porch.',
		})
		const ops = saveOps(place)
		expect(ops).toEqual([
			{
				op: 'createPrimitive',
				type: 'place',
				input: {
					id: 'P1',
					kind: 'venue',
					name: 'Cosmic Coffee',
					lat: 30.2269,
					lng: -97.7626,
					category: 'cafe',
					url: 'https://example.com',
					source: 'osm',
					externalId: 'W929874401',
				},
			},
			{
				op: 'createEntity',
				input: {
					id: 'F1',
					type: 'place-profile',
					payload: {
						placeId: 'P1',
						vibes: ['cozy', 'outdoors'],
						price: 2,
						favourite: false,
						notes: 'Good porch.',
						address: { country: 'US', line1: '121 Pickle Rd', city: 'Austin', region: 'TX', postalCode: '78704' },
						providerIds: { osm: 'W929874401' },
					},
				},
			},
			{
				op: 'link',
				owner: 'eden://place-profile/F1',
				link: { uri: 'eden://place/P1', relation: 'about', label: 'Cosmic Coffee' },
			},
		])
	})

	it('never writes the hand-typed address of the Place, and clears what was emptied', () => {
		const place = { ...draftPlace('P1', 'F1', draft), url: '', category: undefined, point: undefined }
		expect(placePatch(place)).toEqual({
			name: 'Cosmic Coffee',
			lat: null,
			lng: null,
			category: null,
			phone: null,
			url: null,
		})
		expect(placePatch(place)).not.toHaveProperty('address')
		// the public address is the profile's, in its parts (D-138); the old one-line key is never written
		expect(profilePayload(place).address).toEqual({
			country: 'US',
			line1: '121 Pickle Rd',
			city: 'Austin',
			region: 'TX',
			postalCode: '78704',
		})
		expect(profilePayload(place)).not.toHaveProperty('addressLine')
	})

	it('reads a profile from before addresses had parts: its line is the first line', () => {
		const old = toSavedPlace(
			row({ id: 'P1', name: 'Cosmic Coffee' }),
			profile('F1', { placeId: 'P1', vibes: [], favourite: false, addressLine: '121 Pickle Rd', providerIds: {} })
		)
		expect(old.address).toEqual({ line1: '121 Pickle Rd' })
		expect(profilePayload(old)).toMatchObject({ address: { line1: '121 Pickle Rd' } })
	})

	it('reads back as one, by name; a venue with no profile is a plain place', () => {
		const places = joinPlaces(
			[
				row({ id: 'P2', name: 'Wheatsville', category: 'shop' }),
				row({ id: 'P1', name: 'Cosmic Coffee', lat: 30.2269, lng: -97.7626, category: 'cafe' }),
				row({ id: 'P3', name: 'Home', kind: 'home' }),
				row({ id: 'P4', name: 'Gone', deletedAt: '1' }),
			],
			[
				profile('F1', { placeId: 'P1', vibes: ['cozy'], favourite: true, providerIds: { osm: 'W1' } }),
				profile('F9', { placeId: 'nowhere', vibes: [], favourite: false, providerIds: {} }),
			]
		)
		expect(places.map((place) => place.name)).toEqual(['Cosmic Coffee', 'Wheatsville'])
		expect(places[0]).toMatchObject({
			id: 'P1',
			profileId: 'F1',
			point: { lng: -97.7626, lat: 30.2269 },
			vibes: ['cozy'],
			favourite: true,
		})
		expect(places[1]).toEqual({
			id: 'P2',
			name: 'Wheatsville',
			category: 'shop',
			vibes: [],
			favourite: false,
			providerIds: {},
		})
	})
})

describe('a whole dataset as rows', () => {
	const data: MeadowData = {
		vibes: [{ id: 'v-dogs', label: 'Dog-friendly', facet: 'crowd' }],
		places: [
			{
				id: 'a',
				profileId: 'x',
				name: 'Zilker Park',
				vibes: ['calm', 'v-dogs'],
				favourite: true,
				providerIds: {},
				thumb: 'data:',
			},
			{ id: 'b', profileId: 'y', name: 'Cosmic Coffee', vibes: ['cozy'], favourite: false, providerIds: {} },
		],
		collections: [{ id: 'c', name: 'Outside', placeIds: ['a', 'missing'] }],
		visits: [
			{ id: 'v1', placeId: 'a', day: '2026-09-20', rating: 5 },
			{ id: 'v2', placeId: 'gone', day: '2026-09-21' },
			{ id: 'v3', placeId: 'b', day: '2026-09-26', note: 'Loud inside.' },
		],
	}

	it('gives every row a new id, and what names a place follows it', () => {
		let next = 0
		const { data: made, ops } = meadowRows(data, () => `N${++next}`)
		expect(made.vibes).toEqual([{ id: 'N1', label: 'Dog-friendly', facet: 'crowd' }])
		expect(made.places.map((place) => [place.name, place.id, place.profileId])).toEqual([
			['Cosmic Coffee', 'N4', 'N5'],
			['Zilker Park', 'N2', 'N3'],
		])
		// the custom vibe is named by its new id; a sample keeps its small picture and names no file
		expect(made.places[1]).toMatchObject({ vibes: ['calm', 'N1'], thumb: 'data:' })
		expect(made.places[1]).not.toHaveProperty('photoId')
		expect(made.collections).toEqual([{ id: 'N6', name: 'Outside', placeIds: ['N2'] }])
		// the visit of a place that is not there is dropped; the rest are newest first
		expect(made.visits.map((visit) => [visit.day, visit.placeId])).toEqual([
			['2026-09-26', 'N4'],
			['2026-09-20', 'N2'],
		])
		expect(ops.filter((op) => op.op === 'link')).toHaveLength(4)
		expect(meadowUris(made)).toHaveLength(2 + 1 + 4 + 1)
		expect(meadowUris(made).at(-1)).toBe('eden://vibe/N1')
	})
})

describe('sortVisits', () => {
	it('puts the latest day first, and the later logged of a day before the earlier', () => {
		const visits = [
			{ id: 'A', placeId: 'p', day: '2026-09-20' },
			{ id: 'C', placeId: 'p', day: '2026-09-26' },
			{ id: 'B', placeId: 'p', day: '2026-09-26' },
		]
		expect(sortVisits(visits).map((visit) => visit.id)).toEqual(['C', 'B', 'A'])
	})
})
