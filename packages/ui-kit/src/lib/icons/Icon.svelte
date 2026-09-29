<script lang="ts">
	// A Lucide icon on the 24px grid. Every glyph is normalised so its larger side fills 20 of the 24 units (scale
	// clamped to 1–1.25, stroke unscaled), so icons with different internal padding sit in the same visual box.
	// When `name` changes the new glyph fades in over the micro duration, so a live icon like Sky's changes quietly.
	import type { SVGAttributes } from 'svelte/elements'
	import { fade } from 'svelte/transition'
	import { motion } from '../tokens/tokens.js'
	import { ICONS, type IconName } from './icons.js'

	type Props = Omit<SVGAttributes<SVGSVGElement>, 'name'> & {
		/** A name from the kit's Lucide subset. Unknown names draw circle-dashed rather than nothing. */
		name: IconName
		/** sm 16 and md 20 take the dense 1.75 px stroke; lg 24 takes the 2 px stroke. */
		size?: 'sm' | 'md' | 'lg'
		/** The accessible name when the icon carries meaning on its own. Without it the icon is decorative and hidden. */
		label?: string
	}
	let { name, size = 'md', label, class: className = '', ...rest }: Props = $props()

	const icon = $derived(ICONS[name] ?? ICONS['circle-dashed'])
	const transform = $derived.by(() => {
		const [x, y, w, h] = icon.x
		const s = Math.min(1.25, Math.max(1, 20 / Math.max(w, h)))
		const tx = 12 - (x + w / 2) * s
		const ty = 12 - (y + h / 2) * s
		return `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${s.toFixed(3)})`
	})
	const duration = parseInt(motion['duration-micro'], 10)
</script>

<svg
	class="ed-icon ed-icon-{size} {className}"
	viewBox="0 0 24 24"
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
	focusable="false"
	{...rest}
>
	{#key name}
		<g {transform} in:fade={{ duration }}>
			{#each icon.n as [tag, attrs], i (i)}
				<svelte:element this={tag} {...attrs} vector-effect="non-scaling-stroke" xmlns="http://www.w3.org/2000/svg" />
			{/each}
		</g>
	{/key}
</svg>

<style>
	.ed-icon {
		display: inline-block;
		flex: none;
		fill: none;
		stroke: currentColor;
		stroke-linecap: round;
		stroke-linejoin: round;
		vertical-align: middle;
	}
	.ed-icon-sm {
		width: var(--icon-sm);
		height: var(--icon-sm);
		stroke-width: var(--icon-stroke-dense);
	}
	.ed-icon-md {
		width: var(--icon-md);
		height: var(--icon-md);
		stroke-width: var(--icon-stroke-dense);
	}
	.ed-icon-lg {
		width: var(--icon-lg);
		height: var(--icon-lg);
		stroke-width: var(--icon-stroke);
	}
</style>
