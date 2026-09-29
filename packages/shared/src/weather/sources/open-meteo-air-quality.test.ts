import { describe, expect, it } from 'vitest'
import { OfflineError } from '../provider.js'
import { fillSlot, slotStale } from '../supplement.js'
import { normalizeAirQuality, normalizePollen, pollenLevel } from './open-meteo-air-quality.js'

const place = { label: 'Hyde Park', latitude: 30.305, longitude: -97.735 }
const AT = '2026-09-29T17:00:00.000Z'

describe('normalizeAirQuality', () => {
	it('reads the index and the pollutants', () => {
		const air = normalizeAirQuality({
			current: { us_aqi: 40, european_aqi: 32, pm2_5: 6.3, pm10: 9, ozone: 84, nitrogen_dioxide: 2 },
		})
		expect(air).toEqual({ usAqi: 40, europeanAqi: 32, pm25: 6.3, pm10: 9, ozone: 84, no2: 2 })
	})

	it('is null without an index', () => {
		expect(normalizeAirQuality({ current: { us_aqi: null, european_aqi: null } })).toBeNull()
	})
})

describe('normalizePollen', () => {
	it('is null where the model has no coverage: Austin', () => {
		expect(
			normalizePollen({
				current: {
					alder_pollen: null,
					birch_pollen: null,
					grass_pollen: null,
					mugwort_pollen: null,
					olive_pollen: null,
					ragweed_pollen: null,
				},
			})
		).toBeNull()
	})

	it('reads the levels where it has: Munich', () => {
		const pollen = normalizePollen({
			current: {
				alder_pollen: 0,
				birch_pollen: 0,
				grass_pollen: 0.5,
				mugwort_pollen: 1.4,
				olive_pollen: 0,
				ragweed_pollen: 60,
			},
		})
		expect(pollen?.items).toContainEqual({ kind: 'birch', level: 'none' })
		expect(pollen?.items).toContainEqual({ kind: 'mugwort', level: 'low' })
		expect(pollen?.items).toContainEqual({ kind: 'ragweed', level: 'high' })
		expect(pollen?.items).toHaveLength(6)
	})

	it('places a count on its scale', () => {
		expect(pollenLevel(0, 'tree')).toBe('none')
		expect(pollenLevel(45, 'tree')).toBe('moderate')
		expect(pollenLevel(45, 'grass')).toBe('moderate')
		expect(pollenLevel(200, 'tree')).toBe('very-high')
	})
})

describe('fillSlot', () => {
	const covers = { name: 'A', fetch: () => Promise.resolve({ items: [] }) }
	const misses = { name: 'B', fetch: () => Promise.resolve(null) }
	const down = { name: 'C', fetch: () => Promise.reject(new OfflineError('C')) }

	it('takes the first source that covers the place', async () => {
		expect(await fillSlot([misses, covers], place, AT)).toEqual({
			source: 'A',
			fetchedAt: AT,
			status: 'ok',
			data: { items: [] },
		})
	})

	it('is unavailable when no source covers the place', async () => {
		expect(await fillSlot([misses], place, AT)).toMatchObject({ status: 'unavailable', source: null, data: null })
		expect(await fillSlot([], place, AT)).toMatchObject({ status: 'unavailable' })
	})

	it('is failed, never a rejection, when a source cannot be reached', async () => {
		expect(await fillSlot([down], place, AT)).toMatchObject({ status: 'failed', source: 'C', data: null })
		expect(await fillSlot([down, covers], place, AT)).toMatchObject({ status: 'ok', source: 'A' })
	})
})

describe('slotStale', () => {
	const now = Date.parse(AT) + 30 * 60 * 1000
	const hour = 60 * 60 * 1000

	it('holds a filled or an uncovered slot for its cache and tries a failed one again', () => {
		expect(slotStale({ source: 'A', fetchedAt: AT, status: 'ok', data: {} }, hour, now)).toBe(false)
		expect(slotStale({ source: null, fetchedAt: AT, status: 'unavailable', data: null }, hour, now)).toBe(false)
		expect(slotStale({ source: 'C', fetchedAt: AT, status: 'failed', data: null }, hour, now)).toBe(true)
		expect(slotStale({ source: 'A', fetchedAt: AT, status: 'ok', data: {} }, hour, now + hour)).toBe(true)
		expect(slotStale({ source: null, fetchedAt: null, status: 'unavailable', data: null }, hour, now)).toBe(true)
	})
})
