<script lang="ts" module>
	export interface SelectOption {
		value: string
		label: string
		disabled?: boolean
	}
	/** Options under a heading of their own. */
	export interface SelectGroup {
		label: string
		options: SelectOption[]
	}
</script>

<script lang="ts">
	// One choice from a list, in the field's chrome (InputWrap draws the border and the ring). The control is the
	// platform's own select: the list it opens is the system's, with its typeahead on a desktop and its picker on a
	// phone, so a long list (every country) costs nothing here. `value` has no fallback, as Field's has none: it may be
	// bound to a key that is not set yet, and reads as nothing chosen.
	import type { HTMLSelectAttributes } from 'svelte/elements'
	import Icon from '../../icons/Icon.svelte'
	import InputWrap from '../Field/InputWrap.svelte'

	type Props = Omit<HTMLSelectAttributes, 'value' | 'id' | 'onchange' | 'class' | 'children'> & {
		/** The visible label above the control. Without it, pass `aria-label` so the select still has a name. */
		label?: string
		/** The chosen option's value. Bindable, to an unset key too: it reads as nothing chosen. */
		value?: string
		/** The choices, flat or under headings. */
		options: (SelectOption | SelectGroup)[]
		/** What shows while nothing is chosen; choosing it again clears the value. */
		placeholder?: string
		/** One line beneath the control, in caption. */
		helper?: string
		/** Replaces the helper, turns the border and the ring danger and sets aria-invalid. */
		error?: string
		/** The select's id; the label and the helper point at it. */
		id?: string
		/** Called with the new value after the bound value has been updated. */
		onchange?: (value: string) => void
		class?: string
	}
	const uid = $props.id()
	let {
		label,
		value = $bindable(),
		options,
		placeholder,
		helper,
		error,
		id = uid,
		onchange,
		class: className = '',
		...rest
	}: Props = $props()

	const message = $derived(error || helper)
	const messageId = $derived(`${id}-message`)

	function change(e: Event & { currentTarget: EventTarget & HTMLSelectElement }) {
		value = e.currentTarget.value
		onchange?.(value)
	}
</script>

{#snippet choice(option: SelectOption)}
	<option value={option.value} disabled={option.disabled}>{option.label}</option>
{/snippet}

<div class="ed-select {className}">
	{#if label}<label class="ed-select-label" for={id}>{label}</label>{/if}
	<InputWrap invalid={!!error}>
		<span class="ed-select-slot">
			<select
				class="ed-select-control"
				{id}
				value={value ?? ''}
				data-unset={value ? undefined : ''}
				aria-invalid={error ? 'true' : undefined}
				aria-describedby={message ? messageId : undefined}
				onchange={change}
				{...rest}
			>
				{#if placeholder !== undefined || !value}<option value="">{placeholder ?? ''}</option>{/if}
				{#each options as entry ('options' in entry ? `group:${entry.label}` : entry.value)}
					{#if 'options' in entry}
						<optgroup label={entry.label}>
							{#each entry.options as option (option.value)}{@render choice(option)}{/each}
						</optgroup>
					{:else}
						{@render choice(entry)}
					{/if}
				{/each}
			</select>
			<Icon name="chevron-down" size="sm" class="ed-select-chevron" />
		</span>
	</InputWrap>
	{#if message}
		<p class="ed-select-message" class:ed-select-error={!!error} id={messageId}>{message}</p>
	{/if}
</div>

<style>
	.ed-select {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}
	.ed-select-label {
		font: var(--ed-t-label);
		letter-spacing: var(--ed-t-label-tracking);
		color: var(--text-primary);
	}
	/* The select and its chevron share one cell, so a press anywhere across the field opens the list */
	.ed-select-slot {
		display: grid;
		flex: 1;
		align-items: center;
		min-width: 0;
		height: 100%;
	}
	.ed-select-slot > :global(*) {
		grid-area: 1 / 1;
	}
	.ed-select-slot :global(.ed-select-chevron) {
		justify-self: end;
		color: var(--text-secondary);
		pointer-events: none;
	}
	.ed-select-control {
		width: 100%;
		min-width: 0;
		height: 100%;
		margin: 0;
		padding: 0 var(--space-6) 0 0;
		border: 0;
		border-radius: 0;
		background: transparent;
		color: inherit;
		font: var(--ed-t-text);
		text-overflow: ellipsis;
		appearance: none;
		outline: none;
		box-shadow: none;
		cursor: pointer;
	}
	.ed-select-control[data-unset] {
		color: var(--text-secondary);
	}
	.ed-select-control:disabled {
		cursor: default;
		opacity: 0.5;
	}
	.ed-select-message {
		margin: 0;
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		color: var(--text-secondary);
	}
	.ed-select-error {
		color: var(--danger);
	}
</style>
