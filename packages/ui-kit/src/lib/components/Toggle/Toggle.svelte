<script lang="ts">
	// An on/off switch: a button with role="switch" beside its label. The track is surface-3 off and the accent on;
	// the knob travels as a transform over the panel duration (so it stands still under reduced motion) while the
	// colours cross-fade over the micro duration. The label and description are real text, tied to the switch through
	// ids, and the label element also forwards its clicks. The button's hit area is a full control height.
	import type { HTMLAttributes } from 'svelte/elements'

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'onchange' | 'children' | 'id'> & {
		/** Whether the switch is on. Bindable. */
		checked?: boolean
		/** What the switch controls, rendered beside it and read as its name. */
		label: string
		/** One line under the label, read as the switch's description. */
		description?: string
		disabled?: boolean
		/** Called with the new state after the switch flips. */
		onchange?: (checked: boolean) => void
		/** The switch's id; the label and description ids derive from it. */
		id?: string
	}
	const uid = $props.id()
	let {
		checked = $bindable(false),
		label,
		description,
		disabled = false,
		onchange,
		id = uid,
		class: className = '',
		...rest
	}: Props = $props()

	const labelId = $derived(`${id}-label`)
	const descriptionId = $derived(`${id}-description`)

	function flip() {
		if (disabled) return
		checked = !checked
		onchange?.(checked)
	}
</script>

<div class="ed-toggle {className}" class:ed-toggle-disabled={disabled} {...rest}>
	<label class="ed-toggle-text" for={id}>
		<span class="ed-toggle-label" id={labelId}>{label}</span>
		{#if description}<span class="ed-toggle-description" id={descriptionId}>{description}</span>{/if}
	</label>
	<button
		class="ed-toggle-switch"
		type="button"
		role="switch"
		{id}
		aria-checked={checked}
		aria-labelledby={labelId}
		aria-describedby={description ? descriptionId : undefined}
		{disabled}
		onclick={flip}
	>
		<span class="ed-toggle-track">
			<span class="ed-toggle-knob"></span>
		</span>
	</button>
</div>

<style>
	.ed-toggle {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		color: var(--text-primary);
	}
	.ed-toggle-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		cursor: pointer;
	}
	.ed-toggle-disabled .ed-toggle-text {
		cursor: default;
	}
	.ed-toggle-label {
		font: var(--ed-t-text);
		color: var(--text-primary);
	}
	.ed-toggle-disabled .ed-toggle-label {
		color: var(--text-secondary);
	}
	.ed-toggle-description {
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		color: var(--text-secondary);
	}
	.ed-toggle-switch {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex: none;
		box-sizing: border-box;
		min-width: var(--ed-control);
		height: var(--ed-control);
		margin: 0;
		padding: 0 var(--space-1);
		border: 0;
		background: transparent;
		color: inherit;
		cursor: pointer;
		appearance: none;
	}
	.ed-toggle-switch:disabled {
		cursor: default;
	}
	.ed-toggle-switch:focus-visible {
		outline: 2px solid transparent;
	}
	.ed-toggle-track {
		position: relative;
		display: block;
		box-sizing: border-box;
		width: calc(var(--icon-md) + var(--icon-sm));
		height: var(--icon-md);
		border: 1px solid var(--stroke);
		border-radius: var(--radius-full);
		background: var(--surface-3);
		transition:
			background-color var(--ed-duration-micro) var(--ed-ease-out),
			border-color var(--ed-duration-micro) var(--ed-ease-out);
	}
	.ed-toggle-switch[aria-checked='true'] .ed-toggle-track {
		border-color: var(--brand-primary);
		background: var(--brand-primary);
	}
	.ed-toggle-switch:focus-visible .ed-toggle-track {
		box-shadow: var(--focus-ring);
	}
	.ed-toggle-switch:disabled .ed-toggle-track {
		opacity: 0.5;
	}
	.ed-toggle-knob {
		position: absolute;
		top: 1px;
		left: 1px;
		width: var(--icon-sm);
		height: var(--icon-sm);
		border-radius: var(--radius-full);
		background: var(--surface-0);
		box-shadow: var(--shadow-card);
		transition:
			transform var(--ed-duration-panel) var(--ed-ease-out),
			background-color var(--ed-duration-micro) var(--ed-ease-out);
	}
	.ed-toggle-switch[aria-checked='true'] .ed-toggle-knob {
		background: var(--on-brand);
		transform: translateX(var(--icon-sm));
	}
</style>
