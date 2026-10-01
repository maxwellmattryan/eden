// The bar chart's geometry, kept pure so it can be tested without a DOM: a scale from nothing up to a round figure,
// a bar for every bucket with its series stacked from the floor, and which of the labels along the bottom have room.
import { niceTicks, placeLabels } from '../TrendChart/trend.js'

/** One series: a name for the legend and a value for every bucket. */
export interface BarSeries {
	id: string
	label: string
	values: readonly number[]
}

export interface BarsOptions {
	/** The drawing width and height, in px. */
	width: number
	height: number
	/** The room kept for the figures on the left and the labels along the bottom. */
	left: number
	bottom: number
	top?: number
	right?: number
	/** A label for every bucket, along the bottom; an empty one is a bar without words. */
	labels?: readonly string[]
	labelGap?: number
	charWidth?: number
	/** About how many round figures go up the side. */
	figures?: number
	/** The widest a bar gets, and the share of its band it takes when the band is narrower. */
	maxBar?: number
	fill?: number
}

export interface BarsGeometry {
	plot: { x: number; y: number; width: number; height: number }
	/** A bar for every bucket: its box, its series from the floor up, and where its label starts when it has room. */
	bars: {
		x: number
		width: number
		centre: number
		total: number
		segments: { series: number; y: number; height: number; value: number }[]
		labelAt: number | null
	}[]
	/** The round figures up the side, from nothing. */
	ticks: { value: number; y: number }[]
}

/** How many series one bar stacks: a fourth would be more than the eye tells apart (design/visual-language.md). */
export const MAX_SERIES = 3

const amount = (value: number | undefined) =>
	typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0

export function bars(series: readonly (readonly number[])[], options: BarsOptions): BarsGeometry {
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
		maxBar = 28,
		fill = 0.7,
	} = options
	const drawn = series.slice(0, MAX_SERIES)
	const count = Math.max(labels.length, ...drawn.map((values) => values.length), 0)
	const plot = {
		x: left,
		y: top,
		width: Math.max(1, width - left - right),
		height: Math.max(1, height - top - bottom),
	}
	const totals = Array.from({ length: count }, (_, i) => drawn.reduce((sum, values) => sum + amount(values[i]), 0))
	const most = Math.max(0, ...totals)
	// from nothing to the round figure at or above the tallest bar; a chart of nothing keeps its floor alone
	const rounds = most > 0 ? niceTicks(0, most, figures).filter((value) => value >= 0) : [0]
	const hi = most > 0 ? rounds[rounds.length - 1]! : 1
	const floor = plot.y + plot.height
	const y = (value: number) => floor - (plot.height * value) / hi
	const band = count ? plot.width / count : plot.width
	const barWidth = Math.max(1, Math.min(maxBar, band * fill))
	const centres = totals.map((_, i) => plot.x + band * (i + 0.5))
	const starts = placeLabels(centres, labels, width, labelGap, charWidth)

	return {
		plot,
		bars: totals.map((total, i) => {
			let below = 0
			const segments = drawn.flatMap((values, s) => {
				const value = amount(values[i])
				if (!value) return []
				const segment = { series: s, y: y(below + value), height: y(below) - y(below + value), value }
				below += value
				return [segment]
			})
			return {
				x: centres[i]! - barWidth / 2,
				width: barWidth,
				centre: centres[i]!,
				total,
				segments,
				labelAt: starts[i] ?? null,
			}
		}),
		ticks: rounds.map((value) => ({ value, y: y(value) })),
	}
}
