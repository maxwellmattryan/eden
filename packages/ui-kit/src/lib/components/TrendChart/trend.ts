// The trend chart's geometry, kept pure so it can be tested without a DOM: a scale with round ticks, the series as a
// path, and which of the labels along the bottom have room to be written.

export interface TrendOptions {
	/** The drawing width and height, in px. */
	width: number
	height: number
	/** The room kept for the figures on the left and the labels along the bottom. */
	left: number
	bottom: number
	/** The room kept above and to the right, so the stroke and the last label stay inside. */
	top?: number
	right?: number
	/** A label for every value, along the bottom; an empty one is a tick without words. */
	labels?: readonly string[]
	/** The least room between two written labels, and the width a character of one takes. */
	labelGap?: number
	charWidth?: number
	/** About how many round figures go up the side, when no step is given. */
	figures?: number
	/** The distance between two figures up the side: 10 for tens. The scale runs from the step at or below the
	 * lowest value to the step at or above the highest. */
	step?: number
}

export interface TrendGeometry {
	/** The plot's box. */
	plot: { x: number; y: number; width: number; height: number }
	line: string
	area: string
	/** A point for every value: where its tick sits, and where its label starts when there is room to write it. */
	points: { x: number; y: number; value: number; labelAt: number | null }[]
	/** The highest and the lowest points, the first of each; null when the series is flat or empty. */
	high: { x: number; y: number; value: number } | null
	low: { x: number; y: number; value: number } | null
	/** The round figures up the side, lowest first. */
	ticks: { value: number; y: number }[]
}

const fmt = (n: number) => n.toFixed(1)

/** Round figures that span a range: steps of 1, 2 or 5 times a power of ten, about `count` of them. */
export function niceTicks(lo: number, hi: number, count = 4): number[] {
	if (!Number.isFinite(lo) || !Number.isFinite(hi)) return []
	if (hi === lo) {
		lo -= 1
		hi += 1
	}
	const rough = (hi - lo) / Math.max(1, count)
	const power = 10 ** Math.floor(Math.log10(rough))
	const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= rough) ?? 10 * power
	const first = Math.floor(lo / step) * step
	const ticks: number[] = []
	for (let v = first; v < hi + step; v += step) ticks.push(Math.round(v * 1e6) / 1e6)
	return ticks
}

/**
 * The figures of a scale in whole steps: from the step at or below the lowest value to the step at or above the
 * highest, so a high of 95 in tens tops out at 100 and a low of 72 starts at 70. A flat series on a step opens by one
 * step upward.
 */
export function stepTicks(lo: number, hi: number, step: number): number[] {
	if (!Number.isFinite(lo) || !Number.isFinite(hi) || !(step > 0)) return []
	const first = Math.floor(lo / step) * step
	let last = Math.ceil(hi / step) * step
	if (last === first) last = first + step
	const ticks: number[] = []
	for (let v = first; v <= last + step / 1e6; v += step) ticks.push(Math.round(v * 1e6) / 1e6)
	return ticks
}

/**
 * Where each label starts, or null where it is not written: centred under its tick, kept inside the drawing, and
 * dropped when it would come within `gap` of the one written before it. Labels never touch, whatever the width.
 */
export function placeLabels(
	xs: readonly number[],
	labels: readonly string[],
	width: number,
	gap: number,
	charWidth: number
): (number | null)[] {
	let edge = -Infinity
	return xs.map((x, i) => {
		const text = labels[i]
		if (!text) return null
		const wide = text.length * charWidth
		const start = Math.min(Math.max(0, x - wide / 2), Math.max(0, width - wide))
		if (start < edge + gap) return null
		edge = start + wide
		return Math.round(start * 10) / 10
	})
}

export function trend(input: readonly number[], options: TrendOptions): TrendGeometry {
	const {
		width,
		height,
		left,
		bottom,
		top = 8,
		right = 8,
		labels = [],
		labelGap = 14,
		charWidth = 8,
		figures = 3,
		step,
	} = options
	const kept = input
		.map((value, i) => ({ value, label: labels[i] ?? '' }))
		.filter((item) => Number.isFinite(item.value))
	const values = kept.map((item) => item.value)
	const plot = {
		x: left,
		y: top,
		width: Math.max(1, width - left - right),
		height: Math.max(1, height - top - bottom),
	}
	if (!values.length) return { plot, line: '', area: '', points: [], ticks: [], high: null, low: null }

	// the scale runs between round figures that hold the whole series: whole steps when a step is given, else steps
	// of 1, 2 or 5 times a power of ten
	const least = Math.min(...values)
	const most = Math.max(...values)
	const rounds = step ? stepTicks(least, most, step) : niceTicks(least, most, figures)
	const lo = rounds[0]!
	const hi = rounds[rounds.length - 1]!
	const y = (v: number) => plot.y + plot.height * (1 - (v - lo) / (hi - lo))
	const x = (i: number) => plot.x + (values.length === 1 ? 0 : (i * plot.width) / (values.length - 1))
	const xs = values.map((_, i) => x(i))
	const starts = placeLabels(
		xs,
		kept.map((item) => item.label),
		width,
		labelGap,
		charWidth
	)

	const points = values.map((value, i) => ({ x: xs[i]!, y: y(value), value, labelAt: starts[i] ?? null }))
	const line = points.map((p, i) => `${i ? 'L' : 'M'}${fmt(p.x)} ${fmt(p.y)}`).join(' ')
	const floor = plot.y + plot.height
	const last = points[points.length - 1]!
	const area = `${line} L${fmt(last.x)} ${fmt(floor)} L${fmt(points[0]!.x)} ${fmt(floor)} Z`
	const top1 = Math.max(...values)
	const bottom1 = Math.min(...values)
	const pick = (value: number) => {
		const point = points.find((p) => p.value === value)!
		return { x: point.x, y: point.y, value }
	}
	return {
		plot,
		line,
		area,
		points,
		ticks: rounds.map((value) => ({ value, y: y(value) })),
		high: top1 === bottom1 ? null : pick(top1),
		low: top1 === bottom1 ? null : pick(bottom1),
	}
}
