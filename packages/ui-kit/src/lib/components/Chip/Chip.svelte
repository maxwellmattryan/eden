<script module lang="ts">
	export type ChipTone = 'neutral' | 'accent' | 'ai' | 'honey' | 'grey' | 'outline'
	export type ChipStatus = 'healthy' | 'stale' | 'failed' | 'off'

	/** A meter reading, kept inside 0–100. */
	const clamp = (value: number) => Math.max(0, Math.min(100, value))
</script>

<script lang="ts">
	// A pill for a unit, a filter, an integration, a location, a registry id or the Gardener's state. With `selectable`
	// or `onclick` it is a button, otherwise a span. A selectable chip owns its state: it toggles `selected` (bindable)
	// and then reports through `onselect`, so a parent that binds and one that listens see the same value.
	import type { HTMLAttributes } from 'svelte/elements'
	import type { IconName } from '$lib/icons/icons.js'
	import Icon from '$lib/icons/Icon.svelte'
	import { useStrings } from '$lib/i18n/context.js'

	type Props = Omit<HTMLAttributes<HTMLElement>, 'onclick'> & {
		/** The text: a unit, a filter, a name, a registry id. */
		label: string
		/** neutral labels; accent marks a parsed field or a selected filter; ai and honey are the Gardener's two colours; grey means no key or not connected here; outline is a filter trigger. */
		tone?: ChipTone
		/** A leading glyph. */
		icon?: IconName
		/** A trailing count, in mono. */
		count?: number | string
		/** An integration's health: a dot beside the name, with the word for assistive technology. */
		status?: ChipStatus
		/** A 0–100 budget meter, for the model chip. */
		meter?: number
		/** Renders a toggle button with aria-pressed. */
		selectable?: boolean
		/** The toggle state (bindable). */
		selected?: boolean
		/** Sets the text in mono, for units and ids. */
		mono?: boolean
		/** Any chip with onclick renders as a button. */
		onclick?: (event: MouseEvent) => void
		/** Called with the new state after a selectable chip toggles. */
		onselect?: (selected: boolean) => void
	}
	let {
		label,
		tone = 'neutral',
		icon,
		count,
		status,
		meter,
		selectable = false,
		selected = $bindable(false),
		mono = false,
		onclick,
		onselect,
		class: className = '',
		...rest
	}: Props = $props()

	const s = useStrings()
	const interactive = $derived(selectable || !!onclick)
	const percent = $derived(meter === undefined ? undefined : clamp(meter))

	function click(event: MouseEvent) {
		if (selectable) {
			selected = !selected
			onselect?.(selected)
		}
		onclick?.(event)
	}
</script>

<svelte:element
	this={interactive ? 'button' : 'span'}
	class={['ed-chip', `ed-chip-${tone}`, { 'ed-chip-mono': mono }, className]}
	type={interactive ? 'button' : undefined}
	aria-pressed={selectable ? selected : undefined}
	onclick={interactive ? click : undefined}
	{...rest}
>
	{#if status}<span class="ed-chip-dot ed-chip-dot-{status}"></span>{/if}
	{#if icon}<Icon name={icon} size="sm" />{/if}
	<span class="ed-chip-label">{label}</span>
	{#if status}<span class="ed-sr-only">{s.chip.status[status]}</span>{/if}
	{#if count !== undefined}<span class="ed-chip-count">{count}</span>{/if}
	{#if percent !== undefined}
		<span
			class="ed-chip-meter"
			role="meter"
			aria-label={s.chip.budgetUsed}
			aria-valuenow={percent}
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuetext={s.chip.percent(percent)}
		>
			<span class="ed-chip-meter-fill" style:width="{percent}%"></span>
		</span>
	{/if}
</svelte:element>

<style>
	.ed-chip {
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		font-variation-settings: var(--ed-t-body-sm-opsz);
		height: var(--space-6);
		margin: 0;
		padding: 0 var(--space-2);
		border-radius: var(--radius-full);
		border: 1px solid transparent;
		background: var(--surface-2);
		color: var(--text-primary);
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		white-space: nowrap;
		cursor: default;
		position: relative;
		isolation: isolate;
		box-sizing: border-box;
		transition:
			background-color var(--ed-duration-micro) var(--ed-ease-out),
			color var(--ed-duration-micro) var(--ed-ease-out),
			border-color var(--ed-duration-micro) var(--ed-ease-out);
	}
	.ed-chip-mono {
		font: var(--ed-t-data-sm);
		letter-spacing: var(--ed-t-data-sm-tracking);
		font-variation-settings: var(--ed-t-data-sm-opsz);
	}

	/* A button chip hovers by the ink wash over its own tone, whatever the tone */
	button.ed-chip {
		cursor: pointer;
	}
	button.ed-chip::after {
		content: '';
		position: absolute;
		inset: -1px;
		border-radius: inherit;
		background: var(--ed-hover-ink);
		opacity: 0;
		transition: opacity var(--ed-duration-micro) var(--ed-ease-out);
		pointer-events: none;
		z-index: -1;
	}
	button.ed-chip:hover::after {
		opacity: 0.06;
	}
	button.ed-chip:active::after {
		opacity: 0.14;
	}
	button.ed-chip:focus-visible {
		outline: 2px solid transparent;
		box-shadow: var(--focus-ring);
	}

	.ed-chip-accent {
		background: var(--brand-muted);
		color: var(--brand-hover);
		border-color: var(--ed-chip-accent-border);
		font-weight: 500;
	}
	.ed-chip-ai {
		background: var(--ai-muted);
		color: var(--ai);
		font-weight: 500;
	}
	.ed-chip-honey {
		background: var(--honey-muted);
		color: var(--honey);
		font-weight: 500;
	}
	.ed-chip-grey {
		background: var(--surface-2);
		color: var(--text-secondary);
	}
	.ed-chip-outline {
		background: transparent;
		border-color: var(--stroke);
	}
	button.ed-chip-outline:hover {
		border-color: var(--stroke-hover);
	}
	.ed-chip[aria-pressed='true'] {
		background: var(--brand-muted);
		color: var(--brand-hover);
		border-color: var(--brand-primary);
		font-weight: 500;
	}

	.ed-chip-count {
		font: var(--ed-t-data-sm);
		letter-spacing: var(--ed-t-data-sm-tracking);
		font-variation-settings: var(--ed-t-data-sm-opsz);
	}

	/* The status dot: healthy is the accent, stale the warning, failed danger, off quiet; the word is beside it */
	.ed-chip-dot {
		width: var(--space-2);
		height: var(--space-2);
		border-radius: var(--radius-full);
		background: var(--text-tertiary);
		flex: none;
	}
	.ed-chip-dot-healthy {
		background: var(--brand-primary);
	}
	.ed-chip-dot-stale {
		background: var(--warning);
	}
	.ed-chip-dot-failed {
		background: var(--danger);
	}

	.ed-chip-meter {
		display: inline-block;
		width: calc(var(--space-8) + var(--space-2));
		height: var(--space-1);
		border-radius: var(--radius-full);
		background: var(--ed-meter-track);
		overflow: hidden;
		flex: none;
	}
	.ed-chip-meter-fill {
		display: block;
		height: 100%;
		background: currentColor;
	}
</style>
