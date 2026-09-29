<script lang="ts">
	// Where the sun is in its day: the wave it rides from one solar midnight to the next, the horizon across it, the
	// daylight above, and the sun itself at the instant given. Sunrise and sunset fix the whole drawing, so it needs
	// nothing else. The sun comes along the wave once, from the last of midnight, sunrise and sunset, when the
	// drawing appears; after that it moves only as the instant does, and never loops. Under reduced motion it is
	// simply there. Colour is not the only carrier: a sun above the horizon is filled and one beneath it hollow, and
	// the SVG carries one accessible sentence.
	import type { HTMLAttributes } from 'svelte/elements'
	import { measure } from '../../internal/measure.js'
	import { sunArc } from './sun.js'

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'aria-label'> & {
		/** The day's sunrise and sunset, as instants in milliseconds. */
		sunrise: number
		sunset: number
		/** The instant the sun is drawn at, in milliseconds. */
		now: number
		/** The two times as they are written, under their crossings; left out when they have no room. */
		labels?: { sunrise: string; sunset: string }
		/** The drawing height in px; the width is the container's. */
		height?: number
		/** The accessible sentence: whether the sun is up, when it rose and when it sets. */
		label: string
	}
	let { sunrise, sunset, now, labels, height = 96, label, class: className = '', ...rest }: Props = $props()

	/** The room for the times beneath the wave. */
	const BOTTOM = 20

	let width = $state(0)
	const geo = $derived(sunArc(sunrise, sunset, now, { width, height, labels, bottom: labels ? BOTTOM : 8 }))
	const floor = $derived(geo ? geo.plot.y + geo.plot.height : 0)
</script>

<div
	class={['ed-sun', className]}
	style:height="{height}px"
	{@attach measure((rect) => (width = Math.round(rect.width)))}
	{...rest}
>
	{#if geo}
		<svg class="ed-sun-svg" {width} {height} viewBox="0 0 {width} {height}" role="img" aria-label={label}>
			<path class="ed-sun-day" d={geo.day} />
			<path class="ed-sun-line" d={geo.line} />
			<path class="ed-sun-lit" d={geo.lit} />
			<line class="ed-sun-horizon" x1={geo.plot.x} x2={geo.plot.x + geo.plot.width} y1={geo.horizon} y2={geo.horizon} />
			<circle class="ed-sun-event" r="2.5" cx={geo.rise.x} cy={geo.rise.y} />
			<circle class="ed-sun-event" r="2.5" cx={geo.set.x} cy={geo.set.y} />
			{#if labels && geo.labels}
				<text class="ed-sun-label" x={geo.labels.sunrise} y={floor + 6} dy="0.8em">{labels.sunrise}</text>
				<text class="ed-sun-label" x={geo.labels.sunset} y={floor + 6} dy="0.8em">{labels.sunset}</text>
			{/if}
			<g class={['ed-sun-mark', { 'ed-sun-down': !geo.sun.up }]} style:offset-path="path('{geo.travel}')">
				<circle class="ed-sun-halo" r="10" />
				<circle class="ed-sun-disc" r="5" />
			</g>
		</svg>
	{/if}
</div>

<style>
	.ed-sun {
		display: block;
		width: 100%;
		min-width: 0;
	}
	.ed-sun-svg {
		display: block;
		overflow: visible;
	}
	.ed-sun-day {
		fill: var(--brand-muted);
		opacity: 0.6;
	}
	.ed-sun-line,
	.ed-sun-lit {
		fill: none;
		stroke-width: 1.75;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	/* The night's part of the wave is there to be seen through, a dashed line in the axis colour */
	.ed-sun-line {
		stroke: var(--chart-axis);
		stroke-dasharray: 2 5;
	}
	.ed-sun-lit {
		stroke: var(--chart-primary);
	}
	.ed-sun-horizon {
		stroke: var(--chart-axis);
		stroke-width: 1;
	}
	.ed-sun-event {
		fill: var(--chart-primary);
		stroke: var(--surface-1);
		stroke-width: 1.5;
	}
	.ed-sun-label {
		font: var(--ed-t-data-sm);
		letter-spacing: var(--ed-t-data-sm-tracking);
		font-variant-numeric: tabular-nums;
		fill: var(--chart-label);
	}
	/* The sun sits at the end of the way it came; the way is the path, so it arrives along the wave. The duration is
	   0 under reduced motion (base.css), and the sun is then where it is from the first frame. */
	.ed-sun-mark {
		offset-rotate: 0deg;
		offset-distance: 100%;
		animation: ed-sun-travel calc(var(--ed-duration-settle) * 2) var(--ed-ease-out) backwards;
	}
	.ed-sun-halo {
		fill: var(--chart-primary);
		opacity: 0.18;
	}
	.ed-sun-disc {
		fill: var(--chart-primary);
		stroke: var(--surface-1);
		stroke-width: 2;
	}
	.ed-sun-down .ed-sun-halo {
		opacity: 0;
	}
	.ed-sun-down .ed-sun-disc {
		fill: var(--surface-1);
		stroke: var(--chart-label);
		stroke-width: 1.75;
	}
	@keyframes ed-sun-travel {
		from {
			offset-distance: 0%;
		}
	}
</style>
