<script lang="ts">
	// A labelled input whose border becomes the focus ring (InputWrap draws it). The unit is a mono chip inside the
	// field, never a suffix in the placeholder. Helper text sits beneath in caption; an error replaces it in danger and
	// sets aria-invalid. `large` is the Quick Log value: data-lg in Geist Mono, --field-lg tall, a decimal keypad.
	// The input is controlled (value plus oninput) because the compiler forbids bind:value with a dynamic `type`.
	// `value` has no fallback on purpose: a bindable with one throws when it is bound to something unset, such as a
	// key a record does not hold yet, and a form binds its fields to exactly that. Unset reads as empty.
	// `multiline` swaps the input for a textarea in the same chrome: it starts `rows` tall, grows with its content
	// (`field-sizing: content`, where the engine has it; otherwise it stays `rows` tall and scrolls) and stops at about
	// eight lines. Its events reach `oninput` and `onkeydown` as the input's would, so Enter can submit from either.
	import type { Snippet } from 'svelte'
	import type { HTMLInputAttributes, HTMLTextareaAttributes } from 'svelte/elements'
	import type { IconName } from '../../icons/icons.js'
	import Icon from '../../icons/Icon.svelte'
	import Chip from '../Chip/Chip.svelte'
	import InputWrap from './InputWrap.svelte'

	type Props = Omit<
		HTMLInputAttributes,
		'value' | 'placeholder' | 'type' | 'id' | 'oninput' | 'onkeydown' | 'class' | 'children'
	> & {
		/** The visible label above the field. Without it, pass `aria-label` so the input still has a name. */
		label?: string
		/** The text in the field. Bindable, to an unset key too: it reads as empty until something is typed. */
		value?: string
		placeholder?: string
		/** A unit shown as a mono chip inside the field. */
		unit?: string
		/** One line beneath the field, in caption. */
		helper?: string
		/** Replaces the helper, turns the border and the ring danger and sets aria-invalid. */
		error?: string
		/** A leading glyph inside the field. */
		icon?: IconName
		/** Geist Mono, for a value that is copied or aligned. */
		mono?: boolean
		/** The Quick Log value: data-lg in mono, --field-lg tall, a decimal keypad on touch. */
		large?: boolean
		/** A textarea in the same chrome, growing with its content to about eight lines. */
		multiline?: boolean
		/** multiline only: the lines shown before anything is typed, and the height where the engine cannot size to content. */
		rows?: number
		type?: HTMLInputAttributes['type']
		/** The input's id; the label and the helper point at it. */
		id?: string
		/** Called after the bound value has been updated. */
		oninput?: HTMLInputAttributes['oninput']
		onkeydown?: HTMLInputAttributes['onkeydown']
		/** Anything after the unit: a shortcut hint, a chip, a small control. */
		trailing?: Snippet
		class?: string
	}
	const uid = $props.id()
	let {
		label,
		value = $bindable(),
		placeholder,
		unit,
		helper,
		error,
		icon,
		mono = false,
		large = false,
		multiline = false,
		rows = 1,
		type = 'text',
		id = uid,
		oninput,
		onkeydown,
		trailing,
		class: className = '',
		...rest
	}: Props = $props()

	const message = $derived(error || helper)
	const messageId = $derived(`${id}-message`)

	/** Either control's event, forwarded under the input's type: both carry `currentTarget.value`. */
	type Target = EventTarget & (HTMLInputElement | HTMLTextAreaElement)
	function input(e: Event & { currentTarget: Target }) {
		value = e.currentTarget.value
		oninput?.(e as Event & { currentTarget: EventTarget & HTMLInputElement })
	}
	function keydown(e: KeyboardEvent & { currentTarget: Target }) {
		onkeydown?.(e as KeyboardEvent & { currentTarget: EventTarget & HTMLInputElement })
	}
	/** The pass-through attributes, under the textarea's type when that is what renders. */
	const textareaRest = $derived(rest as unknown as HTMLTextareaAttributes)
</script>

