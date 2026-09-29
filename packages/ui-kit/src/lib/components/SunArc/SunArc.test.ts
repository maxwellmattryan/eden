import { describe, expect, it } from 'vitest'
import { sunArc } from './sun.js'
const HOUR = 60 * 60 * 1000
const at = (hour: number, minute = 0) => Date.UTC(2026, 8, 30, hour, minute)
/** The drawing of a day that has one. */
const arc = (...args: Parameters<typeof sunArc>) => sunArc(...args)!
const options = { width: 264, height: 112, top: 12, side: 12, bottom: 0 }
describe('sunArc', () => {
	it('draws an equinox with the horizon through the middle', () => {
		const geo = arc(at(6), at(18), at(12), options)
		expect(geo.plot).toEqual({ x: 12, y: 12, width: 240, height: 100 })
		expect(geo.horizon).toBeCloseTo(62)
		expect(geo.rise.x).toBeCloseTo(72)
		expect(geo.set.x).toBeCloseTo(192)
		expect(geo.rise.y).toBeCloseTo(geo.horizon)
		expect(geo.set.y).toBeCloseTo(geo.horizon)
	})
	it('puts the sun at the top at solar noon and at the foot at solar midnight', () => {
		expect(arc(at(6), at(18), at(12), options).sun).toMatchObject({ x: 132, y: 12, up: true })
		const midnight = arc(at(6), at(18), at(0), options).sun
		expect(midnight.y).toBeCloseTo(112)
		expect(midnight.up).toBe(false)
	})
	it('lowers the horizon for a long day and raises it for a short one', () => {
		const long = arc(at(5), at(19), at(12), options)
		const short = arc(at(8), at(16), at(12), options)
		expect(long.horizon).toBeGreaterThan(62)
		expect(short.horizon).toBeLessThan(62)
		expect(long.set.x - long.rise.x).toBeCloseTo(140)
		expect(short.set.x - short.rise.x).toBeCloseTo(80)
	})
	it('says whether the sun is up', () => {
		expect(arc(at(7, 22), at(19, 14), at(7, 40), options).sun.up).toBe(true)
		expect(arc(at(7, 22), at(19, 14), at(7), options).sun.up).toBe(false)
		expect(arc(at(7, 22), at(19, 14), at(21), options).sun.up).toBe(false)
	})
	it('reads an instant of another day as the same time of day', () => {
		const today = arc(at(6), at(18), at(9), options).sun
		const tomorrow = arc(at(6), at(18), at(9) + 24 * HOUR, options).sun
		expect(tomorrow.x).toBeCloseTo(today.x)
		expect(tomorrow.y).toBeCloseTo(today.y)
	})
	it('traces the way the sun came from the last of midnight, sunrise and sunset', () => {
		const end = (path: string) => path.split(' L').at(-1)
		const morning = arc(at(6), at(18), at(9), options)
		expect(morning.travel.startsWith(`M${morning.rise.x.toFixed(1)} `)).toBe(true)
		expect(end(morning.travel)).toBe(`${morning.sun.x.toFixed(1)} ${morning.sun.y.toFixed(1)}`)
		const evening = arc(at(6), at(18), at(21), options)
		expect(evening.travel.startsWith(`M${evening.set.x.toFixed(1)} `)).toBe(true)
		const early = arc(at(6), at(18), at(3), options)
		expect(early.travel.startsWith('M12.0 112.0')).toBe(true)
	})
	it('closes the daylight along the horizon', () => {
		const geo = arc(at(6), at(18), at(12), options)
		expect(geo.lit.startsWith('M72.0 62.0')).toBe(true)
		expect(geo.day).toBe(`${geo.lit} Z`)
		expect(geo.line.startsWith('M12.0 112.0')).toBe(true)
	})
	it('writes the two times under their crossings when they have room', () => {
		const labels = { sunrise: '07:22', sunset: '19:14' }
		const geo = arc(at(7, 22), at(19, 14), at(12), { ...options, labels })
		expect(geo.labels.sunrise).toBeCloseTo(geo.rise.x - 20, 0)
		expect(geo.labels.sunset).toBeCloseTo(geo.set.x - 20, 0)
		expect(arc(at(10), at(14), at(12), { ...options, labels }).labels).toBeNull()
		expect(arc(at(6), at(18), at(12), options).labels).toBeNull()
	})
	it('is null without a day to draw', () => {
		expect(sunArc(at(18), at(6), at(12), options)).toBeNull()
		expect(sunArc(at(6), at(6) + 24 * HOUR, at(12), options)).toBeNull()
		expect(sunArc(NaN, at(18), at(12), options)).toBeNull()
		expect(sunArc(at(6), at(18), at(12), { ...options, width: 0 })).toBeNull()
	})
})
