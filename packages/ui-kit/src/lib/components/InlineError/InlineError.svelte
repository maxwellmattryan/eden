<script lang="ts">
	// Errors are inline and plain: what could not be done, the time of the last good data, and a retry that shows its own
	// busy state while `onretry` runs. Danger colours the icon only; the sentence stays in text-primary. Rendered with
	// the page by default; `live` makes it an alert for an error that arrives later.
	import type { HTMLAttributes } from 'svelte/elements'
	import Icon from '../../icons/Icon.svelte'
	import { useStrings } from '../../i18n/context.js'
	import Button from '../Button/Button.svelte'

	type Props = HTMLAttributes<HTMLDivElement> & {
		/** What could not be done: "Couldn't reach Open-Meteo." No apology, no exclamation mark. */
		message: string
		/** The time of the last good data, as a sentence: "Showing the forecast from 07:40." */
		lastGood?: string
		/** Retry. May return a promise: the button reads Retrying… and is disabled until it settles, either way. */
		onretry?: () => void | Promise<unknown>
		/** Announce the error when it appears (role="alert"). Off by default: most errors render with the page. */
		live?: boolean
	}
	let { message, lastGood, onretry, live = false, class: className = '', ...rest }: Props = $props()

	const s = useStrings()
	let busy = $state(false)

	async function retry() {
		if (busy || !onretry) return
		busy = true
		try {
			await onretry()
		} finally {
			busy = false
		}
	}
</script>

<div class={['ed-inline-error', className]} role={live ? 'alert' : undefined} {...rest}>
	<span class="ed-inline-error-icon"><Icon name="triangle-alert" size="sm" /></span>
	<div class="ed-inline-error-text">
		<p class="ed-inline-error-message">{message}</p>
		{#if lastGood}<p class="ed-inline-error-when">{lastGood}</p>{/if}
	</div>
	{#if onretry}
		<Button
			class="ed-inline-error-retry"
			variant="secondary"
			label={busy ? s.retrying : s.retry}
			disabled={busy}
			onclick={retry}
		/>
	{/if}
</div>

<style>
	.ed-inline-error {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		box-sizing: border-box;
		max-width: calc(var(--sheet-md) + var(--space-8));
		padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3);
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
		background: var(--surface-1);
		color: var(--text-primary);
		font: var(--ed-t-voice);
		letter-spacing: var(--ed-t-voice-tracking);
		font-variation-settings: var(--ed-t-voice-opsz);
	}
	/* The icon and the first line of the sentence centre on the retry button, whatever height the platform gives it */
	.ed-inline-error-icon,
	.ed-inline-error-text {
		padding-block: calc((var(--ed-control) - 1lh) / 2);
	}
	.ed-inline-error-icon {
		display: inline-flex;
		align-items: center;
		flex: none;
		height: 1lh;
		box-sizing: content-box;
		color: var(--danger);
	}
	.ed-inline-error-text {
		flex: 1 1 auto;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.ed-inline-error-message {
		margin: 0;
		overflow-wrap: anywhere;
	}
	.ed-inline-error-when {
		margin: 0;
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		font-variation-settings: var(--ed-t-body-sm-opsz);
		color: var(--text-secondary);
	}
	.ed-inline-error > :global(.ed-inline-error-retry) {
		flex: none;
	}
</style>
