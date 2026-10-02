<script module lang="ts">
	/** One line of a chart's readout: a figure, with the series it belongs to and that series' colour when there are several. */
	export interface ChartTipRow {
		label?: string
		value: string
		/** The series' colour as the chart draws it. */
		swatch?: 'primary' | 'series-2' | 'series-3' | 'reference'
		/** A sum under the rows above it: set apart by a rule. */
		total?: boolean
	}
</script>

<script lang="ts">
	// What a chart says about the point under the pointer: the bucket or the moment, then a figure for each series
	// there. The kit's charts share it (BarChart, TrendChart, Sparkline) and it is not exported: a chart shows it while
	// it is being read and takes it away when the pointer leaves; on touch a tap pins it on a point, a horizontal scrub
	// moves it and it stays until a tap elsewhere (`internal/chart-read.ts`, D-168). It looks like the
	// tooltip, but it is not one: it
	// follows the pointer from point to point inside the chart, it holds several lines, and it shows at once. It sits
	// above the point, centred on it and kept inside the chart's width, and takes no pointer of its own. The figures it
	// shows are the chart's own, which the chart's sentence and its axes (and a BarChart's table) already carry, so it
	// is hidden from assistive technology.
	import { measure } from '../../internal/measure.js'

	type Props = {
		/** The point being read, in px from the chart's left and top. */
		x: number
		y: number
		/** The chart's width in px, which the bubble stays inside. */
		width: number
		/** The bucket or the moment: the label under the point. */
		title?: string
		rows: readonly ChartTipRow[]
	}
	let { x, y, width, title, rows }: Props = $props()

	// the bubble's own width, to centre it on the point and keep it inside the chart
	let wide = $state(0)
	const left = $derived(Math.max(0, Math.min(x - wide / 2, width - wide)))
</script>

<div
	class="ed-chart-tip"
	aria-hidden="true"
	style:left="{left}px"
	style:bottom="calc(100% - {y}px + var(--space-2))"
	{@attach measure((_, el) => (wide = el.offsetWidth))}
>
	{#if title}<div class="ed-chart-tip-title">{title}</div>{/if}
	{#each rows as row, i (i)}
		<div class={['ed-chart-tip-row', { 'ed-chart-tip-total': row.total }]}>
			{#if row.swatch}<span class="ed-chart-tip-swatch ed-chart-tip-{row.swatch}"></span>{/if}
			{#if row.label}<span class="ed-chart-tip-label">{row.label}</span>{/if}
			<span class="ed-chart-tip-value">{row.value}</span>
		</div>
	{/each}
</div>

<style>
	.ed-chart-tip {
		position: absolute;
		z-index: var(--ed-z-popover);
		display: grid;
		gap: var(--space-1);
		box-sizing: border-box;
		width: max-content;
		max-width: 100%;
		padding: var(--space-2);
		border: 1px solid var(--stroke);
		border-radius: var(--ed-radius-control);
		background: var(--surface-1);
		color: var(--text-primary);
		box-shadow: var(--shadow-card);
		pointer-events: none;
		transition: opacity var(--ed-duration-micro) var(--ed-ease-out);
	}
	@starting-style {
		.ed-chart-tip {
			opacity: 0;
		}
	}
	.ed-chart-tip-title {
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		font-variation-settings: var(--ed-t-caption-opsz);
		color: var(--text-secondary);
	}
	.ed-chart-tip-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		font-variation-settings: var(--ed-t-caption-opsz);
		white-space: nowrap;
	}
	.ed-chart-tip-total {
		padding-top: var(--space-1);
		border-top: 1px solid var(--stroke-subtle);
	}
	.ed-chart-tip-swatch {
		flex: none;
		width: var(--space-2);
		height: var(--space-2);
		border-radius: var(--ed-radius-control);
	}
	.ed-chart-tip-primary {
		background: var(--chart-primary);
	}
	.ed-chart-tip-series-2 {
		background: var(--chart-series-2);
	}
	.ed-chart-tip-series-3 {
		background: var(--chart-series-3);
	}
	.ed-chart-tip-reference {
		background: var(--chart-reference);
	}
	.ed-chart-tip-label {
		color: var(--text-secondary);
	}
	/* the figure at the row's end, in the data face, so a column of them lines up */
	.ed-chart-tip-value {
		margin-left: auto;
		padding-left: var(--space-2);
		font: var(--ed-t-data-sm);
		letter-spacing: var(--ed-t-data-sm-tracking);
		font-variant-numeric: tabular-nums;
	}
</style>
