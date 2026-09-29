<script lang="ts">
	// Confirms a write that cannot be undone or that leaves the device (docs/design/ux-patterns.md, "Confirmation and
	// risk patterns"). The title asks the question; a definition list names the subject, the resource and, for an
	// external action, the destination; the exact payload sits verbatim in mono when there is one; the confirm button
	// repeats the verb, in danger for a destructive write. Reversible writes take an undo toast instead, never this
	// sheet. Composes Sheet, so Escape and the scrim take the cancel path and focus returns to the opener.
	import type { HTMLDialogAttributes } from 'svelte/elements'
	import { useStrings } from '$lib/i18n/context.js'
	import Button from '../Button/Button.svelte'
	import Sheet, { type SheetCloseReason } from '../Sheet/Sheet.svelte'

	type Props = Omit<HTMLDialogAttributes, 'open' | 'title' | 'oncancel' | 'onclose' | 'onkeydown'> & {
		/** Bindable. Set it to open; every close path sets it back to false. */
		open?: boolean
		/** The question, in the title style: "Delete the recipe ‘Miso salmon’?" */
		title: string
		/** Who acts: "You", "Gardener · claude-sonnet". */
		subject: string
		/** What is written: "recipe", "shop-day". */
		resource: string
		/** Where an external action goes: "Google Calendar “Work”". Omit for a local write. */
		destination?: string
		/** What else changes, as one sentence in the voice: "Its stock links will become text." */
		text?: string
		/** The exact payload of an external action, shown verbatim in mono. */
		payload?: string
		/** The confirm button's label; it repeats the verb of the action: "Delete recipe", "Send to Google". */
		verb: string
		/** A destructive write: the confirm button is the danger variant. */
		danger?: boolean
		/** Called when the verb button is pressed; the sheet then closes. */
		onconfirm?: () => void
		/** Called when the sheet is cancelled: the Cancel button, Escape or the scrim. */
		oncancel?: () => void
	}
	const uid = $props.id()
	let {
		open = $bindable(false),
		title,
		text,
		subject,
		resource,
		destination,
		payload,
		verb,
		danger = false,
		onconfirm,
		oncancel,
		class: className = '',
		...rest
	}: Props = $props()

	const s = useStrings()
	const titleId = `${uid}-title`

	function confirm() {
		onconfirm?.()
		open = false
	}
	function cancel() {
		oncancel?.()
		open = false
	}
	// Escape and the scrim close the dialog themselves and report here; a close through `open` (the two buttons, or the
	// consumer) has already been accounted for.
	function onclose(reason: SheetCloseReason) {
		if (reason !== 'api') oncancel?.()
	}
</script>

<Sheet bind:open size={payload ? 'md' : 'sm'} labelledby={titleId} {onclose} class="ed-confirm {className}" {...rest}>
	{#snippet header()}
		<h2 class="ed-confirm-title" id={titleId}>{title}</h2>
		{#if text}<p class="ed-confirm-text">{text}</p>{/if}
	{/snippet}
	<dl class="ed-confirm-facts">
		<dt class="ed-confirm-key">{s.confirmSheet.subject}</dt>
		<dd class="ed-confirm-value">{subject}</dd>
		<dt class="ed-confirm-key">{s.confirmSheet.resource}</dt>
		<dd class="ed-confirm-value">{resource}</dd>
		{#if destination}
			<dt class="ed-confirm-key">{s.confirmSheet.destination}</dt>
			<dd class="ed-confirm-value">{destination}</dd>
		{/if}
	</dl>
	{#if payload}
		<pre class="ed-confirm-payload">{payload}</pre>
	{/if}
	{#snippet footer()}
		<Button label={s.cancel} variant="quiet" onclick={cancel} />
		<Button label={verb} variant={danger ? 'danger' : 'primary'} onclick={confirm} />
	{/snippet}
</Sheet>

<style>
	.ed-confirm-title {
		margin: 0;
		font: var(--ed-t-title);
		letter-spacing: var(--ed-t-title-tracking);
		font-variation-settings: var(--ed-t-title-opsz);
		color: var(--text-primary);
		overflow-wrap: anywhere;
	}
	.ed-confirm-facts {
		display: grid;
		grid-template-columns: max-content minmax(0, 1fr);
		column-gap: var(--space-4);
		row-gap: var(--space-1);
		align-items: baseline;
		margin: 0;
	}
	.ed-confirm-key {
		margin: 0;
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		color: var(--text-secondary);
	}
	.ed-confirm-value {
		margin: 0;
		font: var(--ed-t-body);
		color: var(--text-primary);
		overflow-wrap: anywhere;
	}
	.ed-confirm-text {
		margin: var(--space-1) 0 0;
		font: var(--ed-t-voice);
		letter-spacing: var(--ed-t-voice-tracking);
		font-variation-settings: var(--ed-t-voice-opsz);
		color: var(--text-primary);
	}
	.ed-confirm-payload {
		margin: var(--space-4) 0 0;
		padding: var(--space-2) var(--space-3);
		border-radius: var(--ed-radius-control);
		background: var(--surface-2);
		color: var(--text-primary);
		font: var(--ed-t-code);
		letter-spacing: var(--ed-t-code-tracking);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
</style>
