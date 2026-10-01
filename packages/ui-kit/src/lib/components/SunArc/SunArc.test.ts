import { describe, expect, it } from 'vitest'
import { declination, phaseOf, sunArc, sunAt, sunPosition } from './sun.js'

const HOUR = 60 * 60 * 1000
const DEG = 180 / Math.PI
/** A time on the September equinox of 2026, when the sun stands over the equator. */
const at = (hour: number, minute = 0) => Date.UTC(2026, 8, 23, hour, minute)
const on = (month: number, day: number, hour: number, minute = 0) => Date.UTC(2026, month - 1, day, hour, minute)
/** The drawing of a day that has one. */
const arc = (...args: Parameters<typeof sunArc>) => sunArc(...args)!
const options = { width: 264, height: 112, top: 12, side: 12, bottom: 0, latitude: 40 }

describe('declination', () => {
	it('is nothing at the equinoxes and the tilt of the earth at the solstices', () => {
		expect(declination(on(3, 20, 12)) * DEG).toBeCloseTo(0, 0)
		expect(declination(on(9, 23, 12)) * DEG).toBeCloseTo(0, 0)
		expect(declination(on(6, 21, 12)) * DEG).toBeCloseTo(23.44, 0)
		expect(declination(on(12, 21, 12)) * DEG).toBeCloseTo(-23.44, 0)
	})
})

describe('sunPosition', () => {
	it('puts the equinox noon sun due south at the co-latitude, and due north of a southern place', () => {
		const north = sunPosition(at(6), at(18), 40, at(12))
		expect(north.elevation).toBeCloseTo(50, 0)
		expect(north.azimuth).toBeCloseTo(180, 0)
		expect(north.phase).toBe('day')
		const south = sunPosition(at(6), at(18), -35, at(12))
		expect(south.elevation).toBeCloseTo(55, 0)
		expect(south.azimuth % 360).toBeCloseTo(0, 0)
	})
	it('rises in the east and sets in the west, on the horizon', () => {
		const rise = sunPosition(at(6), at(18), 40, at(6))
		expect(rise.elevation).toBeCloseTo(0, 0)
		expect(rise.azimuth).toBeCloseTo(90, 0)
		const set = sunPosition(at(6), at(18), 40, at(18))
		expect(set.elevation).toBeCloseTo(0, 0)
		expect(set.azimuth).toBeCloseTo(270, 0)
	})
	it('sinks at midnight as far beneath the horizon as it stood above at noon, on the equinox', () => {
		const midnight = sunPosition(at(6), at(18), 40, at(0))
		expect(midnight.elevation).toBeCloseTo(-50, 0)
		expect(midnight.phase).toBe('night')
	})
	it('stands high in a northern summer and low in its winter', () => {
		expect(sunPosition(on(6, 21, 4), on(6, 21, 20), 52, on(6, 21, 12)).elevation).toBeCloseTo(61.4, 0)
		expect(sunPosition(on(12, 21, 8), on(12, 21, 16), 52, on(12, 21, 12)).elevation).toBeCloseTo(14.6, 0)
	})
	it('reads an instant of another day as the same time of day', () => {
		const today = sunPosition(at(6), at(18), 40, at(9))
		const tomorrow = sunPosition(at(6), at(18), 40, at(9) + 24 * HOUR)
		expect(tomorrow.elevation).toBeCloseTo(today.elevation)
		expect(tomorrow.azimuth).toBeCloseTo(today.azimuth)
	})
})

describe('phaseOf', () => {
	it('names the light by the elevation', () => {
		expect(phaseOf(30)).toBe('day')
		expect(phaseOf(5.9)).toBe('golden')
		expect(phaseOf(-0.5)).toBe('golden')
		expect(phaseOf(-0.9)).toBe('civil')
		expect(phaseOf(-6.1)).toBe('nautical')
		expect(phaseOf(-12.1)).toBe('astronomical')
		expect(phaseOf(-18.1)).toBe('night')
	})
})

