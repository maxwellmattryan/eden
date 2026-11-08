<script lang="ts">
	// A bank on an Activity row (product/domains/finance.md §6), ported from the `Domains/Orchard` BankPill: the
	// institution's logo, else its colour as a small decorative swatch, else the plain stroke, then its name with the
	// last four digits in ink, so contrast never rests on a brand colour. With `onclick` it is a button that filters the
	// feed to that account. A logo that will not draw falls back to the swatch. A shared view, not a kit component.
	import { t } from '../../../i18n/index.js'

	type Props = {
		institution: string
		last4?: string
		/** `#RRGGBB`, already checked; a manual account has none and shows the plain stroke. */
		colour?: string
		/** A `data:image/png` URL, already checked. */
		logo?: string
		/** The phone's taller target. */
		touch?: boolean
		onclick?: () => void
	}
	let { institution, last4, colour, logo, touch = false, onclick }: Props = $props()

	let broken = $state(false)
	const face = $derived(last4 ? `${institution} ••${last4}` : institution)
	const spoken = $derived(
		last4
			? $t('domains.finance.activity.pill', { values: { name: institution, last4 } })
			: $t('domains.finance.activity.pillNoLast4', { values: { name: institution } })
	)
</script>

{#snippet mark()}
	{#if logo && !broken}
		<img class="logo" src={logo} alt="" onerror={() => (broken = true)} />
	{:else}
		<span class="swatch" aria-hidden="true"></span>
	{/if}
	<span aria-hidden="true">{face}</span>
{/snippet}

{#if onclick}
	<button type="button" class={['pill', 'pill-button', { touch }]} style:--bank={colour} {onclick}>
		{@render mark()}
		<span class="ed-sr-only">{spoken}</span>
	</button>
{:else}
	<span class="pill" style:--bank={colour}>
		{@render mark()}
		<span class="ed-sr-only">{face}</span>
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
	.logo {
		flex: none;
		width: var(--space-3);
		height: var(--space-3);
		border-radius: var(--radius-full);
		object-fit: cover;
	}
</style>
