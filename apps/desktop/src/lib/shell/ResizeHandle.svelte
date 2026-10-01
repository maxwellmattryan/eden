<script lang="ts">
	// The drag edge of a panel of the shell (the Gardener's dock, the sidebar), ported from Crate's `ResizeHandle`: a
	// hairline that widens to a grab area, dragged with the pointer; the arrow keys move it for the keyboard, and
	// Enter or a double click toggles the panel where it has two states. The panel owns the width and its bounds;
	// the handle only reports deltas.
	type Props = {
		/** The separator's accessible name. */
		label: string
		/** Which edge of its panel the handle is on: the line is drawn over that edge's own border. */
		edge?: 'start' | 'end'
		/** A move of the edge, in px; negative drags the edge left. */
		onresize: (delta: number) => void
		onstart?: () => void
		onend?: () => void
		/** Enter or a double click, for a panel that collapses. */
		ontoggle?: () => void
	}
	let { label, edge = 'start', onresize, onstart, onend, ontoggle }: Props = $props()

	const STEP = 16
	let dragging = $state(false)
	let last = 0

	function move(e: PointerEvent) {
		if (!dragging) return
		onresize(e.clientX - last)
		last = e.clientX
	}
	function up(e: PointerEvent) {
		if (!dragging) return
		dragging = false
		;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
		onend?.()
	}
	function down(e: PointerEvent) {
		if (e.button !== 0) return
		e.preventDefault()
		dragging = true
		last = e.clientX
		;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
		onstart?.()
	}
	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && ontoggle) {
			e.preventDefault()
			ontoggle()
			return
		}
		if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
		e.preventDefault()
		onresize(e.key === 'ArrowLeft' ? -STEP : STEP)
	}
</script>

<!-- a separator with the keyboard: the a11y rules for a static div do not know that role -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	class={['handle', edge === 'end' && 'handle-end', dragging && 'handle-dragging']}
	role="separator"
	aria-orientation="vertical"
	aria-label={label}
	tabindex="0"
	onpointerdown={down}
	onpointermove={move}
	onpointerup={up}
	onpointercancel={up}
	ondblclick={() => ontoggle?.()}
	{onkeydown}
>
	<div class="handle-line"></div>
</div>

<style>
	.handle {
		position: relative;
		width: 0;
		height: 100%;
		cursor: col-resize;
		flex: none;
		z-index: 1;
	}
	/* the grab area straddles the edge, wider than the line it draws */
	.handle::before {
		content: '';
		position: absolute;
		inset: 0 -4px;
	}
	.handle-line {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 0;
		width: 1px;
		background: transparent;
		transition: background-color var(--ed-duration-micro) var(--ed-ease-out);
	}
	.handle-end .handle-line {
		left: -1px;
	}
	.handle:hover .handle-line,
	.handle-dragging .handle-line,
	.handle:focus-visible .handle-line {
		background: var(--brand-primary);
	}
	.handle:focus-visible {
		outline: none;
	}
</style>
