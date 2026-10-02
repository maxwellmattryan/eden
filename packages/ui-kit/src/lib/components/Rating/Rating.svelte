<script lang="ts">
	// A rating out of a few stars. Given `onchange` or a bound `value` it is a radio group, one tab stop, arrows
	// between the stars, and a press on the star that is set clears it, since a rating is optional. `readonly` shows
	// one already given as a single image with its sentence.
	import type { HTMLAttributes } from 'svelte/elements'
	import { untrack } from 'svelte'
	import Icon from '../../icons/Icon.svelte'
	import { useStrings } from '../../i18n/context.js'
	import { roving } from '../../internal/roving.js'

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'onchange' | 'aria-label'> & {
		/** The stars set, from 1 to `max`; none while there is no rating. Bindable. */
		value?: number
		/** How many stars there are. */
		max?: number
		/** Shows the rating without letting it be changed. */
		readonly?: boolean
		/** The accessible name: what is being rated. */
		label: string
		/** Called with the new rating, or with nothing when it was cleared. */
		onchange?: (value: number | undefined) => void
	}
	let {
		value = $bindable(),
		max = 5,
		readonly = false,
		label,
		onchange,
		class: className = '',
		...rest
	}: Props = $props()

	const s = useStrings()
	const stars = $derived(Array.from({ length: max }, (_, i) => i + 1))

	function set(star: number) {
		value = value === star ? undefined : star
		onchange?.(value)
	}
</script>

{#if readonly}
	<div
		class={['ed-rating', className]}
		role="img"
		aria-label={value ? s.rating.outOf(label, value, max) : s.rating.none(label)}
		{...rest}
	>
		{#each stars as star (star)}
			<span class={['ed-rating-star', { 'ed-rating-on': value !== undefined && star <= value }]}>
				<Icon name="star" size="sm" />
			</span>
		{/each}
	</div>
{:else}
	<div
		class={['ed-rating', className]}
		role="radiogroup"
		aria-label={label}
		{@attach roving(() => ({
			selector: '[role="radio"]',
			orientation: 'horizontal',
			current: () => untrack(() => Math.max(0, (value ?? 1) - 1)),
		}))}
		{...rest}
	>
		{#each stars as star (star)}
			<button
				type="button"
				class={['ed-rating-star', { 'ed-rating-on': value !== undefined && star <= value }]}
				role="radio"
				aria-checked={value === star}
				aria-label={s.rating.stars(star)}
				onclick={() => set(star)}
			>
				<Icon name="star" size="md" />
			</button>
		{/each}
	</div>
{/if}

<style>
	.ed-rating {
		display: inline-flex;
		align-items: center;
		gap: 2px;
	}
	.ed-rating-star {
		display: inline-grid;
		place-items: center;
		color: var(--text-tertiary);
	}
	.ed-rating-on {
		color: var(--honey);
	}
	.ed-rating-on :global(.ed-icon) {
		fill: currentColor;
	}
	button.ed-rating-star {
		box-sizing: border-box;
		width: var(--ed-control);
		height: var(--ed-control);
		margin: 0;
		padding: 0;
		border: 0;
		border-radius: var(--ed-radius-control);
		background: none;
		cursor: pointer;
		transition: transform var(--ed-duration-micro) var(--ed-ease-out);
	}
	button.ed-rating-star:hover {
		color: var(--honey);
	}
	button.ed-rating-star:active {
		transform: scale(1, var(--ed-press-scale));
		transform-origin: 50% 100%;
	}
	button.ed-rating-star:focus-visible {
		outline: 2px solid transparent;
		box-shadow: var(--focus-ring);
	}
</style>
