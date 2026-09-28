<script lang="ts">
	// A bare icon control with a required accessible name. `count` adds the bell's badge, a circle on the icon's
	// top-right corner that widens into a pill only when the number needs it, and folds the number into the name.
	// `fab` is the floating + on mobile: --fab wide, round, on the accent, so it hovers by the ink wash like any fill and
	// presses like one under the raised relief. Hover and pressed grounds are circles, never rounded boxes. `tooltip`
	// shows the label (or another string) on hover and keyboard focus, for a glyph that may not explain itself.
	import type { HTMLButtonAttributes } from 'svelte/elements'
	import type { IconName } from '$lib/icons/icons.js'
	import Icon from '$lib/icons/Icon.svelte'
	import { useStrings } from '$lib/i18n/context.js'
	import { tooltip as attachTooltip } from '../Tooltip/tooltip.js'

	type Props = Omit<HTMLButtonAttributes, 'aria-label' | 'aria-pressed'> & {
		/** The glyph. */
		icon: IconName
		/** The accessible name; required, because the glyph alone says nothing. */
		label: string
		/** The bell's unread count: a badge on the icon's corner, read as part of the name. */
		count?: number
		/** The floating + on mobile. */
		fab?: boolean
		/** md is the platform control (32 desktop, 44 mobile); sm is the 28 px variant for rows and the status bar. */
		size?: 'sm' | 'md'
		/** The pressed look while the popover it opened is showing; pass `aria-expanded` alongside it. */
		active?: boolean
		/** A real toggle: its state, exposed as aria-pressed. Leave undefined for a plain button. */
		pressed?: boolean
		/** button unless the button submits a form. */
		type?: 'button' | 'submit' | 'reset'
		/** A tooltip on hover and keyboard focus: true shows the label, a string shows that string. Never on touch. */
		tooltip?: boolean | string
	}
	let {
		icon,
		label,
		count = 0,
		fab = false,
		size = 'md',
		active = false,
		pressed,
		type = 'button',
		tooltip = false,
		class: className = '',
		...rest
	}: Props = $props()

	const s = useStrings()
	const tip = $derived(tooltip === true ? label : typeof tooltip === 'string' ? tooltip : '')
</script>

<button
	class={['ed-icon-btn', `ed-icon-btn-${size}`, { 'ed-icon-btn-fab': fab, 'ed-icon-btn-active': active }, className]}
	{type}
	aria-label={count ? s.iconButton.withCount(label, count) : label}
	aria-pressed={pressed}
	{@attach attachTooltip(() => tip)}
	{...rest}
>
	<Icon name={icon} size={fab ? 'lg' : 'md'} />
	{#if count}<span class="ed-icon-btn-count" aria-hidden="true">{count}</span>{/if}
</button>

<style>
	.ed-icon-btn {
		width: var(--ed-control);
		height: var(--ed-control);
		margin: 0;
		padding: 0;
		border: 0;
		border-radius: var(--radius-full);
		background: transparent;
		color: var(--text-secondary);
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex: none;
		position: relative;
		isolation: isolate;
		box-sizing: border-box;
		transition:
			background-color var(--ed-duration-micro) var(--ed-ease-out),
			color var(--ed-duration-micro) var(--ed-ease-out),
			transform var(--ed-duration-micro) var(--ed-ease-out),
			box-shadow var(--ed-duration-micro) var(--ed-ease-out);
	}
	.ed-icon-btn-sm {
		width: calc(var(--control-height) - var(--space-1));
		height: calc(var(--control-height) - var(--space-1));
	}
	/* Hover steps onto surface-2; the pressed look, a real toggle and the press itself onto surface-3 */
	.ed-icon-btn:not(:disabled):hover {
		background: var(--surface-2);
		color: var(--text-primary);
	}
	.ed-icon-btn-active,
	.ed-icon-btn[aria-pressed='true'],
	.ed-icon-btn:not(:disabled):active {
		background: var(--surface-3);
		color: var(--text-primary);
	}
	.ed-icon-btn:focus-visible {
		outline: 2px solid transparent;
		box-shadow: var(--focus-ring);
	}
	.ed-icon-btn:disabled {
		opacity: 0.5;
		cursor: default;
	}

	/* The floating +: a fill, so it hovers by the ink wash */
	.ed-icon-btn-fab {
		width: var(--fab);
		height: var(--fab);
		border-radius: var(--radius-full);
		background: var(--brand-primary);
		color: var(--on-brand);
		box-shadow: var(--shadow-sheet);
	}
	.ed-icon-btn-fab::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background: var(--ed-hover-ink);
		opacity: 0;
		transition: opacity var(--ed-duration-micro) var(--ed-ease-out);
		pointer-events: none;
		z-index: -1;
	}
	.ed-icon-btn-fab:not(:disabled):hover,
	.ed-icon-btn-fab:not(:disabled):active {
		background: var(--brand-primary);
		color: var(--on-brand);
	}
	.ed-icon-btn-fab:not(:disabled):hover::after {
		opacity: 0.08;
	}
	.ed-icon-btn-fab:not(:disabled):active::after {
		opacity: 0.14;
	}
	.ed-icon-btn-fab:not(:disabled):active {
		transform: translateY(var(--ed-press-y)) scale(var(--ed-press-scale));
		box-shadow: var(--ed-press-shadow);
	}
	.ed-icon-btn-fab:focus-visible {
		box-shadow: var(--focus-ring);
	}

	/* A circle for one digit that widens into a pill; anchored to the icon box's corner whatever the control size */
	.ed-icon-btn-count {
		position: absolute;
		top: calc(50% - var(--icon-md) / 2 - (var(--space-1) + 2px));
		right: calc(50% - var(--icon-md) / 2 - (var(--space-1) + 2px));
		box-sizing: border-box;
		min-width: var(--space-4);
		height: var(--space-4);
		padding: 0 var(--space-1);
		border-radius: var(--radius-full);
		background: var(--brand-primary);
		color: var(--on-brand);
		font: var(--ed-t-caption);
		font-family: var(--ed-font-mono);
		line-height: var(--space-4);
		text-align: center;
		font-variant-numeric: tabular-nums;
	}
</style>