describe('sunArc', () => {
	it('runs from the midnight sun at the foot to the noon sun at the top, the horizon between', () => {
		const geo = arc(at(6), at(18), at(12), options)
		expect(geo.plot).toEqual({ x: 12, y: 12, width: 240, height: 100 })
		expect(geo.range.high).toBeCloseTo(50, 0)
		expect(geo.range.low).toBeCloseTo(-50, 0)
		// on the equinox the horizon is halfway, and sunrise and sunset stand on it a quarter of the way in
		expect(geo.horizon).toBeCloseTo(62, 0)
		expect(geo.rise.x).toBeCloseTo(72)
		expect(geo.set.x).toBeCloseTo(192)
		expect(geo.rise.y).toBeCloseTo(geo.horizon, 0)
		expect(geo.set.y).toBeCloseTo(geo.rise.y)
		expect(geo.peak).toMatchObject({ x: 132, y: 12 })
		expect(geo.peak.elevation).toBeCloseTo(50, 0)
	})
	it('puts the sun at the top at solar noon and at the foot at solar midnight', () => {
		expect(arc(at(6), at(18), at(12), options).sun).toMatchObject({ x: 132, y: 12, up: true })
		const midnight = arc(at(6), at(18), at(0), options).sun
		expect(midnight.y).toBeCloseTo(112)
		expect(midnight.up).toBe(false)
	})
	it('draws the twilights that fall inside the day, each beneath the one before', () => {
		const geo = arc(at(6), at(18), at(12), options)
		expect(geo.twilights.map((line) => line.elevation)).toEqual([-6, -12, -18])
		const [civil, nautical, astronomical] = geo.twilights
		expect(civil!.y).toBeGreaterThan(geo.horizon)
		expect(nautical!.y).toBeGreaterThan(civil!.y)
		expect(astronomical!.y).toBeGreaterThan(nautical!.y)
		// a midsummer night at 52° north never gets darker than nautical twilight: the sun sinks to about -14.6°
		const summer = arc(on(6, 21, 4), on(6, 21, 20), on(6, 21, 12), { ...options, latitude: 52 })
		expect(summer.twilights.map((line) => line.elevation)).toEqual([-6, -12])
	})
	it('sinks the horizon in a long day and lifts it in a short one', () => {
		const long = arc(on(6, 21, 4), on(6, 21, 20), on(6, 21, 12), { ...options, latitude: 52 })
		const short = arc(on(12, 21, 8), on(12, 21, 16), on(12, 21, 12), { ...options, latitude: 52 })
		expect(long.horizon).toBeGreaterThan(62)
		expect(short.horizon).toBeLessThan(62)
		expect(long.set.x - long.rise.x).toBeCloseTo(160)
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
	it('closes the daylight between sunrise and sunset', () => {
		const geo = arc(at(6), at(18), at(12), options)
		expect(geo.lit.startsWith(`M72.0 ${geo.rise.y.toFixed(1)}`)).toBe(true)
		expect(geo.day).toBe(`${geo.lit} Z`)
		expect(geo.line.startsWith('M12.0 112.0')).toBe(true)
	})
	it('writes the two times under their crossings when they have room', () => {
		const labels = { sunrise: '07:22', sunset: '19:14' }
		const geo = arc(at(7, 22), at(19, 14), at(12), { ...options, labels })
		expect(geo.labels?.sunrise).toBeCloseTo(geo.rise.x - 20, 0)
		expect(geo.labels?.sunset).toBeCloseTo(geo.set.x - 20, 0)
		expect(arc(at(10), at(14), at(12), { ...options, labels }).labels).toBeNull()
		expect(arc(at(6), at(18), at(12), options).labels).toBeNull()
	})
	it('is null without a day or a place to draw', () => {
		expect(sunArc(at(18), at(6), at(12), options)).toBeNull()
		expect(sunArc(at(6), at(6) + 24 * HOUR, at(12), options)).toBeNull()
		expect(sunArc(NaN, at(18), at(12), options)).toBeNull()
		expect(sunArc(at(6), at(18), at(12), { ...options, width: 0 })).toBeNull()
		expect(sunArc(at(6), at(18), at(12), { ...options, latitude: NaN })).toBeNull()
		expect(sunArc(at(6), at(18), at(12), { ...options, latitude: 120 })).toBeNull()
	})
})

describe('sunAt', () => {
	const geo = arc(at(6), at(18), at(12), options)
	const read = (x: number) => sunAt(at(6), at(18), options.latitude, geo, x)
	it('reads the time of day at a place across the wave, and where the sun stands at it', () => {
		const noon = read(132)
		expect(noon).toMatchObject({ x: 132, y: 12, instant: at(12), phase: 'day' })
		expect(noon.elevation).toBeCloseTo(50, 0)
		const dawn = read(72)
		expect(dawn.instant).toBe(at(6))
		expect(dawn.y).toBeCloseTo(geo.rise.y)
		expect(dawn.azimuth).toBeCloseTo(90, 0)
		const night = read(42)
		expect(night.instant).toBe(at(3))
		expect(night.elevation).toBeLessThan(-18)
		expect(night.phase).toBe('night')
	})
	it("keeps a place in the margin at the day's end", () => {
		expect(read(0)).toMatchObject({ x: 12, instant: at(0) })
		expect(read(900)).toMatchObject({ x: 252, instant: at(24) })
		expect(read(900).y).toBeCloseTo(112)
	})
})
