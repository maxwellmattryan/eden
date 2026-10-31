<script lang="ts">
	// Amounts by bucket: what was spent each day, each week, each month. Where a TrendChart follows one series as it
	// moves, this compares buckets, each a bar from the floor, and may split a bar into as many as three series
	// stacked on one another (the first three given; a fourth would be more than the eye tells apart). It draws as
	// TrendChart draws: round figures up the side on hairlines, a label under every bar that has room, the container's
	// width and its own height. A bar under the pointer is read out above itself (`hover`): its bucket, a figure for
	// each series, and their sum when there is more than one; a finger pins the readout with a tap, moves it with a
	// horizontal scrub and leaves it standing until a tap elsewhere (D-168). Colour is not the only carrier: the legend names each
	// series beside its swatch, the SVG carries one sentence, and the same numbers stand as a table for a reader who
	// cannot see the drawing or point at it.
	import type { HTMLAttributes } from 'svelte/elements'
	import { useStrings } from '../../i18n/context.js'
	import { measure } from '../../internal/measure.js'
	import { chartRead, type ChartPlace } from '../../internal/chart-read.js'
	import ChartTip, { type ChartTipRow } from '../ChartTip/ChartTip.svelte'
	import { nearestIndex } from '../ChartTip/nearest.js'
	import { bars, MAX_SERIES, type BarSeries } from './bars.js'

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'aria-label'> & {
		/** The series, the first standing on the floor; only the first three are drawn. */
		series: readonly BarSeries[]
		/** A label for every bucket, along the bottom; one that would touch its neighbour is left out. */
		labels: readonly string[]
		/** How a figure is written: `(value) => '$' + value.toFixed(2)`. */
		format?: (value: number) => string
		/** The drawing height in px; the width is the container's. */
		height?: number
		/** About how many round figures go up the side. */
		figures?: number
		/** The accessible sentence: what is counted, by what, over what. */
		label: string
		/** Names each series beside its swatch, under the chart; on when there is more than one series. */
		legend?: boolean
		/** Reads out the bar under the pointer, above it: its bucket and a figure for each series. On unless set false. */
		hover?: boolean
	}
	let {
		series,
		labels,
		format = (value) => String(value),
		height = 160,
		figures = 3,
		label,
		legend,
		hover = true,
		class: className = '',
		...rest
	}: Props = $props()

	const LEFT = 48
	const BOTTOM = 22
	const TICK = 4

	let width = $state(0)
	const drawn = $derived(series.slice(0, MAX_SERIES))
	const geo = $derived(
		bars(
			drawn.map((one) => one.values),
			{ width, height, left: LEFT, bottom: labels.length ? BOTTOM : TICK + 2, labels, figures }
		)
	)
	const floor = $derived(geo.plot.y + geo.plot.height)
	const showLegend = $derived(legend ?? drawn.length > 1)

	const s = useStrings()
	const SWATCHES = ['primary', 'series-2', 'series-3'] as const
	// the bar being read: the one nearest the pointer across the plot, or the one a finger pinned (`chartRead`)
	let read = $state<number>()
	const reading = $derived(read === undefined ? undefined : geo.bars[read])
	function point(place: ChartPlace | undefined) {
		const at = place
			? nearestIndex(
					geo.bars.map((bar) => bar.centre),
					place.x
				)
			: -1
		read = at < 0 ? undefined : at
	}
	/** The bar's figures as the stack reads from its top down, then their sum when there is more than one. */
	const rowsOf = (index: number): ChartTipRow[] => [
		...drawn
			.map((one, at) => ({ label: one.label, value: format(one.values[index] ?? 0), swatch: SWATCHES[at] }))
			.reverse(),
		...(drawn.length > 1 ? [{ label: s.chart.total, value: format(geo.bars[index]?.total ?? 0), total: true }] : []),
	]
</script>

