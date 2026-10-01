// The sparkline's geometry, kept pure so it can be tested without a DOM. It never yields a NaN: non-finite values are
// skipped, an empty series draws only the axis, and a single value draws a flat line across the width.

export interface SparklineOptions {
	/** The drawing width, in SVG units. */
	width: number
	/** The drawing height, in SVG units. */
	height: number
	/** An average or goal, included in the scale and drawn as a dashed line. */
	reference?: number
	/** The inset that keeps the stroke and the latest point's dot inside the box. */
	pad?: number
}

export interface SparklineGeometry {
	/** The finite values that were drawn, oldest first. */
	values: number[]
	/** The latest drawn value, or null when there is none. */
	latest: number | null
	/** The series as an SVG path (`M … L …`); empty when there is nothing to draw. */
	line: string
	/** The area under the series, closed down to the axis; empty when there is nothing to draw. */
	area: string
	/** The reference's y, or null when there is no usable reference. */
	referenceY: number | null
	/** The latest point, or null. */
	last: { x: number; y: number } | null
	/** A point for every drawn value, oldest first: where a pointer reads it. */
	points: { x: number; y: number; value: number }[]
	/** The axis along the bottom. */
	axis: { x1: number; x2: number; y: number }
}

const round = (n: number) => Math.round(n * 10) / 10
const fmt = (n: number) => n.toFixed(1)

export function sparkline(input: readonly number[], options: SparklineOptions): SparklineGeometry {
	const { width, height, reference, pad = 4 } = options
	const values = input.filter((v) => Number.isFinite(v))
	const ref = reference != null && Number.isFinite(reference) ? reference : null
	const inner = Math.max(1, width - 2 * pad)
	const tall = Math.max(1, height - 2 * pad)
	const axis = { x1: pad, x2: pad + inner, y: pad + tall }

	let lo = Infinity
	let hi = -Infinity
	for (const v of ref == null ? values : [...values, ref]) {
		if (v < lo) lo = v
		if (v > hi) hi = v
	}
	if (!Number.isFinite(lo)) lo = hi = 0
	if (hi === lo) {
		lo -= 1
		hi += 1
	}
	const y = (v: number) => pad + tall * (1 - (v - lo) / (hi - lo))
	const x = (i: number) => pad + (i * inner) / Math.max(1, values.length - 1)
	const referenceY = ref == null ? null : round(y(ref))

	if (values.length === 0) return { values, latest: null, line: '', area: '', referenceY, last: null, points: [], axis }

	const points: [number, number][] =
		values.length === 1
			? [
					[pad, y(values[0]!)],
					[pad + inner, y(values[0]!)],
				]
			: values.map((v, i) => [x(i), y(v)])
	const line = points.map(([px, py], i) => `${i ? 'L' : 'M'}${fmt(px)} ${fmt(py)}`).join(' ')
	const [firstX] = points[0]!
	const [lastX, lastY] = points[points.length - 1]!
	const area = `${line} L${fmt(lastX)} ${fmt(axis.y)} L${fmt(firstX)} ${fmt(axis.y)} Z`

	return {
		values,
		latest: values[values.length - 1]!,
		line,
		area,
		referenceY,
		last: { x: round(lastX), y: round(lastY) },
		// a lone value is drawn as a flat line across the width and read at its end, where its dot is
		points: values.map((value, i) => ({ x: round(values.length === 1 ? lastX : x(i)), y: round(y(value)), value })),
		axis,
	}
}
