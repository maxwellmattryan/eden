<script lang="ts">
	// The moon as it looks tonight: a disc with its lit face drawn from where the moon is in its cycle, so every phase
	// between the named eight has its own shape. Decorative unless it is given a label; the phase's name and the lit
	// percentage are the text beside it.
	import type { SVGAttributes } from 'svelte/elements'
	import { litPath } from './moon.js'

	type Props = Omit<SVGAttributes<SVGSVGElement>, 'aria-label'> & {
		/** Where the moon is in its cycle: 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter. */
		cycle: number
		/** The icon sizes, so the moon lines up with the glyphs beside it: sm 16, md 20, lg 24. */
		size?: 'sm' | 'md' | 'lg'
		/** The accessible name; without one the glyph is hidden from assistive technology. */
		label?: string
	}
	let { cycle, size = 'md', label, class: className = '', ...rest }: Props = $props()

	const R = 10
	const C = 12
	const lit = $derived(litPath(cycle, R, C))
</script>

<svg
	class={['ed-moon', `ed-moon-${size}`, className]}
	viewBox="0 0 24 24"
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
	{...rest}
>
	<circle class="ed-moon-disc" cx={C} cy={C} r={R} />
	{#if lit}<path class="ed-moon-lit" d={lit} />{/if}
	<circle class="ed-moon-rim" cx={C} cy={C} r={R} />
</svg>

<style>
	.ed-moon {
		flex: none;
		display: inline-block;
		vertical-align: middle;
	}
	.ed-moon-sm {
		width: var(--icon-sm);
		height: var(--icon-sm);
	}
	.ed-moon-md {
		width: var(--icon-md);
		height: var(--icon-md);
	}
	.ed-moon-lg {
		width: var(--icon-lg);
		height: var(--icon-lg);
	}
	.ed-moon-disc {
		fill: var(--moon-shade);
	}
	.ed-moon-lit {
		fill: var(--moon-lit);
	}
	.ed-moon-rim {
		fill: none;
		stroke: var(--moon-shade);
		stroke-width: 1;
	}
</style>
