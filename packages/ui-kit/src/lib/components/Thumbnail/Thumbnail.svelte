<script lang="ts">
	// A small square picture of a thing, or its glyph on a tile of the same size while it has none (D-90): a stock
	// item in its row, a store beside its name. Decorative: the name beside it says what it is.
	import type { IconName } from '../../icons/icons.js'
	import Icon from '../../icons/Icon.svelte'

	type Props = {
		/** The picture, as a URL the page may load. */
		src?: string
		/** The glyph drawn on the tile while there is no picture. */
		icon?: IconName
		/** sm 32, a row's; md 40, beside a title. */
		size?: 'sm' | 'md'
		class?: string
	}
	let { src, icon, size = 'sm', class: className = '' }: Props = $props()
</script>

{#if src}
	<img class={['ed-thumb', `ed-thumb-${size}`, className]} {src} alt="" />
{:else}
	<span class={['ed-thumb', 'ed-thumb-tile', `ed-thumb-${size}`, className]} aria-hidden="true">
		{#if icon}<Icon name={icon} {size} />{/if}
	</span>
{/if}

<style>
	/* square, and never squeezed by the text beside it */
	.ed-thumb {
		flex: none;
		box-sizing: border-box;
		width: var(--ed-thumb-edge);
		height: var(--ed-thumb-edge);
		border: 1px solid var(--stroke-subtle);
		border-radius: var(--ed-radius-control);
		object-fit: cover;
		background: var(--surface-2);
	}
	.ed-thumb-sm {
		--ed-thumb-edge: var(--space-8);
	}
	.ed-thumb-md {
		--ed-thumb-edge: calc(var(--space-8) + var(--space-2));
	}
	.ed-thumb-tile {
		display: inline-grid;
		place-items: center;
		color: var(--text-secondary);
	}
</style>
