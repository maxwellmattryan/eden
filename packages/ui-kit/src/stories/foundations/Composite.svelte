<script lang="ts">
	// One small surface built from the primitives, so the dials can be compared on the same content: a card with a
	// title, a sentence in the voice, tabs, a field, chips and the three button weights.
	import Badge from '$lib/components/Badge/Badge.svelte'
	import Button from '$lib/components/Button/Button.svelte'
	import Chip from '$lib/components/Chip/Chip.svelte'
	import Field from '$lib/components/Field/Field.svelte'
	import Segmented from '$lib/components/Segmented/Segmented.svelte'
	import Toggle from '$lib/components/Toggle/Toggle.svelte'

	let tab = $state(0)
	let value = $state('82.4')
	let remind = $state(true)
</script>

<article class="card">
	<header class="head">
		<h3 class="ed-t-title">Fridge</h3>
		<Chip label="7 items" mono />
	</header>
	<p class="ed-t-voice voice">Spinach and avocados expire tomorrow.</p>
	<Segmented items={['Stock', 'Recipes', 'Grocery']} bind:selected={tab} label="Hearth" />
	<Field label="Weight" bind:value unit="kg" mono />
	<div class="row">
		<Chip label="fridge" tone="accent" />
		<Chip label="low stock" tone="grey" />
		<Badge kind="estimated" />
		<Badge kind="write" />
	</div>
	<Toggle bind:checked={remind} label="Remind me the day before" />
	<footer class="row">
		<Button label="Cook tonight" variant="primary" />
		<Button label="Add to grocery" />
		<Button label="Undo" variant="quiet" />
	</footer>
</article>

<style>
	.card {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-4);
		background: var(--surface-1);
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
		box-shadow: var(--shadow-card);
		max-width: 420px;
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}
	h3 {
		margin: 0;
	}
	.voice {
		margin: 0;
		color: var(--text-primary);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		align-items: center;
	}
</style>
