<script lang="ts">
	// The Garden's layout: a grid of --widget-columns (four) on desktop and two on mobile, with space-6 gutters and rows
	// at least five space-8 tall, so an s widget is one cell, m two across and l two by two. Dense packing lets a small
	// tile fill the gap a wide one left. Layout only: edit mode, the catalog and dragging are the app's.
	import type { Snippet } from 'svelte'
	import type { HTMLAttributes } from 'svelte/elements'
	import { platformOf } from '../../internal/platform.js'

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
		/** The desktop column count; the tokens' --widget-columns (four) unless set. Mobile always has two. */
		columns?: number
		/** The widgets. */
		children?: Snippet
	}
	let { columns, children, class: className = '', ...rest }: Props = $props()

	// The root, for the platform, read once it exists.
	let root = $state<HTMLDivElement>()
	const count = $derived(root && platformOf(root) === 'mobile' ? 2 : columns)
</script>

<div class="ed-widget-grid {className}" bind:this={root} style:--ed-widget-grid-columns={count} {...rest}>
	{@render children?.()}
</div>

<style>
	.ed-widget-grid {
		display: grid;
		grid-template-columns: repeat(var(--ed-widget-grid-columns, var(--widget-columns)), minmax(0, 1fr));
		grid-auto-rows: minmax(calc(var(--space-8) * 5), auto);
		grid-auto-flow: dense;
		gap: var(--space-6);
	}
</style>
