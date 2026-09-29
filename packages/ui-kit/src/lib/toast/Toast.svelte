<script lang="ts">
	// One toast, for errors and undo only. ToastHost renders it from the store; anything else calls `toast()`. The element
	// is its own live region (status, or alert for an error), so the host carries none. The message and the action are
	// both set in the voice, so the toast reads as one sentence: "82.4 kg logged. Undo". Danger colours the alert icon
	// only; the sentence stays in text-primary. The dismiss button and the action both hand back through `ondismiss`,
	// the action after its own onclick.
	import type { HTMLAttributes } from 'svelte/elements'
	import Icon from '$lib/icons/Icon.svelte'
	import Button from '$lib/components/Button/Button.svelte'
	import IconButton from '$lib/components/IconButton/IconButton.svelte'
	import { useStrings } from '$lib/i18n/context.js'
	import type { ToastAction } from './toast.svelte.js'

	type Props = HTMLAttributes<HTMLDivElement> & {
		/** One sentence in the voice: "82.4 kg logged." */
		message: string
		/** Usually Undo. Its icon shows only when given; nothing is inferred from the label. */
		action?: ToastAction
		/** An error toast: the alert icon in danger and role="alert". */
		error?: boolean
		/** Called when the dismiss button is pressed, and after the action's own onclick. */
		ondismiss?: () => void
	}
	let { message, action, error = false, ondismiss, class: className = '', ...rest }: Props = $props()

	const s = useStrings()

	function act() {
		action?.onclick?.()
		ondismiss?.()
	}
</script>

<div class={['ed-toast', className]} role={error ? 'alert' : 'status'} {...rest}>
	{#if error}
		<span class="ed-toast-icon"><Icon name="triangle-alert" size="sm" /></span>
	{/if}
	<span class="ed-toast-text">{message}</span>
	{#if action}
		<Button class="ed-toast-action" variant="quiet" label={action.label} icon={action.icon} onclick={act} />
	{/if}
	<IconButton class="ed-toast-dismiss" icon="x" label={s.dismiss} tooltip onclick={() => ondismiss?.()} />
</div>

<style>
	.ed-toast {
		display: inline-flex;
		align-items: center;
		gap: var(--space-3);
		box-sizing: border-box;
		max-width: min(100%, calc(var(--sheet-md) + var(--space-8)));
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
		background: var(--surface-1);
		color: var(--text-primary);
		box-shadow: var(--shadow-card);
		font: var(--ed-t-voice);
		letter-spacing: var(--ed-t-voice-tracking);
		font-variation-settings: var(--ed-t-voice-opsz);
		text-align: start;
	}
	/* The icon sits on the first line of the sentence: its box is one line of the voice, whatever the brand dial sets */
	.ed-toast-icon {
		display: inline-flex;
		align-items: center;
		flex: none;
		align-self: flex-start;
		height: 1lh;
		color: var(--danger);
	}
	.ed-toast-text {
		flex: 1 1 auto;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	/* The controls keep their platform height without growing the toast: they overlap its padding instead */
	.ed-toast > :global(.ed-toast-action),
	.ed-toast > :global(.ed-toast-dismiss) {
		flex: none;
		margin-block: calc(-1 * var(--space-2));
	}
	.ed-toast > :global(.ed-toast-dismiss) {
		margin-inline-end: calc(-1 * var(--space-2));
	}
</style>
