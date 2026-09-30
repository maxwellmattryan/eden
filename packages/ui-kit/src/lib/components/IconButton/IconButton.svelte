<script lang="ts">
	// A bare icon control with a required accessible name. `count` adds the bell's badge, a circle on the icon's
	// top-right corner that widens into a pill only when the number needs it, and folds the number into the name.
	// `fill` makes it a filled circle at its size, on the accent or on the Gardener's green: the composer's send button.
	// `fab` is the floating + on mobile: a brand fill --fab wide. A fill hovers by the ink wash like any fill and
	// presses like one under the raised relief. Hover and pressed grounds are circles, never rounded boxes. `tooltip`
	// shows the label (or another string) on hover and keyboard focus, for a glyph that may not explain itself; with no
	// `onclick` of its own (an info glyph) a click or tap toggles it too, so the pointer cursor never promises nothing.
	import type { HTMLButtonAttributes } from 'svelte/elements'
	import type { IconName } from '../../icons/icons.js'
	import Icon from '../../icons/Icon.svelte'
	import { useStrings } from '../../i18n/context.js'
	import { tooltip as attachTooltip } from '../Tooltip/tooltip.js'

	type Props = Omit<HTMLButtonAttributes, 'aria-label' | 'aria-pressed'> & {
		/** The glyph. */
		icon: IconName
		/** The accessible name; required, because the glyph alone says nothing. */
		label: string
		/** The bell's unread count: a badge on the icon's corner, read as part of the name. */
		count?: number
		/** A filled circle at its size: brand is the accent, ai the Gardener's green (D-40). */
		fill?: 'brand' | 'ai'
		/** The floating + on mobile: a brand fill, --fab wide. */
		fab?: boolean
		/** md is the platform control (32 desktop, 44 mobile); sm is the 28 px variant for rows and the status bar; xs is a hint beside a label, no taller than its line. */
		size?: 'xs' | 'sm' | 'md'
		/** The pressed look while the popover it opened is showing; pass `aria-expanded` alongside it. */
		active?: boolean
		/** A real toggle: its state, exposed as aria-pressed. Leave undefined for a plain button. */
		pressed?: boolean
		/** button unless the button submits a form. */
		type?: 'button' | 'submit' | 'reset'
		/**
		 * A tooltip on hover and keyboard focus: true shows the label, a string shows that string. Without `onclick`, a
		 * click or tap toggles it.
		 */
		tooltip?: boolean | string
	}
	let {
		icon,
		label,
		count = 0,
		fill,
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
	const filled = $derived(fab ? 'brand' : fill)
</script>

<button
	class={[
		'ed-icon-btn',
		`ed-icon-btn-${size}`,
		filled && `ed-icon-btn-fill ed-icon-btn-fill-${filled}`,
		{ 'ed-icon-btn-fab': fab, 'ed-icon-btn-active': active },
		className,
	]}
	{type}
	aria-label={count ? s.iconButton.withCount(label, count) : label}
	aria-pressed={pressed}
	{@attach attachTooltip(() => tip, { toggle: !rest.onclick && type === 'button' })}
	{...rest}
>
	<Icon name={icon} size={fab ? 'lg' : size === 'xs' ? 'sm' : 'md'} />
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
	/* xs sits in a line of small text, a hint beside a label: no taller than the line, its glyph a little under the
	   small icon so it reads as a mark on the label and not a control of its own weight */
	.ed-icon-btn-xs {
		width: calc(var(--icon-sm) + var(--space-1));
		height: calc(var(--icon-sm) + var(--space-1));
	}
	.ed-icon-btn-xs :global(svg) {
		width: calc(var(--icon-sm) - 2px);
		height: calc(var(--icon-sm) - 2px);
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
	/* The press (D-49): compress from the top, bottom edge fixed */
	.ed-icon-btn:not(:disabled):active {
		transform: scale(1, var(--ed-press-scale));
		transform-origin: 50% 100%;
	}
	.ed-icon-btn:focus-visible {
		outline: 2px solid transparent;
		box-shadow: var(--focus-ring);
	}
	.ed-icon-btn:disabled {
		opacity: 0.5;
		cursor: default;
	}

	/* A fill: the accent or the Gardener's green under the glyph, hovered and pressed by the ink wash (never a step onto
	   a surface), pressed under the raised relief like a filled button; the fab is the brand fill at --fab */
	.ed-icon-btn-fill {
		background-image: linear-gradient(to bottom, rgba(255, 255, 255, var(--ed-fill-sheen)), rgba(255, 255, 255, 0));
		box-shadow:
			inset 0 1px 0 var(--ed-fill-highlight),
			var(--ed-fill-shadow);
	}
	.ed-icon-btn-fill-brand,
	.ed-icon-btn-fill-brand:not(:disabled):hover,
	.ed-icon-btn-fill-brand:not(:disabled):active {
		background: var(--brand-primary);
		color: var(--on-brand);
	}
	.ed-icon-btn-fill-ai,
	.ed-icon-btn-fill-ai:not(:disabled):hover,
	.ed-icon-btn-fill-ai:not(:disabled):active {
		background: var(--ai);
		color: var(--on-ai);
	}
	.ed-icon-btn-fab {
		width: var(--fab);
		height: var(--fab);
		box-shadow: var(--shadow-sheet);
	}
	.ed-icon-btn-fill::after {
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
	.ed-icon-btn-fill:not(:disabled):hover::after {
		opacity: 0.08;
	}
	.ed-icon-btn-fill:not(:disabled):active::after {
		opacity: 0.14;
	}
	.ed-icon-btn-fill:not(:disabled):active {
		box-shadow: var(--ed-press-shadow);
	}
	.ed-icon-btn-fill:focus-visible {
		box-shadow: var(--focus-ring);
	}
	.ed-icon-btn-fill:disabled::after {
		display: none;
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
