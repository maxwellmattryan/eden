// The sun arc's geometry, kept pure so it can be tested without a DOM. The sun's height over a day is a cosine of the
// time since solar noon, raised or lowered by the season, so sunrise and sunset fix the whole drawing: their midpoint
// is solar noon, and the length of the day between them says where the horizon cuts the wave. The wave itself never
// changes; the horizon rises through it in winter and sinks in summer.
import { placeLabels } from '../TrendChart/trend.js'

export interface SunArcOptions {
	/** The drawing width and height, in px. */
	width: number
	height: number
	/** The room kept above and at the sides, so the sun stays inside at noon and at midnight. */
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
export interface SunArcGeometry {
	/** The plot's box: a day from one solar midnight to the next. */
	plot: {
		x: number
		y: number
		width: number
		height: number
	}
	/** Where the horizon lies. */
	horizon: number
	/** The whole wave, and the part of it above the horizon. */
	line: string
	lit: string
	/** The part above the horizon closed along it: the daylight. */
	day: string
	rise: SunArcPoint
	set: SunArcPoint
	/** Where the sun is, and whether it is above the horizon. */
	sun: SunArcPoint & {
		up: boolean
	}
	/** The way the sun came: along the wave from the last of midnight, sunrise and sunset to where it is. */
	travel: string
	/** Where each time starts, or null when the two have no room beside each other. */
	labels: { sunrise: number; sunset: number } | null
}

const DAY_MS = 24 * 60 * 60 * 1000
const fmt = (n: number) => n.toFixed(1)
/**
 * The drawing for a day's sunrise and sunset and an instant, all in milliseconds. The instant may be any: the sun's
 * place repeats daily, so one before the day's solar midnight or after the next is read as the same time of day.
 * Null without a day to draw: no width, a sunset that is not after its sunrise, or a day of 24 hours or more.
 */
export function sunArc(sunrise: number, sunset: number, now: number, options: SunArcOptions): SunArcGeometry | null {
	const {
		width,
		height,
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
	if (!(width > 0) || !(height > 0)) return null
	const plot = {
		x: side,
		y: top,
		width: Math.max(1, width - side * 2),
		height: Math.max(1, height - top - bottom),
	}
	// a phase is the time since solar noon in days, from -0.5 to 0.5; the sun is up within `half` of noon
	const noon = (sunrise + sunset) / 2
	const half = length / DAY_MS / 2
	const x = (phase: number) => plot.x + plot.width * (phase + 0.5)
	const y = (phase: number) => plot.y + (plot.height * (1 - Math.cos(2 * Math.PI * phase))) / 2
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
		horizon: y(half),
		line: path(-0.5, 0.5),
		lit,
		day: `${lit} Z`,
		rise: point(-half),
		set: point(half),
		sun: { ...point(phase), up: Math.abs(phase) < half },
		travel: path(since, phase),
		labels: first != null && second != null ? { sunrise: first, sunset: second } : null,
	}
}
