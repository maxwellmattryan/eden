<script lang="ts">
	// A bounded quantity read at a glance: how much of a budget line is spent, how much of a fund is saved. A thin
	// track with a fill clamped to the track's end; past the maximum the fill turns to the danger tone, and the caller
	// says "over" in words too, so colour is never the only sign. It has no copy of its own: the name and the value
	// text arrive as props, so a caller that hides amounts hands over a percentage instead of money. No motion.
	import type { HTMLAttributes } from 'svelte/elements'

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'role'> & {
		/** The amount so far, in the caller's unit. */
		value: number
		/** The bound, in the same unit. */
		max: number
		/** The accessible name: what is measured. */
		label: string
		/** The value as words, read in place of the number. */
		valuetext: string
		/** `auto` turns to danger when the value passes the maximum. */
		tone?: 'auto' | 'default' | 'danger'
	}
	let { value, max, label, valuetext, tone = 'auto', class: className = '', ...rest }: Props = $props()

	const fill = $derived(max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0)
	const danger = $derived(tone === 'danger' || (tone === 'auto' && value > max))
</script>

<div
	class={['ed-meter', { 'ed-meter-danger': danger }, className]}
	role="meter"
	aria-label={label}
	aria-valuemin={0}
	aria-valuenow={value}
	aria-valuemax={Math.max(value, max)}
	aria-valuetext={valuetext}
	{...rest}
>
	<span class="ed-meter-fill" style:width="{fill}%"></span>
</div>

<style>
	.ed-meter {
		overflow: hidden;
		height: 6px;
		border-radius: var(--radius-full);
		background: var(--ed-meter-track);
	}
	.ed-meter-fill {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: var(--brand-primary);
	}
	.ed-meter-danger .ed-meter-fill {
		background: var(--danger);
	}
</style>
