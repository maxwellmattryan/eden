// Where a value sits on a banded scale whose bands are drawn equally wide, whatever range each covers. Pure.

/** The band a value falls in (0-based) on a scale whose bands end at `stops`, and how far along that band, 0 to 1. */
export function bandOf(value: number, stops: readonly number[], min = 0): { band: number; along: number } {
	const last = stops.length - 1
	if (last < 0 || !Number.isFinite(value)) return { band: 0, along: 0 }
	const band = Math.max(
		0,
		stops.findIndex((stop) => value <= stop)
	)
	if (value > (stops[last] ?? 0)) return { band: last, along: 1 }
	const from = band === 0 ? min : (stops[band - 1] ?? min)
	const to = stops[band] ?? from
	const along = to === from ? 0 : (value - from) / (to - from)
	return { band, along: Math.min(1, Math.max(0, along)) }
}

/** The marker's place along the whole scale, in percent. */
export function markerAt(value: number, stops: readonly number[], min = 0): number {
	if (!stops.length) return 0
	const { band, along } = bandOf(value, stops, min)
	return Math.round(((band + along) / stops.length) * 1000) / 10
}
