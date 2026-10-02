<script module lang="ts">
	import type { MapPoint, MapProjection } from '$lib/index.js'

	type Fixture = typeof import('../../sample-data.js').meadowMap

	/** The fixture's square, in units: a point's place in it, west to east and north to south. */
	const UNITS = 1000
	/** How far past its last point a line is carried, so a road runs off the canvas and does not stop in a field. */
	const RUN_ON = 900

	const unitsOf = (fixture: Fixture, [lng, lat]: readonly [number, number]): [number, number] => {
		const { west, east, south, north } = fixture.bounds
		return [((lng - west) / (east - west)) * UNITS, ((north - lat) / (north - south)) * UNITS]
	}
	/** A line's points in units, each end carried on along its last segment. */
	function carried(fixture: Fixture, line: readonly (readonly [number, number])[]): [number, number][] {
		const points = line.map((point) => unitsOf(fixture, point))
		const beyond = (from: [number, number], to: [number, number]): [number, number] => {
			const length = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1
			return [to[0] + ((to[0] - from[0]) / length) * RUN_ON, to[1] + ((to[1] - from[1]) / length) * RUN_ON]
		}
		if (points.length < 2) return points
		return [beyond(points[1]!, points[0]!), ...points, beyond(points.at(-2)!, points.at(-1)!)]
	}
	const path = (points: [number, number][], closed = false) =>
		points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ') + (closed ? ' Z' : '')
</script>

<script lang="ts">
	// The ground under a mockup's map (D-129): a still drawing of central Austin in token colours, from the few lines
	// of `meadowMap`. Storybook never mounts a real map, so a story is the same picture every time, with no network
	// and no WebGL. It gives what a map source gives the app: a projection and a revision that changes with its size,
	// handed to the snippet that lays the pins over it. Story-only; nothing here is exported.
	import type { Snippet } from 'svelte'
	import { measure } from '$lib/internal/measure.js'
	import { pointerAt } from '$lib/internal/pointer.js'
	import { meadowMap } from '../../sample-data.js'

	type Props = {
		fixture?: Fixture
		/** The point at the middle of the view; the fixture's own middle unless set. */
		center?: MapPoint
		/** 1 shows the whole fixture across the shorter side; 2 shows half of it. */
		zoom?: number
		/** Room kept clear at the right edge, in pixels, for what lies over the ground there: the view centres in the rest. */
		inset?: number
		/** No tiles could be loaded: the ground is plain, and the pins still stand on it. */
		offline?: boolean
		/** Called with the point under a click on the ground. */
		onpick?: (point: MapPoint) => void
		/** What lies over the ground, given the projection and a revision that changes when the ground does. */
		children?: Snippet<[{ project: MapProjection; revision: string }]>
	}
	let { fixture = meadowMap, center, zoom = 1, inset = 0, offline = false, onpick, children }: Props = $props()

	let size = $state({ width: 0, height: 0 })
	const scale = $derived((Math.min(size.width, size.height) / UNITS) * zoom)
	const middle = $derived(
		center ? unitsOf(fixture, [center.lng, center.lat]) : ([UNITS / 2, UNITS / 2] as [number, number])
	)
	const place = (u: number, v: number) => ({
		x: (u - middle[0]) * scale + (size.width - inset) / 2,
		y: (v - middle[1]) * scale + size.height / 2,
	})
	const project: MapProjection = (point) => {
		if (!size.width || !size.height) return null
		const [u, v] = unitsOf(fixture, [point.lng, point.lat])
		return place(u, v)
	}
	const revision = $derived(`${size.width}x${size.height}@${zoom}/${inset}:${middle.join(',')}`)
	const transform = $derived(
		`translate(${(size.width - inset) / 2} ${size.height / 2}) scale(${scale}) translate(${-middle[0]} ${-middle[1]})`
	)

	const water = $derived(fixture.water.map((line) => path(carried(fixture, line))))
	const parks = $derived(
		fixture.parks.map((ring) =>
			path(
				ring.map((point) => unitsOf(fixture, point)),
				true
			)
		)
	)
	const roads = $derived(
		fixture.roads.map((road) => ({ id: road.id, major: road.major, d: path(carried(fixture, road.line)) }))
	)
	const labels = $derived(fixture.labels.map((label) => ({ ...label, ...place(...unitsOf(fixture, label.at)) })))

	function pick(event: PointerEvent & { currentTarget: EventTarget & HTMLElement }) {
		if (!onpick || !scale) return
		const { x, y } = pointerAt(event)
		const u = (x - (size.width - inset) / 2) / scale + middle[0]
		const v = (y - size.height / 2) / scale + middle[1]
		const { west, east, south, north } = fixture.bounds
		onpick({ lng: west + (u / UNITS) * (east - west), lat: north - (v / UNITS) * (north - south) })
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions (the ground is a drawing; a click on it places a pin, which the page also offers by name) -->
<div
	class={['ground', { 'ground-pick': onpick }]}
	{@attach measure((rect, el) => (size = { width: el.offsetWidth, height: el.offsetHeight }))}
	onpointerup={pick}
>
	{#if !offline}
		<svg class="ground-drawing" aria-hidden="true" focusable="false">
			<g {transform}>
				{#each parks as d, i (i)}<path class="park" {d} />{/each}
				{#each water as d, i (i)}<path class="water" {d} />{/each}
				{#each roads as road (road.id)}
					<path class={['casing', { major: road.major }]} d={road.d} />
				{/each}
				{#each roads as road (road.id)}
					<path class={['road', { major: road.major }]} d={road.d} />
				{/each}
			</g>
		</svg>
		<div class="ground-labels" aria-hidden="true">
			{#each labels as label (label.id)}
				<span class="ground-label" style:left="{label.x}px" style:top="{label.y}px">{label.text}</span>
			{/each}
		</div>
	{/if}
	{@render children?.({ project, revision })}
</div>

<style>
	.ground {
		position: absolute;
		inset: 0;
		overflow: hidden;
		background: var(--surface-1);
	}
	.ground-pick {
		cursor: crosshair;
	}
	.ground-drawing {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		fill: none;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.ground-drawing path {
		vector-effect: non-scaling-stroke;
	}
	.park {
		fill: color-mix(in srgb, var(--success) 16%, var(--surface-1));
	}
	.water {
		stroke: color-mix(in srgb, var(--info) 26%, var(--surface-1));
		stroke-width: 14px;
	}
	.casing {
		stroke: var(--stroke);
		stroke-width: 5px;
	}
	.casing.major {
		stroke-width: 8px;
	}
	.road {
		stroke: var(--surface-0);
		stroke-width: 3px;
	}
	.road.major {
		stroke-width: 6px;
	}
	.ground-labels {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}
	.ground-label {
		position: absolute;
		translate: -50% -50%;
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		font-variation-settings: var(--ed-t-caption-opsz);
		color: var(--text-secondary);
		white-space: nowrap;
	}
</style>
