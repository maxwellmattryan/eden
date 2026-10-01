<script lang="ts">
	// The Garden's layout: a grid of --widget-columns (four) on desktop and two on mobile, as many as fit in between when the grid is narrow, with space-6 gutters and rows
	// at least five space-8 tall, so an s widget is one cell, m two across and l two by two. Dense packing lets a small
	// tile fill the gap a wide one left. Layout only: edit mode, the catalog and dragging are the app's.
	import type { Snippet } from 'svelte'
	import type { HTMLAttributes } from 'svelte/elements'
	import { measure } from '../../internal/measure.js'
	import { platformOf } from '../../internal/platform.js'
	import { sizes } from '../../tokens/tokens.js'

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
		/** The desktop column count; the tokens' --widget-columns (four) unless set. Mobile always has two. */
		columns?: number
		/** The widgets. */
		children?: Snippet
	}
	let { columns, children, class: className = '', ...rest }: Props = $props()

	// The root, for the platform and its own width: a grid too narrow for its columns (a panel open beside the page)
	// drops to as many as fit, never fewer than mobile's two.
	let root = $state<HTMLDivElement>()
	/** The least width, in px, a column and its gutter take. */
	const TRACK = 176
	// layout width, not the rect: a scaled ancestor shrinks the rect
	let width = $state(0)
	const fits = $derived(width > 0 ? Math.max(2, Math.floor(width / TRACK)) : undefined)
	const count = $derived.by(() => {
		if (root && platformOf(root) === 'mobile') return 2
		if (fits === undefined) return columns
		return fits < (columns ?? Number(sizes['widget-columns'])) ? fits : columns
	})
</script>

<div
	class="ed-widget-grid {className}"
	bind:this={root}
	style:--ed-widget-grid-columns={count}
	{@attach measure((_, el) => (width = el.clientWidth))}
	{...rest}
>
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
