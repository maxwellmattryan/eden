import { describe, expect, it } from 'vitest'
import { boundsAround, boundsOf, haversineKm, isLngLat, rounded, roundedPoint, withinBounds } from './coordinates.js'

const zilker = { lng: -97.7669, lat: 30.2677 }
const cosmic = { lng: -97.7626, lat: 30.2269 }

describe('rounded', () => {
	it('sends two decimals, about a kilometre (D-60)', () => {
		expect(rounded(30.26771)).toBe('30.27')
		expect(rounded(-97.7669)).toBe('-97.77')
		expect(roundedPoint(zilker)).toEqual({ lng: -97.77, lat: 30.27 })
	})
})

describe('haversineKm', () => {
	it('measures over the ground', () => {
		expect(haversineKm(zilker, zilker)).toBe(0)
		// four and a half kilometres south of the park
		expect(haversineKm(zilker, cosmic)).toBeGreaterThan(4.4)
		expect(haversineKm(zilker, cosmic)).toBeLessThan(4.7)
		expect(haversineKm(zilker, cosmic)).toBeCloseTo(haversineKm(cosmic, zilker), 9)
	})
})

describe('boundsAround', () => {
	it('reaches the same distance each way, wider in degrees of longitude away from the equator', () => {
		const box = boundsAround(zilker, 10)
		expect(haversineKm(zilker, { lng: zilker.lng, lat: box.north })).toBeCloseTo(10, 1)
		expect(haversineKm(zilker, { lng: box.east, lat: zilker.lat })).toBeCloseTo(10, 1)
		expect(box.east - box.west).toBeGreaterThan(box.north - box.south)
		expect(withinBounds(cosmic, box)).toBe(true)
		expect(withinBounds({ lng: -96.8, lat: 32.78 }, box)).toBe(false)
	})
	it('stays on the globe', () => {
		const box = boundsAround({ lng: 179.9, lat: 89.9 }, 50)
		expect(box.east).toBe(180)
		expect(box.north).toBe(90)
	})
})

describe('boundsOf', () => {
	it('holds every point, and is nothing for none', () => {
		expect(boundsOf([])).toBeUndefined()
		expect(boundsOf([zilker, cosmic])).toEqual({ west: -97.7669, south: 30.2269, east: -97.7626, north: 30.2677 })
	})
})

describe('isLngLat', () => {
	it('takes a point on the globe and refuses the rest', () => {
		expect(isLngLat(zilker)).toBe(true)
		expect(isLngLat({ lng: 0, lat: 0 })).toBe(false)
		expect(isLngLat({ lng: 200, lat: 10 })).toBe(false)
		expect(isLngLat({ lng: '1', lat: 2 })).toBe(false)
		expect(isLngLat(null)).toBe(false)
	})
})
