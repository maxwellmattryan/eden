<script module lang="ts">
	import type { IconName } from '$lib/icons/icons.js'

	export type BannerTone = 'info' | 'warning' | 'danger'
	export type BannerPlacement = 'inline' | 'top'

	/** The glyph each tone carries when none is given. */
	const TONE_ICON: Record<BannerTone, IconName> = { info: 'info', warning: 'triangle-alert', danger: 'triangle-alert' }
</script>

<script lang="ts">
	// The status-bar and top banners: offline, a stale integration, a failure. The tone colours the icon and a 1 px
	// leading edge only, because warning and info sit at 3:1 in light and may not carry text; the sentence stays in
	// text-primary on surface-1. `inline` is the single-line strip for the desktop status bar, its edge at the start.
	// `top` is a full-width bar for mobile that reaches under the safe-area inset, its edge drawn beneath the inset
	// where it can be seen. Info is a status; warning and danger are alerts.
	import type { HTMLAttributes } from 'svelte/elements'
	import Icon from '$lib/icons/Icon.svelte'
	import { useStrings } from '$lib/i18n/context.js'
	import Button from '../Button/Button.svelte'
	import IconButton from '../IconButton/IconButton.svelte'

	type Props = HTMLAttributes<HTMLDivElement> & {
		/** info for offline and notices, warning for stale data, danger for a failure. */
		tone?: BannerTone
		/** The glyph; each tone has its own by default. */
		icon?: IconName
		/** One sentence: "Offline. Showing the forecast from 07:40." */
		message: string
		/** One quiet action: Sync now, Reconnect. */
		action?: { label: string; onclick?: () => void }
		/** Shows the dismiss button. */
		dismissible?: boolean
		/** Called when the dismiss button is pressed; the consumer removes the banner. */
		ondismiss?: () => void
		/** inline is the status-bar strip; top is the full-width bar under the safe-area inset. */
		placement?: BannerPlacement
	}
	let {
		tone = 'info',
		icon,
		message,
		action,
		dismissible = false,
		ondismiss,
		placement = 'inline',
		class: className = '',
		...rest
	}: Props = $props()

	const s = useStrings()
	const glyph = $derived(icon ?? TONE_ICON[tone])
</script>

<div
	class={['ed-banner', `ed-banner-${tone}`, `ed-banner-${placement}`, className]}
	role={tone === 'info' ? 'status' : 'alert'}
	{...rest}
>
	<div class="ed-banner-row">
		<span class="ed-banner-icon"><Icon name={glyph} size="sm" /></span>
		<span class="ed-banner-message">{message}</span>
		{#if action}
			<Button class="ed-banner-action" variant="quiet" label={action.label} onclick={action.onclick} />
		{/if}
		{#if dismissible}
			<IconButton
				class="ed-banner-dismiss"
				icon="x"
				label={s.dismiss}
				size={placement === 'top' ? 'md' : 'sm'}
				tooltip
				onclick={() => ondismiss?.()}
			/>
		{/if}
	</div>
</div>

<style>
	.ed-banner {
		--ed-banner-tone: var(--info);
		box-sizing: border-box;
		background: var(--surface-1);
		color: var(--text-primary);
	}
	.ed-banner-warning {
		--ed-banner-tone: var(--warning);
	}
	.ed-banner-danger {
		--ed-banner-tone: var(--danger);
	}
	.ed-banner-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
	}
	.ed-banner-icon {
		display: inline-flex;
		align-items: center;
		flex: none;
		height: 1lh;
		box-sizing: content-box;
		color: var(--ed-banner-tone);
	}
	.ed-banner-message {
		flex: 1 1 auto;
		min-width: 0;
	}
	.ed-banner-row > :global(.ed-banner-action),
	.ed-banner-row > :global(.ed-banner-dismiss) {
		flex: none;
	}

	/* inline: one line in the status bar, a control high, the tone on its start edge */
	.ed-banner-inline {
		display: inline-flex;
		max-width: 100%;
		min-height: var(--ed-control);
		padding: 0 var(--space-2) 0 var(--space-3);
		border: 1px solid var(--ed-card-border);
		border-inline-start-color: var(--ed-banner-tone);
		border-radius: var(--ed-radius-control);
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		font-variation-settings: var(--ed-t-body-sm-opsz);
	}
	.ed-banner-inline .ed-banner-message {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* top: a full-width bar that reaches under the safe-area inset; the tone edge is drawn beneath the inset */
	.ed-banner-top {
		display: block;
		width: 100%;
		padding-top: var(--ed-safe-top);
		border-bottom: 1px solid var(--ed-card-border);
		font: var(--ed-t-voice);
		letter-spacing: var(--ed-t-voice-tracking);
		font-variation-settings: var(--ed-t-voice-opsz);
	}
	.ed-banner-top .ed-banner-row {
		align-items: flex-start;
		gap: var(--space-3);
		padding: var(--space-2) calc(var(--ed-gutter) + var(--ed-safe-right)) var(--space-2)
			calc(var(--ed-gutter) + var(--ed-safe-left));
		border-top: 1px solid var(--ed-banner-tone);
	}
	/* The icon and the first line of the sentence centre on the controls; a second line runs on below them */
	.ed-banner-top .ed-banner-icon,
	.ed-banner-top .ed-banner-message {
		padding-block: calc((var(--ed-control) - 1lh) / 2);
	}
</style>
