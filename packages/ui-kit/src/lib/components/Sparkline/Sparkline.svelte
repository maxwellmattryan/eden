<script lang="ts">
	// The numeric widget's chart: the series in chart-primary over a soft brand-muted area, the average or goal dashed
	// in chart-reference, the axis in chart-axis, the latest point marked. The value nearest the pointer is read out
	// above its point (`hover`). Colour is not the only carrier: the legend names each line, and the SVG carries one
	// accessible sentence.
	import type { HTMLAttributes } from 'svelte/elements'
	import { useStrings } from '../../i18n/context.js'
	import { chartRead, type ChartPlace } from '../../internal/chart-read.js'
	import ChartTip from '../ChartTip/ChartTip.svelte'
	import { nearestIndex } from '../ChartTip/nearest.js'
	import { sparkline } from './sparkline.js'

	type Props = HTMLAttributes<HTMLDivElement> & {
		/** The series, oldest first. Non-finite entries are skipped. */
		values?: readonly number[]
		/** An average or goal: a dashed line, included in the scale. */
		reference?: number
		/** The drawing width in px; the chart shrinks with its container. */
		width?: number
		/** The drawing height in px. */
		height?: number
		/** The SVG's accessible sentence. Defaults to the count and the latest value, or "No data yet". */
		label?: string
		/** Names the series under the chart; the legend appears only when this is set. */
		legend?: string
		/** Names the reference line in the legend. Defaults to "reference <value>". */
		referenceLabel?: string
		/** How a value is written in the readout: `(value) => value + ' kg'`. */
		format?: (value: number) => string
		/** A label for every value, the readout's first line: the day, the hour. */
		labels?: readonly string[]
		/** Reads out the value nearest the pointer, above its point. On unless set false. */
		hover?: boolean
	}
	let {
		values = [],
		reference,
		width = 320,
		height = 48,
		label,
		legend,
		referenceLabel,
		format = (value) => String(value),
		labels = [],
		hover = true,
		class: className = '',
		...rest
	}: Props = $props()

	const s = useStrings()
	const geo = $derived(sparkline(values, { width, height, reference }))
	const name = $derived(label ?? (geo.latest == null ? s.noData : s.sparkline(geo.values.length, String(geo.latest))))
	const refName = $derived(referenceLabel ?? (reference == null ? '' : s.reference(String(reference))))

	// the point being read: the one nearest the pointer. The drawing scales with its container, so the pointer's
	// place is taken back to the drawing's units, and the readout's place out to the container's.
	let read = $state<number>()
	let scale = $state(1)
	const reading = $derived(read === undefined ? undefined : geo.points[read])
	// A finger pins the readout, scrubs it and leaves it until a tap elsewhere (`chartRead`, D-168).
	function point(place: ChartPlace | undefined, el: HTMLElement) {
		scale = el.offsetWidth / width || 1
		const at = place
			? nearestIndex(
					geo.points.map((one) => one.x),
					place.x / scale
				)
			: -1
		read = at < 0 ? undefined : at
	}
</script>

<div class="ed-spark-wrap {className}" style:width="{width}px" {...rest}>
	<div class="ed-spark-plot" {@attach chartRead(() => ({ on: hover, onread: point }))}>
		<svg class="ed-spark" viewBox="0 0 {width} {height}" role="img" aria-label={name} focusable="false">
			<line class="ed-spark-axis" x1={geo.axis.x1} x2={geo.axis.x2} y1={geo.axis.y} y2={geo.axis.y} />
			{#if geo.area}<path class="ed-spark-area" d={geo.area} />{/if}
			{#if geo.referenceY != null}
				<line class="ed-spark-ref" x1={geo.axis.x1} x2={geo.axis.x2} y1={geo.referenceY} y2={geo.referenceY} />
			{/if}
			{#if geo.line}<path class="ed-spark-line" d={geo.line} />{/if}
			{#if geo.last}<circle class="ed-spark-dot" r="3" cx={geo.last.x} cy={geo.last.y} />{/if}
			{#if reading}<circle class="ed-spark-dot ed-spark-read" r="3.5" cx={reading.x} cy={reading.y} />{/if}
		</svg>
		{#if reading && read !== undefined}
			<ChartTip
				x={reading.x * scale}
				y={reading.y * scale}
				width={width * scale}
				title={labels[read]}
				rows={[{ value: format(reading.value), swatch: 'primary' }]}
			/>
		{/if}
	</div>
	{#if legend}
		<div class="ed-spark-legend">
			<span class="ed-spark-key"><span class="ed-spark-swatch" aria-hidden="true"></span>{legend}</span>
			{#if geo.referenceY != null}
				<span class="ed-spark-key"
					><span class="ed-spark-swatch ed-spark-swatch-ref" aria-hidden="true"></span>{refName}</span
				>
			{/if}
		</div>
	{/if}
</div>

<style>
	.ed-spark-wrap {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		max-width: 100%;
	}
	.ed-spark-plot {
		position: relative;
	}
	.ed-spark {
		display: block;
		width: 100%;
		height: auto;
		overflow: visible;
	}
	.ed-spark-axis {
		stroke: var(--chart-axis);
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}
	.ed-spark-line {
		fill: none;
		stroke: var(--chart-primary);
		stroke-width: 1.75;
		stroke-linecap: round;
		stroke-linejoin: round;
		vector-effect: non-scaling-stroke;
	}
	.ed-spark-ref {
		fill: none;
		stroke: var(--chart-reference);
		stroke-width: 1;
		stroke-dasharray: 3 3;
		vector-effect: non-scaling-stroke;
	}
	.ed-spark-dot {
		fill: var(--chart-primary);
	}
	/* the point being read, ringed with the ground */
	.ed-spark-read {
		stroke: var(--surface-1);
		stroke-width: 2;
		vector-effect: non-scaling-stroke;
	}
	.ed-spark-area {
		fill: var(--brand-muted);
		opacity: 0.6;
	}
	.ed-spark-legend {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		color: var(--chart-label);
	}
	.ed-spark-key {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
	}
	.ed-spark-swatch {
		display: inline-block;
		width: var(--space-3);
		height: 0;
		border-top: 2px solid var(--chart-primary);
	}
	.ed-spark-swatch-ref {
		border-top: 1px dashed var(--chart-reference);
	}
</style>
