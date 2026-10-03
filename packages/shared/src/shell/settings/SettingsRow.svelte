<script lang="ts">
	// One labelled row of a settings tab: the label, an optional line of help, and the control beneath at the width
	// its content needs, with an optional example of the current choice beside it.
	import type { Snippet } from 'svelte'

	type Props = {
		label: string
		help?: string
		/** What the current choice looks like in use, shown beside the control. */
		example?: string
		children: Snippet
	}
	let { label, help, example, children }: Props = $props()
</script>

<div class="row">
	<div class="row-head">
		<span class="row-label">{label}</span>
		{#if help}<span class="row-help">{help}</span>{/if}
	</div>
	<div class="row-control">
		{@render children()}
		{#if example}<span class="row-example">{example}</span>{/if}
	</div>
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
	.row-control {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 12px;
	}
	.row-example {
		font: var(--ed-t-body-sm);
		color: var(--text-secondary);
	}
	.row-help {
		font: var(--ed-t-body-sm);
		color: var(--text-secondary);
	}
</style>
