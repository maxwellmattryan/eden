<script lang="ts">
	// The composer: one bordered box that holds the message and its foot, after the shape a chat app's composer has
	// settled into. The field is bare (no chrome of its own: the box's border becomes the focus ring, as a Field's
	// does), grows with its lines to about eight, and sends on Enter; Shift+Enter breaks the line. The foot carries
	// what the app puts beside the message (the "can see" button) at the start, a quiet caption at the end (a model, a
	// cost) and the round send button on the Gardener's green (D-40), the Enter glyph since Enter is what sends, which
	// turns into Stop while the reply streams.
	// The composer owns its text: it clears itself after `onsend`, and never sends blank space unless the app says
	// there is something else to send (`allowEmpty`: files are attached). What is attached sits above the message
	// (`attachments`). Files pasted into the field go to `onfiles` instead of the text, and so does a paste longer
	// than `longPaste`, as a text file, so a pasted log does not bury the message.
	import type { Snippet } from 'svelte'
	import type { HTMLTextareaAttributes } from 'svelte/elements'
	import { useStrings } from '../../i18n/context.js'
	import IconButton from '../IconButton/IconButton.svelte'

	type Props = Omit<
		HTMLTextareaAttributes,
		'value' | 'placeholder' | 'disabled' | 'onkeydown' | 'onpaste' | 'class' | 'children'
	> & {
		/** The message so far (bindable): the app may prefill or read it. */
		value?: string
		placeholder?: string
		/** The field's accessible name; there is no visible label. */
		label: string
		/** Nothing can be typed or sent: no key on this device, the budget reached. */
		disabled?: boolean
		/** A reply is streaming: the send button becomes Stop, Enter does nothing, the field stays open for the next turn. */
		busy?: boolean
		/** Called with the trimmed message on Enter or the send button; the field is cleared first. */
		onsend: (text: string) => void
		/** A blank message may be sent: something is attached. `onsend` is then called with an empty string. */
		allowEmpty?: boolean
		/** Called with the files pasted into the field, and with a long paste as a text file; absent, a paste is text. */
		onfiles?: (files: File[]) => void
		/** A paste of more characters than this becomes a text file through `onfiles` instead of text in the field. */
		longPaste?: number
		/** What is attached to the message, above the field: file chips. */
		attachments?: Snippet
		/** Called by the Stop button while busy. */
		onstop?: () => void
		/** What sits at the foot's start: an attachment button, the "can see" button. */
		tools?: Snippet
		/** A quiet caption before the send button: the model, an estimate. */
		meta?: Snippet
		class?: string
	}
	let {
		value = $bindable(''),
		placeholder,
		label,
		disabled = false,
		busy = false,
		onsend,
		allowEmpty = false,
		onfiles,
		longPaste,
		attachments,
		onstop,
		tools,
		meta,
		class: className = '',
		...rest
	}: Props = $props()

	const s = useStrings()
	const uid = $props.id()
	const canSend = $derived(!disabled && !busy && (allowEmpty || value.trim().length > 0))

	function send() {
		if (!canSend) return
		const text = value.trim()
		value = ''
		onsend(text)
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return
		e.preventDefault()
		send()
	}

	function onpaste(e: ClipboardEvent) {
		const data = e.clipboardData
		if (!onfiles || !data) return
		const text = data.getData('text/plain')
		// a copied table or passage often carries a picture of itself beside its text: the text is what was meant
		if (!text && data.files.length) {
			e.preventDefault()
			onfiles(Array.from(data.files))
		} else if (longPaste !== undefined && text.length > longPaste) {
			e.preventDefault()
			onfiles([new File([text], s.gardener.pastedText, { type: 'text/plain' })])
		}
	}
</script>

