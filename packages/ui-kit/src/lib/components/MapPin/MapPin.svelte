<script module lang="ts">
	/** What a pin stands for: a place the owner keeps, one the Gardener found, a listing, home, or several close by. */
	export type MapPinKind = 'saved' | 'suggested' | 'listing' | 'home' | 'group'
</script>

<script lang="ts">
	// A pin on a map: a button whose foot is the place (D-129). The map draws ground and never a pin, so everything
	// pressable on it is this. Its colour says what it is: the accent for a saved place, the Gardener's green for one
	// it found, honey for a listing, the ink for home; a group carries how many it stands for. The glyph repeats the
	// kind, so colour is never alone, and the name is the place's, for assistive technology.
	import type { HTMLButtonAttributes } from 'svelte/elements'
	import type { IconName } from '../../icons/icons.js'
	import Icon from '../../icons/Icon.svelte'

	type Props = Omit<HTMLButtonAttributes, 'onselect' | 'aria-label'> & {
		/** What the pin stands for. */
		kind?: MapPinKind
		/** The accessible name: the place's name, or what a group holds. */
		label: string
		/** The pin the page is showing: larger, ringed, above its neighbours. */
		selected?: boolean
		/** How many places a group stands for. */
		count?: number
		/** Called on a click. */
		onselect?: () => void
	}
	let { kind = 'saved', label, selected = false, count, onselect, class: className = '', ...rest }: Props = $props()

	const GLYPHS: Record<Exclude<MapPinKind, 'group'>, IconName> = {
		saved: 'map-pin',
		suggested: 'sparkles',
		listing: 'ticket',
		home: 'house',
	}
</script>

<button
	type="button"
	class={['ed-pin', `ed-pin-${kind}`, className]}
	aria-label={label}
	aria-pressed={selected}
	onclick={() => onselect?.()}
	{...rest}
>
	<span class="ed-pin-head">
		{#if kind === 'group'}
			<span class="ed-pin-count">{count ?? ''}</span>
		{:else}
			<Icon name={GLYPHS[kind]} size="sm" />
		{/if}
	</span>
</button>

<style>
	/* The button is the head and the foot together; its bottom centre is the place */
	.ed-pin {
		--ed-pin-ground: var(--brand-primary);
		--ed-pin-ink: var(--on-brand);
		--ed-pin-foot: var(--space-1);
		position: relative;
		display: inline-grid;
		place-items: start center;
		width: var(--space-8);
		height: calc(var(--space-8) + var(--ed-pin-foot));
		margin: 0;
		padding: 0;
		border: 0;
		background: none;
		color: var(--ed-pin-ink);
		cursor: pointer;
		transform-origin: 50% 100%;
		transition: transform var(--ed-duration-micro) var(--ed-ease-out);
	}
	.ed-pin-suggested {
		--ed-pin-ground: var(--ai);
		--ed-pin-ink: var(--on-ai);
	}
	.ed-pin-listing {
		--ed-pin-ground: var(--honey);
		--ed-pin-ink: var(--on-honey);
	}
	.ed-pin-home,
	.ed-pin-group {
		--ed-pin-ground: var(--text-primary);
		--ed-pin-ink: var(--surface-0);
	}
	.ed-pin-head {
		position: relative;
		z-index: 1;
		display: grid;
		place-items: center;
		box-sizing: border-box;
		width: var(--space-8);
		height: var(--space-8);
		border: 2px solid var(--surface-0);
		border-radius: var(--radius-full);
		background: var(--ed-pin-ground);
		box-shadow: var(--shadow-card);
	}
	/* the foot: a small square turned on its corner under the head, in the head's colour */
	.ed-pin::after {
		content: '';
		position: absolute;
		left: 50%;
		bottom: 1px;
		width: var(--space-2);
		height: var(--space-2);
		background: var(--ed-pin-ground);
		border-radius: 1px;
		transform: translateX(-50%) rotate(45deg);
	}
	.ed-pin-count {
		font: var(--ed-t-data-sm);
		letter-spacing: var(--ed-t-data-sm-tracking);
		font-variation-settings: var(--ed-t-data-sm-opsz);
		font-weight: 600;
	}
	.ed-pin:hover {
		transform: scale(1.08);
	}
	.ed-pin[aria-pressed='true'] {
		transform: scale(1.25);
	}
	.ed-pin[aria-pressed='true'] .ed-pin-head {
		border-color: var(--text-primary);
	}
	.ed-pin:focus-visible {
		outline: 2px solid transparent;
	}
	.ed-pin:focus-visible .ed-pin-head {
		box-shadow: var(--focus-ring);
	}
</style>
