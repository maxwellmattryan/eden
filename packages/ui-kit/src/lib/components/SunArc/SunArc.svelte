<script lang="ts">
	// Where the sun is in its day: its elevation from one solar midnight to the next, the horizon across it, the
	// daylight above, the twilights' thresholds beneath, and the sun itself at the instant given. The wave is the true
	// one for the place: sunrise and sunset fix solar noon, the date the sun's declination, and the latitude how high
	// it climbs and how deep it sinks (`sun.ts` has the formula), so the top of the wave carries the noon elevation
	// and the wave changes its shape with the season and the place. The sun comes along the wave once, from the last
	// of midnight, sunrise and sunset, when the drawing appears; after that it moves only as the instant does, and
	// never loops. Under reduced motion it is simply there. Given a way to write a time (`format`), the wave is read
	// under the pointer: the time of day there, what the light is, and the sun's elevation and bearing, on a hairline
	// through the wave. Colour is not the only carrier: a sun above the horizon is filled and one beneath it hollow,
	// and the SVG carries one accessible sentence.
	import type { HTMLAttributes } from 'svelte/elements'
	import { useStrings } from '../../i18n/context.js'
	import { measure } from '../../internal/measure.js'
	import { chartRead, type ChartPlace } from '../../internal/chart-read.js'
	import ChartTip from '../ChartTip/ChartTip.svelte'
	import { sunArc, sunAt } from './sun.js'

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'aria-label'> & {
		/** The day's sunrise and sunset, as instants in milliseconds. */
		sunrise: number
		sunset: number
		/** The instant the sun is drawn at, in milliseconds. */
		now: number
		/** The place's latitude in degrees, north positive: what makes the wave the place's own. */
		latitude: number
		/** The two times as they are written, under their crossings; left out when they have no room. */
		labels?: { sunrise: string; sunset: string }
		/** The drawing height in px; the width is the container's. */
		height?: number
		/** The accessible sentence: whether the sun is up, when it rose and when it sets. */
		label: string
		/** How an instant is written, on the owner's clock: with it the wave is read under the pointer. */
		format?: (instant: number) => string
		/** Reads out the time of day under the pointer, the light, and the sun's elevation and bearing; needs `format`. */
		hover?: boolean
	}
	let {
		sunrise,
		sunset,
		now,
		latitude,
		labels,
		height = 96,
		label,
		format,
		hover = true,
		class: className = '',
		...rest
	}: Props = $props()

	const s = useStrings()

	/** The room for the times beneath the wave. */
	const BOTTOM = 20

	let width = $state(0)
	/** The room above the wave for the noon elevation. */
	const TOP = 20
	const geo = $derived(
		sunArc(sunrise, sunset, now, { width, height, latitude, labels, top: TOP, bottom: labels ? BOTTOM : 8 })
	)
	/** Whole degrees with a true minus: 54°, −12°. */
	const degrees = (value: number) => `${Math.round(value) < 0 ? '−' : ''}${Math.abs(Math.round(value))}°`
	const BEARINGS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const
	const bearing = (azimuth: number) => s.sunArc.bearings[BEARINGS[Math.round(azimuth / 45) % 8]!]
	const floor = $derived(geo ? geo.plot.y + geo.plot.height : 0)

	// the place across the wave being read, and what the wave says there
	const reads = $derived(hover && !!format)
	let at = $state<number>()
	const reading = $derived(geo && at !== undefined ? sunAt(sunrise, sunset, latitude, geo, at) : undefined)
	// A finger pins the readout, scrubs it and leaves it until a tap elsewhere (`chartRead`, D-168).
	function point(place: ChartPlace | undefined) {
		at = place?.x
	}
</script>

<div
	class={['ed-sun', className]}
	style:height="{height}px"
	{@attach chartRead(() => ({ on: reads, onread: point }))}
	{@attach measure((rect) => (width = Math.round(rect.width)))}
	{...rest}
>
	{#if geo}
		<svg class="ed-sun-svg" {width} {height} viewBox="0 0 {width} {height}" role="img" aria-label={label}>
			{#each geo.twilights as line (line.elevation)}
				<line class="ed-sun-twilight" x1={geo.plot.x} x2={geo.plot.x + geo.plot.width} y1={line.y} y2={line.y} />
			{/each}
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
			<text class="ed-sun-peak" x={geo.peak.x} y={geo.peak.y - 7}>{degrees(geo.peak.elevation)}</text>
			{#if reading}
				<line class="ed-sun-guide" x1={reading.x} x2={reading.x} y1={geo.plot.y} y2={floor} />
				<circle
					class={['ed-sun-read', { 'ed-sun-read-down': reading.elevation < 0 }]}
					r="3.5"
					cx={reading.x}
					cy={reading.y}
				/>
			{/if}
			<g class={['ed-sun-mark', { 'ed-sun-down': !geo.sun.up }]} style:offset-path="path('{geo.travel}')">
				<circle class="ed-sun-halo" r="10" />
				<circle class="ed-sun-disc" r="5" />
			</g>
		</svg>
		{#if reading && format}
			<ChartTip
				x={reading.x}
				y={reading.y}
				{width}
				title="{format(reading.instant)} · {s.sunArc.phases[reading.phase]}"
				rows={[
					{ label: s.sunArc.elevation, value: degrees(reading.elevation) },
					{ label: s.sunArc.azimuth, value: `${Math.round(reading.azimuth) % 360}° ${bearing(reading.azimuth)}` },
				]}
			/>
		{/if}
	{/if}
</div>

<style>
	.ed-sun {
		position: relative;
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
	/* where civil, nautical and astronomical twilight end: hairlines beneath the horizon, quieter than it */
	.ed-sun-twilight {
		stroke: var(--chart-grid);
		stroke-width: 1;
	}
	/* the sun's elevation at solar noon, over the top of the wave */
	.ed-sun-peak {
		font: var(--ed-t-data-sm);
		letter-spacing: var(--ed-t-data-sm-tracking);
		font-weight: 500;
		font-variant-numeric: tabular-nums;
		text-anchor: middle;
		fill: var(--text-primary);
	}
	.ed-sun-event {
		fill: var(--chart-primary);
		stroke: var(--surface-1);
		stroke-width: 1.5;
	}
	/* the place being read: a hairline through the wave and a dot on it, filled by day and hollow by night */
	.ed-sun-guide {
		stroke: var(--chart-axis);
		stroke-width: 1;
	}
	.ed-sun-read {
		fill: var(--chart-primary);
		stroke: var(--surface-1);
		stroke-width: 2;
	}
	.ed-sun-read-down {
		fill: var(--surface-1);
		stroke: var(--chart-label);
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
