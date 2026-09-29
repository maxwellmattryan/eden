<script lang="ts">
	// A figure and what it is measured in: the number a widget is for (today's weight, the temperature now, the budget
	// spent) in data-lg, or one figure among several in a card in data-md, or a figure in a dense row in data. Tabular,
	// so a changing value does not shift, with an optional unit or qualifier beside it in data-sm.
	import type { HTMLAttributes } from 'svelte/elements'

	type Props = HTMLAttributes<HTMLDivElement> & {
		/** The figure, already formatted by the caller (separators, decimals, sign). */
		value: string
		/** A unit or a short qualifier beside the figure, in data-sm and text-secondary. */
		unit?: string
		/** lg is a widget's headline (28), md a figure among several in a card (18), sm a figure in a dense row (14). */
		size?: 'sm' | 'md' | 'lg'
	}
	let { value, unit, size = 'lg', class: className = '', ...rest }: Props = $props()
</script>

<div class={['ed-stat', `ed-stat-${size}`, className]} {...rest}>
	<span class="ed-stat-value">{value}</span>{#if unit}<small class="ed-stat-unit">{unit}</small>{/if}
</div>

<style>
	.ed-stat {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-1);
		max-width: 100%;
		color: var(--text-primary);
	}
	.ed-stat-value {
		font: var(--ed-t-data-lg);
		letter-spacing: var(--ed-t-data-lg-tracking);
		font-variant-numeric: tabular-nums;
	}
	.ed-stat-md .ed-stat-value {
		font: var(--ed-t-data-md);
		letter-spacing: var(--ed-t-data-md-tracking);
	}
	.ed-stat-sm .ed-stat-value {
		font: var(--ed-t-data);
		letter-spacing: var(--ed-t-data-tracking);
		font-weight: 500;
	}
	.ed-stat-unit {
		font: var(--ed-t-data-sm);
		letter-spacing: var(--ed-t-data-sm-tracking);
		color: var(--text-secondary);
	}
</style>
