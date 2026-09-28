<script lang="ts">
	// A labelled input whose border becomes the focus ring (InputWrap draws it). The unit is a mono chip inside the
	// field, never a suffix in the placeholder. Helper text sits beneath in caption; an error replaces it in danger and
	// sets aria-invalid. `large` is the Quick Log value: data-lg in Geist Mono, --field-lg tall, a decimal keypad.
	// The input is controlled (value plus oninput) because the compiler forbids bind:value with a dynamic `type`.
	import type { Snippet } from 'svelte'
	import type { HTMLInputAttributes } from 'svelte/elements'
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
		/** The text in the field. Bindable. */
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
		value = $bindable(''),
		placeholder,
		unit,
		helper,
		error,
		icon,
		mono = false,
		large = false,
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

	function input(e: Event & { currentTarget: EventTarget & HTMLInputElement }) {
		value = e.currentTarget.value
		oninput?.(e)
	}
</script>

<div class="ed-field {className}">
	{#if label}<label class="ed-field-label" for={id}>{label}</label>{/if}
	<InputWrap {large} invalid={!!error}>
		{#if icon}<Icon name={icon} size="sm" class="ed-field-icon" />{/if}
		<input
			class="ed-field-input"
			class:ed-field-input-mono={mono}
			class:ed-field-input-lg={large}
			{id}
			{type}
			{placeholder}
			{value}
			inputmode={large ? 'decimal' : undefined}
			aria-invalid={error ? 'true' : undefined}
			aria-describedby={message ? messageId : undefined}
			oninput={input}
			{onkeydown}
			{...rest}
		/>
		{#if unit}<Chip label={unit} mono />{/if}
		{@render trailing?.()}
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
	.ed-field-input-mono {
		font: var(--ed-t-data);
		letter-spacing: var(--ed-t-data-tracking);
	}
	.ed-field-input-lg {
		font: var(--ed-t-data-lg);
		letter-spacing: var(--ed-t-data-lg-tracking);
		font-variant-numeric: tabular-nums;
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
