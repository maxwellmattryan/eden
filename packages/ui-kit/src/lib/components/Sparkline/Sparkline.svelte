<script lang="ts">
	// The numeric widget's chart: the series in chart-primary over a soft brand-muted area, the average or goal dashed
	// in chart-reference, the axis in chart-axis, the latest point marked. Colour is not the only carrier: the legend
	// names each line, and the SVG carries one accessible sentence.
	import type { HTMLAttributes } from 'svelte/elements'
	import { useStrings } from '../../i18n/context.js'
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
	}
	let {
		values = [],
		reference,
		width = 320,
		height = 48,
		label,
		legend,
		referenceLabel,
		class: className = '',
		...rest
	}: Props = $props()

	const s = useStrings()
	const geo = $derived(sparkline(values, { width, height, reference }))
	const name = $derived(label ?? (geo.latest == null ? s.noData : s.sparkline(geo.values.length, String(geo.latest))))
	const refName = $derived(referenceLabel ?? (reference == null ? '' : s.reference(String(reference))))
</script>

<div class="ed-spark-wrap {className}" style:width="{width}px" {...rest}>
	<svg class="ed-spark" viewBox="0 0 {width} {height}" role="img" aria-label={name} focusable="false">
		<line class="ed-spark-axis" x1={geo.axis.x1} x2={geo.axis.x2} y1={geo.axis.y} y2={geo.axis.y} />
		{#if geo.area}<path class="ed-spark-area" d={geo.area} />{/if}
		{#if geo.referenceY != null}
			<line class="ed-spark-ref" x1={geo.axis.x1} x2={geo.axis.x2} y1={geo.referenceY} y2={geo.referenceY} />
		{/if}
		{#if geo.line}<path class="ed-spark-line" d={geo.line} />{/if}
		{#if geo.last}<circle class="ed-spark-dot" r="3" cx={geo.last.x} cy={geo.last.y} />{/if}
	</svg>
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
