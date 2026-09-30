<script lang="ts">
	// The dock the Gardener's panel slides into (product/substrate/shell.md: the optional right panel), after Crate's
	// right sidebar: the column animates its width open and shut, stays mounted until the shut transition ends, and
	// its inner edge drags between a quarter and a half of the room beside the nav. The width the owner settles on
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

	const min = $derived(Math.round(room * MIN_FRACTION))
	const max = $derived(Math.round(room * MAX_FRACTION))
	const width = $derived(clamp(settings.gardenerPanelWidth ?? Math.round(room * DEFAULT_FRACTION)))

	function clamp(value: number): number {
		return Math.min(max, Math.max(min, value))
	}

	// effect: imperative DOM — the column is in the tree before it can slide open
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

{#if mounted}
	<div class={['dock', !resizing && 'dock-sliding']} style:width="{gardenerUi.open ? width : 0}px" {ontransitionend}>
		<ResizeHandle onresize={resize} onstart={() => (resizing = true)} onend={() => (resizing = false)} />
		<div class="dock-inner" style:width="{width}px">
			<GardenerPanel />
		</div>
	</div>
{/if}

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
