<script lang="ts">
	// The same composite under every brand level and both reliefs, in element-scoped subtrees, so the dials can be
	// compared at a glance. The toolbar's Brand and Relief still apply to everything outside this grid.
	import { brandLevels, reliefs } from '$lib/tokens/tokens.js'
	import Composite from './Composite.svelte'
</script>

<div class="grid">
	<div></div>
	{#each reliefs as relief (relief)}
		<h2 class="ed-t-title-sm label">data-relief="{relief}"</h2>
	{/each}
	{#each [...brandLevels].reverse() as brand (brand)}
		<h2 class="ed-t-title-sm label">data-brand="{brand}"</h2>
		{#each reliefs as relief (relief)}
			<section class="ed-canvas cell" data-brand={brand} data-relief={relief} aria-label="{brand}, {relief}">
				<Composite />
			</section>
		{/each}
	{/each}
</div>

<style>
	.grid {
		display: grid;
		grid-template-columns: auto repeat(2, minmax(0, 1fr));
		gap: var(--space-4) var(--space-6);
		align-items: start;
	}
	.label {
		margin: 0;
		color: var(--text-secondary);
		align-self: center;
	}
	.cell {
		padding: var(--space-4);
		border-radius: var(--ed-radius-card);
	}
</style>
