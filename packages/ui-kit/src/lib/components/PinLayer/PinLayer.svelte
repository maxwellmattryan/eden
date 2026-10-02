<script module lang="ts">
	import type { MapPinKind } from '../MapPin/MapPin.svelte'

	/** A place on the ground, in degrees. */
	export interface MapPoint {
		lng: number
		lat: number
	}
	/** One pin: what it is, what it is called and where it stands. */
	export interface MapPinData {
		id: string
		point: MapPoint
		kind?: MapPinKind
		label: string
		/** How many places a group stands for. */
		count?: number
	}
	/** Where a point falls in the layer, in its own layout pixels from the top left; null when it is not on the ground shown. */
	export type MapProjection = (point: MapPoint) => { x: number; y: number } | null
</script>

<script lang="ts">
	// The pins over a map (D-129). The map is whatever draws the ground under this layer, a real one in the app and a
	// still drawing in a mock; all the layer asks of it is `project`, and a `revision` that changes whenever the
	// ground has moved. The pins are buttons placed by their foot, one tab stop for the lot, arrows between them.
	// The layer itself takes no pointer, so the ground under it still pans.
	import type { HTMLAttributes } from 'svelte/elements'
	import { untrack } from 'svelte'
	import { roving } from '../../internal/roving.js'
	import MapPin from '../MapPin/MapPin.svelte'

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'onselect' | 'aria-label'> & {
		/** The pins, each with an id. */
		pins: MapPinData[]
		/** Where a point falls in the layer. */
		project: MapProjection
		/** Changes whenever the ground has moved or resized, so the pins are placed again. */
		revision?: unknown
		/** The id of the pin the page is showing. */
		selected?: string
		/** The accessible name of the group of pins. */
		label: string
		/** Called with a pin's id on a click. */
		onselect?: (id: string) => void
	}
	let { pins, project, revision, selected, label, onselect, class: className = '', ...rest }: Props = $props()

	let root = $state<HTMLElement>()

	// effect: imperative DOM (each pin's place is written straight to its style, so a pan redraws no markup)
	$effect(() => {
		void revision
		if (!root) return
		const slots = root.querySelectorAll<HTMLElement>('.ed-pins-slot')
		pins.forEach((pin, i) => {
			const slot = slots[i]
			if (!slot) return
			const at = project(pin.point)
			slot.hidden = at === null
			if (at) slot.style.transform = `translate(${at.x.toFixed(1)}px, ${at.y.toFixed(1)}px)`
		})
	})
</script>

<div
	class={['ed-pins', className]}
	role="group"
	aria-label={label}
	bind:this={root}
	{@attach roving(() => ({
		selector: '.ed-pins-slot:not([hidden]) > button',
		orientation: 'both',
		current: () =>
			untrack(() =>
				Math.max(
					0,
					pins.findIndex((pin) => pin.id === selected)
				)
			),
	}))}
	{...rest}
>
	{#each pins as pin (pin.id)}
		<span class={['ed-pins-slot', { 'ed-pins-current': pin.id === selected }]}>
			<MapPin
				kind={pin.kind}
				label={pin.label}
				count={pin.count}
				selected={pin.id === selected}
				onselect={() => onselect?.(pin.id)}
			/>
		</span>
	{/each}
</div>

<style>
	.ed-pins {
		position: absolute;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
	}
	/* a slot is a point: the pin hangs from it by its foot */
	.ed-pins-slot {
		position: absolute;
		top: 0;
		left: 0;
		width: 0;
		height: 0;
	}
	.ed-pins-slot[hidden] {
		display: none;
	}
	.ed-pins-slot > :global(.ed-pin) {
		position: absolute;
		left: 0;
		bottom: 0;
		translate: -50% 0;
		pointer-events: auto;
	}
	.ed-pins-current {
		z-index: 1;
	}
</style>
