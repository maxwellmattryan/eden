<script lang="ts">
	// One labelled row of a settings tab: the label, an optional line of help, and the control beneath.
	import type { Snippet } from 'svelte'

	type Props = {
		label: string
		help?: string
		children: Snippet
	}
	let { label, help, children }: Props = $props()
</script>

<div class="row">
	<div class="row-head">
		<span class="row-label">{label}</span>
		{#if help}<span class="row-help">{help}</span>{/if}
	</div>
	{@render children()}
</div>

<style>
	.row {
		display: grid;
		gap: 8px;
	}
	.row-head {
		display: grid;
		gap: 2px;
	}
	.row-label {
		font: var(--ed-t-label);
		color: var(--text-primary);
	}
	.row-help {
		font: var(--ed-t-body-sm);
		color: var(--text-secondary);
	}
</style>
