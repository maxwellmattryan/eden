<script lang="ts">
	// Loading rows that match the list they stand in for: an icon bone, a text bone and a metadata bone per row, at
	// row height on a card. The rows fade in once over the panel duration and then hold still: no breathing, no
	// shimmer, since nothing in Eden loops. Assistive technology hears "Loading" once through the hidden span.
	import type { HTMLAttributes } from 'svelte/elements'
	import { useStrings } from '../../i18n/context.js'

	type Props = HTMLAttributes<HTMLDivElement> & {
		/** How many rows; match the list that will replace them. */
		rows?: number
		/** A leading icon bone on each row. */
		icon?: boolean
	}
	let { rows = 3, icon = true, class: className = '', ...rest }: Props = $props()

	const s = useStrings()
	// Text bones vary in length so the block reads as text, not as bars; the sequence is fixed so nothing shifts.
	const widths = $derived(Array.from({ length: Math.max(0, rows) }, (_, i) => 52 + ((i * 37) % 30)))
</script>

<div class="ed-skeleton {className}" aria-busy="true" {...rest}>
	<span class="ed-sr-only">{s.loading}</span>
	{#each widths as width, i (i)}
		<div class="ed-skeleton-row">
			{#if icon}<span class="ed-bone ed-bone-icon"></span>{/if}
			<span class="ed-bone ed-bone-text" style:max-width="{width}%"></span>
			<span class="ed-bone ed-bone-meta"></span>
		</div>
	{/each}
</div>

<style>
	.ed-skeleton {
		display: flex;
		flex-direction: column;
		overflow: hidden;
		border: 1px solid var(--stroke-subtle);
		border-radius: var(--ed-radius-card);
		background: var(--surface-1);
		animation: ed-skeleton-in var(--ed-duration-panel) var(--ed-ease-out) both;
	}
	.ed-skeleton-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		box-sizing: border-box;
		height: var(--ed-row);
		padding: 0 var(--space-3);
		border-bottom: 1px solid var(--stroke-subtle);
	}
	.ed-skeleton-row:last-child {
		border-bottom: 0;
	}
	.ed-bone {
		flex: none;
		height: var(--space-3);
		border-radius: var(--ed-radius-control);
		background: var(--surface-2);
	}
	.ed-bone-icon {
		width: var(--icon-sm);
		height: var(--icon-sm);
	}
	.ed-bone-text {
		flex: 1;
	}
	.ed-bone-meta {
		width: calc(var(--space-6) * 2);
	}
	@keyframes ed-skeleton-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
</style>