<div class={['ed-bars', className]} {...rest}>
	<div
		class="ed-bars-plot"
		style:height="{height}px"
		{@attach chartRead(() => ({ on: hover, onread: point }))}
		{@attach measure((rect) => (width = Math.round(rect.width)))}
	>
		{#if width > 0}
			<svg class="ed-bars-svg" {width} {height} viewBox="0 0 {width} {height}" role="img" aria-label={label}>
				{#each geo.ticks as tick (tick.value)}
					<line class="ed-bars-grid" x1={geo.plot.x} x2={geo.plot.x + geo.plot.width} y1={tick.y} y2={tick.y} />
					<text class="ed-bars-figure" x={geo.plot.x - 8} y={tick.y} dy="0.32em">{format(tick.value)}</text>
				{/each}
				{#each geo.bars as bar, i (i)}
					<g>
						<!-- the column being read stands on a soft ground, an empty bucket too -->
						<rect
							class={['ed-bars-hit', { 'ed-bars-read': read === i }]}
							x={bar.x}
							y={geo.plot.y}
							width={bar.width}
							height={geo.plot.height}
						/>
						{#each bar.segments as segment (segment.series)}
							<rect
								class="ed-bars-bar ed-bars-s{segment.series + 1}"
								x={bar.x}
								y={segment.y}
								width={bar.width}
								height={segment.height}
							/>
						{/each}
					</g>
					{#if bar.labelAt != null}
						<text class="ed-bars-label" x={bar.labelAt} y={floor + TICK + 4} dy="0.8em">{labels[i]}</text>
					{/if}
				{/each}
				<line class="ed-bars-axis" x1={geo.plot.x} x2={geo.plot.x + geo.plot.width} y1={floor} y2={floor} />
			</svg>
			{#if reading && read !== undefined}
				<ChartTip
					x={reading.centre}
					y={reading.segments.at(-1)?.y ?? floor}
					{width}
					title={labels[read]}
					rows={rowsOf(read)}
				/>
			{/if}
		{/if}
	</div>
	{#if showLegend}
		<ul class="ed-bars-legend">
			{#each drawn as one, s (one.id)}
				<li><span class="ed-bars-swatch ed-bars-s{s + 1}" aria-hidden="true"></span>{one.label}</li>
			{/each}
		</ul>
	{/if}
	<table class="ed-sr-only">
		<caption>{label}</caption>
		<thead>
			<tr>
				<td></td>
				{#each drawn as one (one.id)}<th scope="col">{one.label}</th>{/each}
			</tr>
		</thead>
		<tbody>
			{#each labels as bucket, i (i)}
				<tr>
					<th scope="row">{bucket || String(i + 1)}</th>
					{#each drawn as one (one.id)}<td>{format(one.values[i] ?? 0)}</td>{/each}
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.ed-bars {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		width: 100%;
		min-width: 0;
	}
	.ed-bars-plot {
		position: relative;
		width: 100%;
		min-width: 0;
	}
	.ed-bars-svg {
		display: block;
		overflow: visible;
	}
	.ed-bars-grid {
		stroke: var(--chart-grid);
		stroke-width: 1;
	}
	.ed-bars-axis {
		stroke: var(--chart-axis);
		stroke-width: 1;
	}
	.ed-bars-figure,
	.ed-bars-label {
		font: var(--ed-t-data-sm);
		letter-spacing: var(--ed-t-data-sm-tracking);
		font-variant-numeric: tabular-nums;
		fill: var(--chart-label);
	}
	.ed-bars-figure {
		text-anchor: end;
	}
	.ed-bars-hit {
		fill: transparent;
	}
	.ed-bars-read {
		fill: var(--surface-2);
	}
	/* a hairline of the ground between the series of one bar, so two that meet read as two */
	.ed-bars-bar {
		stroke: var(--surface-1);
		stroke-width: 1;
	}
	.ed-bars-s1 {
		fill: var(--chart-primary);
		background: var(--chart-primary);
	}
	.ed-bars-s2 {
		fill: var(--chart-series-2);
		background: var(--chart-series-2);
	}
	.ed-bars-s3 {
		fill: var(--chart-series-3);
		background: var(--chart-series-3);
	}
	.ed-bars-legend {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-4);
		margin: 0;
		padding: 0;
		list-style: none;
		font: var(--ed-t-label);
		letter-spacing: var(--ed-t-label-tracking);
		color: var(--text-secondary);
	}
	.ed-bars-legend li {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
	}
	.ed-bars-swatch {
		width: var(--space-2);
		height: var(--space-2);
		border-radius: var(--ed-radius-control);
	}
</style>
