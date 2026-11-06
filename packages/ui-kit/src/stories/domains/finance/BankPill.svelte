<script lang="ts">
	// A bank on an Activity row (product/domains/finance.md §6): the institution's colour as a small decorative swatch
	// and its name with the last four digits in ink, so contrast never rests on a brand colour. With `onclick` it is a
	// button that filters the feed to that account. The colour arrives from the data as `--bank`, the only raw hex in
	// Orchard's mocks. Story-only; a kit pill is a handoff if the apps need one.
	type Props = {
		institution: string
		last4: string
		/** The institution's colour; a manual account has none and shows the plain stroke. */
		colour?: string
		/** The phone's taller target: 32 px rather than 24. */
		touch?: boolean
		onclick?: () => void
	}
	let { institution, last4, colour, touch = false, onclick }: Props = $props()
</script>

{#snippet face()}
	<span class="swatch" aria-hidden="true"></span>
	<span aria-hidden="true">{institution} ••{last4}</span>
{/snippet}

{#if onclick}
	<button type="button" class={['pill', 'pill-button', { touch }]} style:--bank={colour} {onclick}>
		{@render face()}
		<span class="ed-sr-only">{institution} ending {last4}, filter by this account</span>
	</button>
{:else}
	<span class="pill" style:--bank={colour}>
		{@render face()}
		<span class="ed-sr-only">{institution} ending {last4}</span>
	</span>
{/if}

<style>
	.pill {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		box-sizing: border-box;
		min-height: var(--space-6);
		padding: 0 var(--space-2);
		border: 1px solid var(--stroke-subtle);
		border-radius: var(--radius-full);
		background: var(--surface-2);
		color: var(--text-primary);
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		white-space: nowrap;
	}
	.pill-button {
		cursor: pointer;
	}
	.touch {
		min-height: var(--space-8);
	}
	.pill-button:hover {
		border-color: var(--stroke-hover);
	}
	.pill-button:focus-visible {
		outline: 2px solid transparent;
		box-shadow: var(--focus-ring);
	}
	.swatch {
		flex: none;
		width: var(--space-2);
		height: var(--space-2);
		border-radius: var(--radius-full);
		background: var(--bank, var(--stroke));
	}
</style>
