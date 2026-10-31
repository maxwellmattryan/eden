<script lang="ts">
	// A card whose header folds its body away: the saved and the found places start folded, so the side column opens
	// on the filter and the way to find more, and a list is a click away. The header carries the list's title and count.
	import { Icon } from '@eden/ui-kit'
	import type { Snippet } from 'svelte'

	let { title, count, children }: { title: string; count: number; children: Snippet } = $props()

	const uid = $props.id()
	let open = $state(false)
</script>

<section class="fold">
	<h2 class="head">
		<button type="button" class="toggle" aria-expanded={open} aria-controls="{uid}-body" onclick={() => (open = !open)}>
			<span class="title">{title}</span>
			<span class="count">{count}</span>
			<Icon name={open ? 'chevron-up' : 'chevron-down'} size="sm" />
		</button>
	</h2>
	{#if open}
		<div class="body" id="{uid}-body">{@render children()}</div>
	{/if}
</section>

<style>
	.fold {
		box-sizing: border-box;
		min-width: 0;
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
		background: var(--surface-1);
		color: var(--text-primary);
		overflow: hidden;
	}
	.head {
		margin: 0;
	}
	.toggle {
		all: unset;
		box-sizing: border-box;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		min-height: var(--ed-control);
		padding: 0 var(--space-3);
		color: var(--text-secondary);
		cursor: pointer;
	}
	.toggle:hover {
		background: color-mix(in srgb, var(--ed-hover-ink) 6%, transparent);
	}
	.toggle:focus-visible {
		outline: var(--focus-ring-width) solid var(--brand-primary);
		outline-offset: calc(var(--focus-ring-width) * -1);
	}
	.title {
		flex: 1;
		min-width: 0;
		font: var(--ed-t-title-sm);
		letter-spacing: var(--ed-t-title-sm-tracking);
		font-variation-settings: var(--ed-t-title-sm-opsz);
	}
	.count {
		font: var(--ed-t-data-sm);
		font-variant-numeric: tabular-nums;
	}
	.body {
		border-top: 1px solid var(--stroke-subtle);
	}
	/* the list inside has the fold's card, not its own */
	.body :global(.ed-list) {
		border: 0;
		border-radius: 0;
	}
</style>
