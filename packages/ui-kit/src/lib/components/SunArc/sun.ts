// The sun arc's geometry, kept pure so it can be tested without a DOM. The wave is the sun's elevation over a day,
// from one solar midnight to the next: how many degrees it stands above the horizon, or beneath it. Three things fix
// it. Solar noon is the midpoint of the day's sunrise and sunset, which holds the place's longitude and the equation
// of time without either being asked for. The sun's declination, how far north or south of the equator it stands,
// follows from the date. And the place's latitude says how the two combine:
//
//     sin(elevation) = sin(latitude) · sin(declination) + cos(latitude) · cos(declination) · cos(hour angle)
//
// where the hour angle is the time since solar noon, a full turn a day. So the wave is tall and narrow-shouldered in
// a summer at a middle latitude, low and flat in its winter, and near the equator it climbs almost straight up. The
// light's phases are elevations too: the day down to the horizon, then civil, nautical and astronomical twilight at
// 6, 12 and 18 degrees beneath it. The formula is geometric, with no refraction, so the wave meets the horizon a few
// minutes inside the sunrise and the sunset a forecast gives, which count the sun as up from 0.833 degrees beneath.
import { placeLabels } from '../TrendChart/trend.js'

export interface SunArcOptions {
	/** The drawing width and height, in px. */
	width: number
	height: number
	/** The place's latitude in degrees, north positive. */
	latitude: number
	/** The room kept above and at the sides, so the sun and the noon figure stay inside. */
	top?: number
	side?: number
	/** The room kept beneath for the two times. */
	bottom?: number
	/** The times written under sunrise and sunset. */
	labels?: { sunrise: string; sunset: string }
	/** The least room between the two times, and the width a character of one takes. */
	labelGap?: number
	charWidth?: number
	/** How many segments the whole wave is drawn in. */
	segments?: number
}
export interface SunArcPoint {
	x: number
	y: number
}
/** What the light is at an elevation: day, the low sun either side of it, the three twilights, night. */
export type SunPhase = 'day' | 'golden' | 'civil' | 'nautical' | 'astronomical' | 'night'
/** Where the sun stands at an instant: degrees above the horizon (beneath it when negative), and the bearing clockwise from north. */
export interface SunPosition {
	elevation: number
	azimuth: number
	phase: SunPhase
}
export interface SunArcGeometry {
	/** The plot's box: a day from one solar midnight to the next, from the sun's lowest to its highest. */
	plot: {
		x: number
		y: number
		width: number
		height: number
	}
	/** The elevations the plot runs between, in degrees: the sun at solar midnight and at solar noon. */
	range: { low: number; high: number }
	/** Where the horizon lies: an elevation of nothing. */
	horizon: number
	/** The twilights' thresholds that fall inside the plot: 6, 12 and 18 degrees beneath the horizon. */
	twilights: { elevation: number; y: number }[]
	/** The whole wave, and the part of it between sunrise and sunset. */
	line: string
	lit: string
	/** The part between sunrise and sunset closed along the horizon: the daylight. */
	day: string
	rise: SunArcPoint
	set: SunArcPoint
	/** The top of the wave, with the sun's elevation at solar noon. */
	peak: SunArcPoint & { elevation: number }
	/** Where the sun is, and whether it is up: between the day's sunrise and its sunset. */
	sun: SunArcPoint & {
		up: boolean
	}
	/** The way the sun came: along the wave from the last of midnight, sunrise and sunset to where it is. */
	travel: string
	/** Where each time starts, or null when the two have no room beside each other. */
	labels: { sunrise: number; sunset: number } | null
}

const DAY_MS = 24 * 60 * 60 * 1000
const RAD = Math.PI / 180
/** The elevation a forecast counts sunrise and sunset from: the disc's upper edge on the horizon, lifted by refraction. */
export const RISE_ELEVATION = -0.833
/** Beneath this the low sun's light is warm: the golden hour. */
export const GOLDEN_ELEVATION = 6
/** The twilights end at these elevations: civil, nautical, astronomical. */
export const TWILIGHTS = [-6, -12, -18] as const
const fmt = (n: number) => n.toFixed(1)

/**
 * The sun's declination at an instant, in radians: how far north of the equator it stands (south when negative),
 * from the fraction of the year gone (Spencer's series, good to a few hundredths of a degree).
 */
export function declination(instant: number): number {
	const date = new Date(instant)
	const start = Date.UTC(date.getUTCFullYear(), 0, 1)
	const year = Date.UTC(date.getUTCFullYear() + 1, 0, 1) - start
	const g = (2 * Math.PI * (instant - start)) / year
	return (
		0.006918 -
		0.399912 * Math.cos(g) +
		0.070257 * Math.sin(g) -
		0.006758 * Math.cos(2 * g) +
		0.000907 * Math.sin(2 * g) -
		0.002697 * Math.cos(3 * g) +
		0.00148 * Math.sin(3 * g)
	)
}

/** What the light is at an elevation in degrees. */
export function phaseOf(elevation: number): SunPhase {
	if (elevation >= GOLDEN_ELEVATION) return 'day'
	if (elevation >= RISE_ELEVATION) return 'golden'
	if (elevation >= TWILIGHTS[0]) return 'civil'
	if (elevation >= TWILIGHTS[1]) return 'nautical'
	if (elevation >= TWILIGHTS[2]) return 'astronomical'
	return 'night'
}

