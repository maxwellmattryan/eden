<script lang="ts">
	// A series over time with its axes: the temperature over the coming hours, a weight over a month. Where a
	// Sparkline is a gesture, this is a chart to read: a tick along the bottom for every point, with as many labels as
	// have room (they never touch), a few round figures up the side on hairlines, and the highest and lowest points
	// marked with their values, since those are what a reader looks for. It fills its container's width and keeps its
	// height, and it needs no legend, since it draws one series and its axes say what that is. The point nearest the
	// pointer is read out above itself (`hover`), on a hairline down to its tick; a finger pins the readout with a
	// tap, moves it with a horizontal scrub and leaves it standing until a tap elsewhere (D-TBD(chart-touch)). Colour
	// is not the only carrier: the SVG carries one accessible sentence.
	import type { HTMLAttributes } from 'svelte/elements'
	import { measure } from '../../internal/measure.js'
	import { chartRead, type ChartPlace } from '../../internal/chart-read.js'
	import ChartTip from '../ChartTip/ChartTip.svelte'
	import { nearestIndex } from '../ChartTip/nearest.js'
	import { trend } from './trend.js'

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'aria-label'> & {
		/** The series, oldest first. Non-finite entries are skipped. */
		values: readonly number[]
		/** A label for every value, along the bottom: the hour, the day. An empty one is a tick without words, and one
		 * that would touch its neighbour is left out. */
		labels?: readonly string[]
		/** How a figure up the side is written: `(value) => value + '°'`. */
		format?: (value: number) => string
		/** The drawing height in px; the width is the container's. */
		height?: number
		/** About how many round figures go up the side, when no step is given. */
		figures?: number
		/** The distance between two figures up the side: 10 for tens. The lowest figure is the step at or below the
		 * lowest value and the highest the step at or above the highest. */
		step?: number
		/** Marks the highest and the lowest points with their values. */
		extremes?: boolean
		/** The accessible sentence: what the series is, over what, from where to where. */
		label: string
		/** Reads out the point nearest the pointer, above it: its name and its value. On unless set false. */
		hover?: boolean
		/** What each point is called in the readout, where `labels` leaves some unnamed: every hour, not the round ones. */
		titles?: readonly string[]
	}
	let {
		values,
		labels = [],
		format = (value) => String(value),
		height = 96,
		figures = 3,
		step,
		extremes = true,
		label,
		hover = true,
		titles,
		class: className = '',
		...rest
	}: Props = $props()

	/** The room for the figures on the left and the labels along the bottom. */
	const LEFT = 36
	const BOTTOM = 22
	const TICK = 4

	let width = $state(0)
	const TOP = 18
	const geo = $derived(
		trend(values, {
			width,
			height,
			left: LEFT,
			top: extremes ? TOP : 8,
			bottom: labels.length ? BOTTOM : TICK + 2,
			labels,
			figures,
			step,
		})
	)
	const marks = $derived(extremes ? [geo.high, geo.low].flatMap((mark) => (mark ? [mark] : [])) : [])
	const floor = $derived(geo.plot.y + geo.plot.height)

	// the point being read: the one nearest the pointer across the plot, or the one a finger pinned (`chartRead`)
	let read = $state<number>()
	const reading = $derived(read === undefined ? undefined : geo.points[read])
	function point(place: ChartPlace | undefined) {
		const at = place
			? nearestIndex(
					geo.points.map((one) => one.x),
					place.x
				)
			: -1
		read = at < 0 ? undefined : at
	}
</script>

<div
	class={['ed-trend', className]}
	style:height="{height}px"
	{@attach chartRead(() => ({ on: hover, onread: point }))}
	{@attach measure((rect) => (width = Math.round(rect.width)))}
	{...rest}
>
	{#if width > 0}
		<svg class="ed-trend-svg" {width} {height} viewBox="0 0 {width} {height}" role="img" aria-label={label}>
			{#each geo.ticks as tick (tick.value)}
				<line class="ed-trend-grid" x1={geo.plot.x} x2={geo.plot.x + geo.plot.width} y1={tick.y} y2={tick.y} />
				<text class="ed-trend-figure" x={geo.plot.x - 8} y={tick.y} dy="0.32em">{format(tick.value)}</text>
			{/each}
			<line class="ed-trend-axis" x1={geo.plot.x} x2={geo.plot.x + geo.plot.width} y1={floor} y2={floor} />
			{#each geo.points as point, i (i)}
				<line
					class="ed-trend-axis"
					x1={point.x}
					x2={point.x}
					y1={floor}
					y2={floor + (point.labelAt == null ? TICK : TICK + 3)}
				/>
				{#if point.labelAt != null}
					<text class="ed-trend-label" x={point.labelAt} y={floor + TICK + 4} dy="0.8em">{labels[i]}</text>
				{/if}
			{/each}
			{#if geo.area}<path class="ed-trend-area" d={geo.area} />{/if}
			{#if reading}<line class="ed-trend-guide" x1={reading.x} x2={reading.x} y1={geo.plot.y} y2={floor} />{/if}
			{#if geo.line}<path class="ed-trend-line" d={geo.line} />{/if}
			{#if reading}<circle class="ed-trend-dot ed-trend-read" r="4" cx={reading.x} cy={reading.y} />{/if}
			{#each marks as mark (mark.value)}
				<circle class="ed-trend-dot" r="3" cx={mark.x} cy={mark.y} />
				<text
					class="ed-trend-mark"
					x={Math.min(Math.max(mark.x, geo.plot.x + 14), geo.plot.x + geo.plot.width - 14)}
					y={mark.y - 7}
					text-anchor="middle">{format(mark.value)}</text
				>
			{/each}
		</svg>
		{#if reading && read !== undefined}
			<ChartTip
				x={reading.x}
				y={reading.y}
				{width}
				title={titles?.[read] ?? labels[read]}
				rows={[{ value: format(reading.value), swatch: 'primary' }]}
			/>
		{/if}
	{/if}
</div>

<style>
	.ed-trend {
		position: relative;
		display: block;
		width: 100%;
		min-width: 0;
	}
	.ed-trend-svg {
		display: block;
		overflow: visible;
	}
	.ed-trend-grid {
		stroke: var(--chart-grid);
		stroke-width: 1;
	}
	.ed-trend-axis {
		stroke: var(--chart-axis);
		stroke-width: 1;
	}
	.ed-trend-line {
		fill: none;
		stroke: var(--chart-primary);
		stroke-width: 1.75;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.ed-trend-area {
		fill: var(--brand-muted);
		opacity: 0.6;
	}
	.ed-trend-figure,
	.ed-trend-label {
		font: var(--ed-t-data-sm);
		letter-spacing: var(--ed-t-data-sm-tracking);
		font-variant-numeric: tabular-nums;
		fill: var(--chart-label);
	}
	.ed-trend-figure {
		text-anchor: end;
	}
	.ed-trend-dot {
		fill: var(--chart-primary);
	}
	/* the point being read: a hairline down to its tick, and its dot ringed with the ground */
	.ed-trend-guide {
		stroke: var(--chart-axis);
		stroke-width: 1;
	}
	.ed-trend-read {
		stroke: var(--surface-1);
		stroke-width: 2;
	}
	/* The high and the low, in the text colour with the ground behind them so the line never runs through a figure */
	.ed-trend-mark {
		font: var(--ed-t-data-sm);
		letter-spacing: var(--ed-t-data-sm-tracking);
		font-weight: 500;
		font-variant-numeric: tabular-nums;
		fill: var(--text-primary);
		stroke: var(--surface-1);
		stroke-width: 3;
		paint-order: stroke;
	}
</style>
