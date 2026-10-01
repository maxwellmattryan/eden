<script lang="ts">
	// The dock the Gardener's panel slides into (product/substrate/shell.md: the optional right panel), after Crate's
	// right sidebar: the column is always in the grid, at no width while shut, so its width has a state to slide open
	// from as well as shut to; the panel inside mounts on the first open and stays until the shut transition ends.
	// The inner edge drags between a quarter and a half of the room beside the nav, less whatever the
	// page's floor needs in a small window. The width the owner settles on
	// is kept per device (`settings.gardenerPanelWidth`); dragging turns the transition off so the edge follows the
	// pointer.
	import { settings } from '@eden/shared/settings'
	import GardenerPanel from './GardenerPanel.svelte'
	import { gardenerUi } from './panel-ui.svelte'
	import ResizeHandle from './ResizeHandle.svelte'

	type Props = {
		/** The room beside the nav sidebar, in px: what the quarter and the half are of. */
		room: number
	}
	let { room }: Props = $props()

	const MIN_FRACTION = 0.25
	const MAX_FRACTION = 0.5
	const DEFAULT_FRACTION = 0.34

	let resizing = $state(false)
	// mounted from the first open until the shut transition has ended
	let mounted = $state(false)

	// the least the page beside the dock keeps, in px: in a small window the half gives way to it
	const PAGE_FLOOR = 420

	const max = $derived(Math.max(0, Math.min(Math.round(room * MAX_FRACTION), room - PAGE_FLOOR)))
	const min = $derived(Math.min(max, Math.round(room * MIN_FRACTION)))
	const width = $derived(clamp(settings.gardenerPanelWidth ?? Math.round(room * DEFAULT_FRACTION)))

	function clamp(value: number): number {
		return Math.min(max, Math.max(min, value))
	}

	// effect: imperative DOM — the panel is in the column as it starts to slide open
	$effect(() => {
		if (gardenerUi.open) mounted = true
	})

	function resize(delta: number) {
		// the edge is on the left: dragging it left widens the dock
		settings.setGardenerPanelWidth(clamp(width - delta))
	}
	function ontransitionend(e: TransitionEvent) {
		if (e.propertyName === 'width' && !gardenerUi.open) mounted = false
	}
</script>

<div class={['dock', !resizing && 'dock-sliding']} style:width="{gardenerUi.open ? width : 0}px" {ontransitionend}>
	{#if mounted}
		<ResizeHandle onresize={resize} onstart={() => (resizing = true)} onend={() => (resizing = false)} />
		<div class="dock-inner" style:width="{width}px">
			<GardenerPanel />
		</div>
	{/if}
</div>

<style>
	.dock {
		grid-row: 1;
		grid-column: 3;
		display: flex;
		height: 100%;
		min-width: 0;
		overflow: hidden;
	}
	.dock-sliding {
		transition: width var(--ed-duration-panel) var(--ed-ease-out);
	}
	@media (prefers-reduced-motion: reduce) {
		.dock-sliding {
			transition: none;
		}
	}
	.dock-inner {
		flex: none;
		height: 100%;
		min-width: 0;
	}
</style>