/** The sun's elevation and bearing a phase after solar noon (in days), at a latitude and a declination in radians. */
function position(phase: number, latitude: number, decl: number): { elevation: number; azimuth: number } {
	const hour = 2 * Math.PI * phase
	const sine = Math.sin(latitude) * Math.sin(decl) + Math.cos(latitude) * Math.cos(decl) * Math.cos(hour)
	// the bearing from south, westward; turned half round it is the compass's, clockwise from north
	const fromSouth = Math.atan2(
		Math.sin(hour),
		Math.cos(hour) * Math.sin(latitude) - Math.tan(decl) * Math.cos(latitude)
	)
	return {
		elevation: Math.asin(Math.min(1, Math.max(-1, sine))) / RAD,
		azimuth: (((fromSouth / RAD + 180) % 360) + 360) % 360,
	}
}

/**
 * Where the sun stands at an instant on the day whose sunrise and sunset are given, at a latitude in degrees. The
 * instant may be any: the sun's place repeats daily, so it is read as the same time of day.
 */
export function sunPosition(sunrise: number, sunset: number, latitude: number, instant: number): SunPosition {
	const noon = (sunrise + sunset) / 2
	const elapsed = (instant - noon) / DAY_MS
	const at = position(elapsed - Math.round(elapsed), latitude * RAD, declination(noon))
	return { ...at, phase: phaseOf(at.elevation) }
}

/**
 * The drawing for a day's sunrise and sunset and an instant, all in milliseconds, at a latitude. The instant may be
 * any: one before the day's solar midnight or after the next is read as the same time of day. Null without a day to
 * draw: no width, no latitude, a sunset that is not after its sunrise, or a day of 24 hours or more.
 */
export function sunArc(sunrise: number, sunset: number, now: number, options: SunArcOptions): SunArcGeometry | null {
	const {
		width,
		height,
		latitude,
		top = 12,
		side = 12,
		bottom = 0,
		labels,
		labelGap = 14,
		charWidth = 8,
		segments = 48,
	} = options
	const length = sunset - sunrise
	if (!Number.isFinite(length) || !Number.isFinite(now) || !(length > 0) || !(length < DAY_MS)) return null
	if (!(width > 0) || !(height > 0) || !Number.isFinite(latitude) || Math.abs(latitude) > 90) return null
	const plot = {
		x: side,
		y: top,
		width: Math.max(1, width - side * 2),
		height: Math.max(1, height - top - bottom),
	}
	// a phase is the time since solar noon in days, from -0.5 to 0.5; the day is within `half` of noon
	const noon = (sunrise + sunset) / 2
	const half = length / DAY_MS / 2
	const decl = declination(noon)
	const elevation = (phase: number) => position(phase, latitude * RAD, decl).elevation
	const high = elevation(0)
	const low = elevation(0.5)
	const span = Math.max(1e-6, high - low)
	const x = (phase: number) => plot.x + plot.width * (phase + 0.5)
	const yOf = (degrees: number) => plot.y + (plot.height * (high - degrees)) / span
	const y = (phase: number) => yOf(elevation(phase))
	const point = (phase: number) => ({ x: x(phase), y: y(phase) })
	const step = 1 / Math.max(2, segments)
	const path = (from: number, to: number) => {
		const count = Math.max(1, Math.ceil((to - from) / step))
		return Array.from({ length: count + 1 }, (_, i) => {
			const phase = from + ((to - from) * i) / count
			return `${i ? 'L' : 'M'}${fmt(x(phase))} ${fmt(y(phase))}`
		}).join(' ')
	}
	const elapsed = (now - noon) / DAY_MS
	const phase = elapsed - Math.round(elapsed)
	const since = phase >= half ? half : phase >= -half ? -half : -0.5
	const lit = path(-half, half)
	const starts = labels
		? placeLabels([x(-half), x(half)], [labels.sunrise, labels.sunset], width, labelGap, charWidth)
		: []
	const [first, second] = starts
	return {
		plot,
		range: { low, high },
		horizon: yOf(0),
		twilights: TWILIGHTS.filter((degrees) => degrees > low && degrees < high).map((degrees) => ({
			elevation: degrees,
			y: yOf(degrees),
		})),
		line: path(-0.5, 0.5),
		lit,
		day: `${lit} Z`,
		rise: point(-half),
		set: point(half),
		peak: { ...point(0), elevation: high },
		sun: { ...point(phase), up: Math.abs(phase) < half },
		travel: path(since, phase),
		labels: first != null && second != null ? { sunrise: first, sunset: second } : null,
	}
}

/**
 * What the wave says at a place across the drawing: the instant of the day there, where the sun is on the wave at
 * it, and where it stands in the sky. The place is kept inside the plot, so a pointer in the margin reads the day's
 * end.
 */
export function sunAt(
	sunrise: number,
	sunset: number,
	latitude: number,
	geo: Pick<SunArcGeometry, 'plot' | 'range'>,
	at: number
): SunArcPoint & SunPosition & { instant: number } {
	const { plot, range } = geo
	const phase = Math.min(0.5, Math.max(-0.5, (at - plot.x) / plot.width - 0.5))
	const noon = (sunrise + sunset) / 2
	const where = position(phase, latitude * RAD, declination(noon))
	return {
		x: plot.x + plot.width * (phase + 0.5),
		y: plot.y + (plot.height * (range.high - where.elevation)) / Math.max(1e-6, range.high - range.low),
		instant: noon + phase * DAY_MS,
		...where,
		phase: phaseOf(where.elevation),
	}
}
