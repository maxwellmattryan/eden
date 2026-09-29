<script lang="ts">
	// A banded scale with a marker: where a reading sits between fine and hazardous (the air quality index, the UV
	// index, a pollen count). The bands are the six level colours, drawn equally wide so the low end is not squeezed
	// by a long tail; the marker carries the position and the label the meaning, so colour is never alone.
	import type { HTMLAttributes } from 'svelte/elements'
	import { markerAt } from './scale.js'

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'aria-label'> & {
		/** The reading. */
		value: number
		/** Where each band ends, lowest first; at most six, one per level. */
		stops: readonly number[]
		/** Where the first band begins. */
		min?: number
		/** The accessible sentence: the reading, its scale and its category. */
		label: string
	}
	let { value, stops, min = 0, label, class: className = '', ...rest }: Props = $props()

	const bands = $derived(stops.slice(0, 6).map((stop, i) => ({ stop, level: i + 1 })))
	const at = $derived(markerAt(value, stops.slice(0, 6), min))
</script>

<div class={['ed-scale', className]} role="img" aria-label={label} {...rest}>
	<span class="ed-scale-marker" style:inset-inline-start="{at}%"></span>
	<span class="ed-scale-bands">
		{#each bands as band (band.level)}
			<span class="ed-scale-band ed-scale-level-{band.level}"></span>
		{/each}
	</span>
</div>

<style>
	.ed-scale {
		position: relative;
		display: block;
		width: 100%;
		padding-top: calc(var(--space-2) + var(--space-1));
		box-sizing: border-box;
	}
	.ed-scale-bands {
		display: flex;
		gap: 2px;
		height: var(--space-2);
		border-radius: var(--radius-full);
		overflow: hidden;
	}
	.ed-scale-band {
		flex: 1;
	}
	.ed-scale-level-1 {
		background: var(--level-1);
	}
	.ed-scale-level-2 {
		background: var(--level-2);
	}
	.ed-scale-level-3 {
		background: var(--level-3);
	}
	.ed-scale-level-4 {
		background: var(--level-4);
	}
	.ed-scale-level-5 {
		background: var(--level-5);
	}
	.ed-scale-level-6 {
		background: var(--level-6);
	}
	/* The marker: a small pointer above the bands, in the text colour so it reads on every band */
	.ed-scale-marker {
		position: absolute;
		top: 0;
		width: 0;
		height: 0;
		margin-inline-start: calc(var(--space-1) * -1);
		border-inline: var(--space-1) solid transparent;
		border-top: var(--space-2) solid var(--text-primary);
	}
</style>