<div class={['ed-composer', { 'ed-composer-disabled': disabled }, className]}>
	{#if attachments}<div class="ed-composer-attachments">{@render attachments()}</div>{/if}
	<textarea
		class="ed-composer-input"
		id={uid}
		bind:value
		rows="1"
		{placeholder}
		{disabled}
		aria-label={label}
		{onkeydown}
		{onpaste}
		{...rest}></textarea>
	<div class="ed-composer-foot">
		{#if tools}<div class="ed-composer-tools">{@render tools()}</div>{/if}
		<div class="ed-composer-end">
			{#if meta}<div class="ed-composer-meta">{@render meta()}</div>{/if}
			<!-- one button for both: the fill stays where it is and keeps its focus, the glyph fades to the other -->
			<IconButton
				class={['ed-composer-send', busy && 'ed-composer-send-busy']}
				icon={busy ? 'square' : 'corner-down-left'}
				label={busy ? s.gardener.stop : s.gardener.send}
				fill="ai"
				tooltip
				disabled={!busy && !canSend}
				onclick={() => (busy ? onstop?.() : send())}
			/>
		</div>
	</div>
</div>

<style>
	/* One box: the card radius, a stroke that firms on hover and becomes the flush 2 px ring while the field itself
	   has focus (not :focus-within: the chip's popover is a descendant in the DOM, and its focus is not the field's),
	   so there is only ever one line around the message */
	.ed-composer {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		box-sizing: border-box;
		width: 100%;
		min-width: 0;
		padding: var(--space-3) var(--space-2) var(--space-2) var(--space-3);
		border: 1px solid var(--stroke);
		border-radius: var(--ed-radius-card);
		background: var(--surface-0);
		box-shadow: var(--shadow-card);
		color: var(--text-primary);
		transition:
			border-color var(--ed-duration-micro) var(--ed-ease-out),
			box-shadow var(--ed-duration-micro) var(--ed-ease-out);
	}
	.ed-composer:hover {
		border-color: var(--stroke-hover);
	}
	.ed-composer:has(> .ed-composer-input:focus) {
		border-color: var(--brand-primary);
		box-shadow:
			0 0 0 1px var(--brand-primary),
			var(--shadow-card);
	}
	.ed-composer-disabled,
	.ed-composer-disabled:hover {
		border-color: var(--stroke-subtle);
		box-shadow: none;
	}

	/* What is attached: a wrapping row of chips above the message */
	.ed-composer-attachments {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		min-width: 0;
		padding: 0 var(--space-1) var(--space-1) 0;
	}

	/* The field: no chrome, the text style, sized to its lines where the engine can and scrolling past eight */
	.ed-composer-input {
		display: block;
		width: 100%;
		min-width: 0;
		min-height: 1lh;
		max-height: 8lh;
		margin: 0;
		padding: 0 var(--space-1) 0 0;
		border: 0;
		border-radius: 0;
		background: transparent;
		color: inherit;
		font: var(--ed-t-text);
		line-height: inherit;
		resize: none;
		field-sizing: content;
		overflow-y: auto;
		appearance: none;
		outline: none;
		box-shadow: none;
		box-sizing: border-box;
	}
	.ed-composer-input::placeholder {
		color: var(--text-tertiary);
	}
	.ed-composer-input:disabled {
		color: var(--text-secondary);
		cursor: default;
	}

	/* The foot: the tools at the start, the caption and the button at the end, on the control's height */
	.ed-composer-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		min-height: var(--ed-control);
		min-width: 0;
	}
	.ed-composer-tools {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-1);
		min-width: 0;
	}
	.ed-composer-end {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-left: auto;
		flex: none;
	}
	/* Send and Stop are one button; the glyph fades and settles in whenever it changes. Two animations of the same
	   shape, so turning busy on or off starts one afresh. */
	.ed-composer-end :global(.ed-composer-send svg) {
		animation: ed-composer-to-send var(--ed-duration-settle) var(--ed-ease-out);
	}
	.ed-composer-end :global(.ed-composer-send-busy svg) {
		animation-name: ed-composer-to-stop;
	}
	@keyframes ed-composer-to-send {
		from {
			opacity: 0;
			transform: scale(0.7);
		}
	}
	@keyframes ed-composer-to-stop {
		from {
			opacity: 0;
			transform: scale(0.7);
		}
	}
	.ed-composer-meta {
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		font-variation-settings: var(--ed-t-caption-opsz);
		color: var(--text-secondary);
		white-space: nowrap;
	}
</style>
