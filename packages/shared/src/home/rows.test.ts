import { describe, expect, it } from 'vitest'
import type { PlaceInput, PlaceRow } from '../data/types.js'
import {
	draftOf,
	forecastPlace,
	homeFromRow,
	homeInput,
	homePatch,
	legacyHome,
	resolveHome,
	type HomeIo,
} from './rows.js'

const rowOf = (input: PlaceInput, id = 'p1'): PlaceRow =>
	({
		uri: `eden://place/${id}`,
		id,
		type: 'place',
		kind: input.kind,
		name: input.name,
		lat: input.lat ?? null,
		lng: input.lng ?? null,
		address: input.address ?? null,
		category: null,
		phone: null,
		url: null,
	}) as unknown as PlaceRow

const duval = {
	label: 'Home',
	point: { lng: -97.7262, lat: 30.3074 },
	address: { country: 'US', line1: '4301 Duval St', city: 'Austin', region: 'TX', postalCode: '78751' },
}

describe('the home and its row', () => {
	it('keeps the address as its parts, and reads the area from them in words', () => {
		const input = homeInput(duval)
		expect(input).toMatchObject({ kind: 'home', name: 'Home', lat: 30.3074, lng: -97.7262 })
		expect(JSON.parse(input.address!)).toEqual(duval.address)
		const home = homeFromRow(rowOf(input))!
		expect(home).toMatchObject({ id: 'p1', label: 'Home', latitude: 30.3074, longitude: -97.7262 })
		expect(home.address).toEqual(duval.address)
		expect(home.area).toEqual({ city: 'Austin', region: 'Texas', country: 'United States' })
		expect(draftOf(home)).toEqual(duval)
	})

	it('has no area without a city, clears an address that was removed, and is nothing without a point', () => {
		const home = homeFromRow(rowOf(homeInput({ label: 'Home', point: duval.point })))!
		expect(home.area).toBeUndefined()
		expect(home.address).toBeUndefined()
		expect(homePatch({ label: ' Home ', point: duval.point })).toEqual({
			name: 'Home',
			lat: 30.3074,
			lng: -97.7262,
			address: null,
		})
		expect(homeFromRow(rowOf({ kind: 'home', name: 'Home' }))).toBeUndefined()
	})

	it('reads a row whose address is a line from before it had parts', () => {
		const home = homeFromRow(rowOf({ kind: 'home', name: 'Home', lat: 1, lng: 2, address: '1 Elm St' }))!
		expect(home.address).toEqual({ line1: '1 Elm St' })
		expect(home.area).toBeUndefined()
	})

	it('gives Sky the name, the point and the area, never the address', () => {
		const place = forecastPlace(homeFromRow(rowOf(homeInput(duval)))!)
		expect(place).toEqual({
			label: 'Home',
			latitude: 30.3074,
			longitude: -97.7262,
			area: { city: 'Austin', region: 'Texas', country: 'United States' },
		})
		expect(JSON.stringify(place)).not.toContain('Duval')
	})
})

describe('the home that was a setting', () => {
	const setting = JSON.stringify({
		label: 'Austin',
		latitude: 30.26715,
		longitude: -97.74306,
		area: { city: 'Austin', region: 'Texas', country: 'United States' },
	})

	it('becomes a draft with the area as an address of city, region and country', () => {
		expect(legacyHome(setting)).toEqual({
			label: 'Austin',
			point: { lng: -97.74306, lat: 30.26715 },
			address: { country: 'US', city: 'Austin', region: 'TX' },
		})
		expect(legacyHome(JSON.stringify({ label: 'Hyde Park', latitude: 30.305, longitude: -97.735 }))).toEqual({
			label: 'Hyde Park',
			point: { lng: -97.735, lat: 30.305 },
		})
	})

	it('is nothing when it is not a home', () => {
		for (const value of [null, '', '{', 'null', '{"label":"x"}', '{"label":"","latitude":1,"longitude":2}']) {
			expect(legacyHome(value), String(value)).toBeUndefined()
		}
	})

	function device(kept: string | null, rows: PlaceRow[] = []) {
		const state = { kept, rows, created: 0 }
		const io: HomeIo = {
			query: async () => state.rows,
			create: async (input) => {
				state.created += 1
				const row = rowOf(input, `p${state.created}`)
				state.rows = [row]
				return row
			},
			legacy: () => state.kept,
			clear: () => (state.kept = null),
		}
		return { state, io }
	}

	it('is given its row once, and the setting is removed', async () => {
		const { state, io } = device(setting)
		const first = await resolveHome(io)
		expect(first).toMatchObject({ id: 'p1', label: 'Austin', area: { city: 'Austin' } })
		expect(state).toMatchObject({ kept: null, created: 1 })
		expect(await resolveHome(io)).toEqual(first)
		expect(state.created).toBe(1)
	})

	it('loses to a row that is already there, and is removed', async () => {
		const { state, io } = device(setting, [rowOf(homeInput(duval), 'p9')])
		expect(await resolveHome(io)).toMatchObject({ id: 'p9', label: 'Home' })
		expect(state).toMatchObject({ kept: null, created: 0 })
	})

	it('writes nothing for an owner who never chose a home', async () => {
		const { state, io } = device(null)
		expect(await resolveHome(io)).toBeUndefined()
		expect(state.created).toBe(0)
	})
})
