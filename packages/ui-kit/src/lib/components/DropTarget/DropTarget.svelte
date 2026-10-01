<script lang="ts">
	// A region that takes dragged rows: the other end of a List with a `dragGroup`. It wraps what it covers (a list
	// with its heading, an empty state) and, while rows of a group it accepts are dragged over it, lays the light wash
	// of the accent with a dashed edge across the region, as Dropzone does for files. Rows that began inside the
	// region are not its to take, so a list is never a target for its own rows. The wash never takes the pointer and
	// is hidden from assistive technology: dragging is a pointer's gesture, so the app keeps the same move in the
	// row's menu for everyone else. While `disabled` the region does nothing at all.
	import type { Snippet } from 'svelte'
	import type { HTMLAttributes } from 'svelte/elements'
	import { rowDropTarget } from '../../internal/row-drag.js'

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'ondrop'> & {
		/** The groups of rows the region takes: the `dragGroup` of the lists that may drop here. */
		accepts: string[]
		/** Takes nothing and shows nothing: the drag passes as if the region were not there. */
		disabled?: boolean
		/** Called at the drop with the ids of the dragged rows. */
		ondrop: (ids: string[]) => void
		/** What the region covers. */
		children: Snippet
	}
	let { accepts, disabled = false, ondrop, children, class: className = '', ...rest }: Props = $props()

	let over = $state(false)
</script>

<div
	class={['ed-droptarget', className]}
	{@attach rowDropTarget(() => ({
		accepts: () => accepts,
		disabled: () => disabled,
		onHover: (on) => (over = on),
		onDrop: (ids) => ondrop(ids),
	}))}
	{...rest}
>
	{@render children()}
	<div class={['ed-droptarget-veil', { 'ed-droptarget-over': over }]} aria-hidden="true"></div>
</div>

<style>
	.ed-droptarget {
		position: relative;
		min-width: 0;
	}

	/* The wash: over everything the region covers, never in the pointer's way; it fades on the micro duration, which
	   reduced motion keeps */
	.ed-droptarget-veil {
		position: absolute;
		inset: 0;
		z-index: var(--ed-z-sticky);
		box-sizing: border-box;
		border: 2px dashed var(--brand-primary);
		border-radius: var(--ed-radius-card);
		background: color-mix(in srgb, var(--brand-primary) 12%, transparent);
		pointer-events: none;
		opacity: 0;
		visibility: hidden;
		transition:
			opacity var(--ed-duration-micro) var(--ed-ease-out),
			visibility 0s linear var(--ed-duration-micro);
	}
	.ed-droptarget-over {
		opacity: 1;
		visibility: visible;
		transition:
			opacity var(--ed-duration-micro) var(--ed-ease-out),
			visibility 0s;
	}
</style>