<div class="ed-field {className}" class:ed-field-multiline={multiline}>
	{#if label}<label class="ed-field-label" for={id}>{label}</label>{/if}
	<InputWrap {large} invalid={!!error} grow={multiline}>
		{#if icon}<span class="ed-field-side"><Icon name={icon} size="sm" class="ed-field-icon" /></span>{/if}
		{#if multiline}
			<textarea
				class="ed-field-input ed-field-textarea"
				class:ed-field-input-mono={mono}
				{id}
				{rows}
				{placeholder}
				value={value ?? ''}
				aria-invalid={error ? 'true' : undefined}
				aria-describedby={message ? messageId : undefined}
				oninput={input}
				onkeydown={keydown}
				{...textareaRest}></textarea>
		{:else}
			<input
				class="ed-field-input"
				class:ed-field-input-mono={mono}
				class:ed-field-input-lg={large}
				{id}
				{type}
				{placeholder}
				value={value ?? ''}
				inputmode={large ? 'decimal' : undefined}
				aria-invalid={error ? 'true' : undefined}
				aria-describedby={message ? messageId : undefined}
				oninput={input}
				onkeydown={keydown}
				{...rest}
			/>
		{/if}
		{#if unit || trailing}
			<span class="ed-field-side">
				{#if unit}<Chip label={unit} mono />{/if}
				{@render trailing?.()}
			</span>
		{/if}
	</InputWrap>
	{#if message}
		<p class="ed-field-message" class:ed-field-error={!!error} id={messageId}>{message}</p>
	{/if}
</div>

<style>
	.ed-field {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}
	.ed-field-label {
		font: var(--ed-t-label);
		letter-spacing: var(--ed-t-label-tracking);
		color: var(--text-primary);
	}
	.ed-field :global(.ed-field-icon) {
		color: var(--text-tertiary);
	}
	/* What sits beside the text: full height in a one-line field, the first line's height in a growing one */
	.ed-field-side {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		align-self: stretch;
		flex: none;
	}
	.ed-field-multiline .ed-field-side {
		align-self: flex-start;
		height: calc(var(--ed-control) - 2px);
	}
	.ed-field-input {
		flex: 1;
		min-width: 0;
		height: 100%;
		margin: 0;
		padding: 0;
		border: 0;
		border-radius: 0;
		background: transparent;
		color: inherit;
		font: var(--ed-t-text);
		appearance: none;
		outline: none;
		box-shadow: none;
	}
	.ed-field-input::placeholder {
		color: var(--text-tertiary);
	}
	/* The textarea sizes to its content where the engine can (Chromium 123, WebKit 26); elsewhere it keeps `rows` and
	   scrolls. Its first line sits where the input's does, and it stops growing at about eight lines. */
	.ed-field-textarea {
		height: auto;
		min-height: 1lh;
		max-height: 8lh;
		padding-block: calc((var(--ed-control) - 2px - 1lh) / 2);
		resize: none;
		field-sizing: content;
		overflow-y: auto;
		line-height: inherit;
	}
	.ed-field-input-mono {
		font: var(--ed-t-data);
		letter-spacing: var(--ed-t-data-tracking);
	}
	.ed-field-input-lg {
		font: var(--ed-t-data-lg);
		letter-spacing: var(--ed-t-data-lg-tracking);
		font-variant-numeric: tabular-nums;
	}
	/* A date or a time is typed a part at a time, and the part being typed is marked. The browser marks it in the
	   system's colour (its highlight, or on Apple's systems the system accent), a blue that belongs to no theme; here
	   it takes the accent the owner chose, with the ink made to be read on it. The muted accent that marks selected
	   text is too faint on the field's own surface to say which part is in hand.
	   The rules stay apart on purpose, because a selector an engine does not know drops its whole list. WebKit matches
	   the part by :focus, as its own stylesheet does, and names the AM/PM part `meridiem`. Chromium no longer matches
	   :focus on a part from a page's stylesheet (152 parses it and applies nothing), but does match :focus-within,
	   which for a part with nothing inside it says the same; it names AM/PM `ampm` and has a week part. */
	.ed-field-input::-webkit-datetime-edit-year-field:focus,
	.ed-field-input::-webkit-datetime-edit-month-field:focus,
	.ed-field-input::-webkit-datetime-edit-day-field:focus,
	.ed-field-input::-webkit-datetime-edit-hour-field:focus,
	.ed-field-input::-webkit-datetime-edit-minute-field:focus,
	.ed-field-input::-webkit-datetime-edit-second-field:focus,
	.ed-field-input::-webkit-datetime-edit-millisecond-field:focus {
		background: var(--brand-primary);
		color: var(--on-brand);
		outline: none;
	}
	.ed-field-input::-webkit-datetime-edit-year-field:focus-within,
	.ed-field-input::-webkit-datetime-edit-month-field:focus-within,
	.ed-field-input::-webkit-datetime-edit-day-field:focus-within,
	.ed-field-input::-webkit-datetime-edit-hour-field:focus-within,
	.ed-field-input::-webkit-datetime-edit-minute-field:focus-within,
	.ed-field-input::-webkit-datetime-edit-second-field:focus-within,
	.ed-field-input::-webkit-datetime-edit-millisecond-field:focus-within {
		background: var(--brand-primary);
		color: var(--on-brand);
		outline: none;
	}
	.ed-field-input::-webkit-datetime-edit-meridiem-field:focus {
		background: var(--brand-primary);
		color: var(--on-brand);
		outline: none;
	}
	.ed-field-input::-webkit-datetime-edit-meridiem-field:focus-within {
		background: var(--brand-primary);
		color: var(--on-brand);
		outline: none;
	}
	.ed-field-input::-webkit-datetime-edit-week-field:focus,
	.ed-field-input::-webkit-datetime-edit-ampm-field:focus {
		background: var(--brand-primary);
		color: var(--on-brand);
		outline: none;
	}
	.ed-field-input::-webkit-datetime-edit-week-field:focus-within,
	.ed-field-input::-webkit-datetime-edit-ampm-field:focus-within {
		background: var(--brand-primary);
		color: var(--on-brand);
		outline: none;
	}
	.ed-field-message {
		margin: 0;
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		color: var(--text-secondary);
	}
	.ed-field-error {
		color: var(--danger);
	}
</style>
