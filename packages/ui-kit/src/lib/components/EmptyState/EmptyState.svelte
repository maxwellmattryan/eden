<script lang="ts">
	// The empty state of a page: a display-md title, one plain sentence, the one primary action, an optional quiet
	// "Add sample data" link, and the unfurling frond in the accent, the one place a motif appears in a page besides
	// the splash and onboarding. Copy is plain and never themed: "Nothing in the fridge yet". Widgets do not use this;
	// they show a one-line prompt instead.
	import type { HTMLAttributes } from 'svelte/elements'
	import type { IconName } from '$lib/icons/icons.js'
	import { useStrings } from '$lib/i18n/context.js'
	import Button from '../Button/Button.svelte'

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'title'> & {
		/** A plain title in display-md: "Nothing in the fridge yet". */
		title: string
		/** One sentence saying what to do, in text-secondary. */
		text?: string
		/** The one primary action. */
		action?: { label: string; icon?: IconName; onclick?: () => void }
		/** The quiet "Add sample data" link; `label` replaces the default wording. */
		sample?: { label?: string; onclick?: () => void }
		/** The frond. Off for an empty state that should not repeat it. */
		motif?: boolean
	}
	let { title, text, action, sample, motif = true, class: className = '', ...rest }: Props = $props()

	const s = useStrings()
</script>

<div class={['ed-empty', className]} {...rest}>
	{#if motif}
		<svg class="ed-empty-motif" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
			<path d="M24 44V22" />
			<path d="M24 30c0-6 4-10 11-10 0 6-4 10-11 10z" />
			<path d="M24 36c0-6-4-10-11-10 0 6 4 10 11 10z" />
			<path d="M24 22c0-5 2-9 6-12 1 4 0 8-3 11" />
		</svg>
	{/if}
	<h2 class="ed-empty-title">{title}</h2>
	{#if text}<p class="ed-empty-text">{text}</p>{/if}
	{#if action || sample}
		<div class="ed-empty-actions">
			{#if action}<Button variant="primary" label={action.label} icon={action.icon} onclick={action.onclick} />{/if}
			{#if sample}
				<button class="ed-empty-link" type="button" onclick={sample.onclick}>{sample.label ?? s.addSampleData}</button>
			{/if}
		</div>
	{/if}
</div>

<style>
	.ed-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: var(--space-3);
		box-sizing: border-box;
		max-width: calc(var(--sheet-sm) + var(--space-8));
		margin: 0 auto;
		padding: var(--space-8) var(--space-6);
		color: var(--text-primary);
	}
	/* The frond: linework in the accent, sized by the brand dial */
	.ed-empty-motif {
		width: var(--ed-motif-size);
		height: var(--ed-motif-size);
		flex: none;
		margin-bottom: var(--space-1);
		color: var(--brand-primary);
		fill: none;
		stroke: currentColor;
		stroke-width: 1.5;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.ed-empty-title {
		margin: 0;
		font: var(--ed-t-display-md);
		letter-spacing: var(--ed-t-display-md-tracking);
		font-variation-settings: var(--ed-t-display-md-opsz);
		text-wrap: balance;
	}
	.ed-empty-text {
		margin: 0;
		font: var(--ed-t-body);
		letter-spacing: var(--ed-t-body-tracking);
		font-variation-settings: var(--ed-t-body-opsz);
		color: var(--text-secondary);
		text-wrap: pretty;
	}
	.ed-empty-actions {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-2);
		margin-top: var(--space-1);
	}
	/* A text link with a control's height, so it is a target on mobile; it hovers by the ink wash like any quiet control */
	.ed-empty-link {
		display: inline-flex;
		align-items: center;
		min-height: var(--ed-control);
		margin: 0;
		padding: 0 var(--space-2);
		border: 0;
		border-radius: var(--ed-radius-control);
		background: transparent;
		color: var(--brand-hover);
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		font-variation-settings: var(--ed-t-body-sm-opsz);
		text-decoration: underline;
		text-underline-offset: 0.2em;
		cursor: pointer;
		transition: background-color var(--ed-duration-micro) var(--ed-ease-out);
	}
	.ed-empty-link:hover {
		background: color-mix(in srgb, var(--ed-hover-ink) 6%, transparent);
	}
	.ed-empty-link:active {
		background: color-mix(in srgb, var(--ed-hover-ink) 14%, transparent);
	}
	.ed-empty-link:focus-visible {
		outline: 2px solid transparent;
		box-shadow: var(--focus-ring);
	}
</style>
