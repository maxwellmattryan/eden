<script module lang="ts">
	/** The variants on a solid ground: they carry the fill edge, sheen and highlight, and hover by a deeper wash. */
	const FILLED = new Set(['primary', 'danger', 'ai', 'honey'])
</script>

<script lang="ts">
	// One action; primary at most once per view. Every variant hovers the same way, an ink wash over its own colour
	// (6 % on paper, 8 % on a fill, 14 % on press), never a new hue. The press compresses the button from the top with
	// its bottom edge fixed, as if it sank into its hole (D-49); a filled button's shadow collapses too. The height follows the platform
	// through --ed-control unless a size is forced, and the label is set in --ed-t-button, which the brand dial owns.
	import type { HTMLButtonAttributes } from 'svelte/elements'
	import type { IconName } from '../../icons/icons.js'
	import Icon from '../../icons/Icon.svelte'

	/** A button either shows a label or, when it is icon-only, names itself through `aria-label`. */
	type Named =
		| {
				/** Sentence-case verb; on a confirm it repeats the verb of the action. */
				label: string
				'aria-label'?: string
		  }
		| {
				label?: undefined
				/** The accessible name of an icon-only button. */
				'aria-label': string
		  }

	type Props = Omit<HTMLButtonAttributes, 'aria-label'> &
		Named & {
			/** primary once per view; danger for every destructive action (D-96); ai and honey only on the Gardener's surfaces. */
			variant?: 'primary' | 'secondary' | 'quiet' | 'danger' | 'ai' | 'honey'
			/** auto follows the platform (--ed-control); md forces the 32 px control, lg the 44 px touch target. */
			size?: 'md' | 'lg' | 'auto'
			/** A leading glyph. Every button of a group carries one, or none does (D-96). */
			icon?: IconName
			/** A trailing glyph, for an action that leaves the app. */
			iconRight?: IconName
			/** Halves the opacity and ignores the pointer. */
			disabled?: boolean
			/** button unless the button submits a form. */
			type?: 'button' | 'submit' | 'reset'
		}
	let {
		label,
		variant = 'secondary',
		size = 'auto',
		icon,
		iconRight,
		disabled = false,
		type = 'button',
		class: className = '',
		...rest
	}: Props = $props()

	const filled = $derived(FILLED.has(variant))
</script>

<button
	class={[
		'ed-btn',
		`ed-btn-${variant}`,
		`ed-btn-${size}`,
		{ 'ed-btn-filled': filled, 'ed-btn-icon-only': !label },
		className,
	]}
	{type}
	{disabled}
	{...rest}
>
	{#if icon}<Icon name={icon} size="sm" />{/if}
	{#if label}<span class="ed-btn-label">{label}</span>{/if}
	{#if iconRight}<Icon name={iconRight} size="sm" />{/if}
</button>

<style>
	.ed-btn {
		font: var(--ed-t-button);
		letter-spacing: var(--ed-t-button-tracking);
		font-variation-settings: var(--ed-t-button-opsz);
		height: var(--ed-control);
		margin: 0;
		padding: 0 var(--ed-btn-pad);
		border-radius: var(--ed-radius-control);
		border: 1px solid var(--ed-secondary-border);
		background: var(--ed-secondary-bg);
		color: var(--text-primary);
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: calc(var(--space-1) + 2px);
		white-space: nowrap;
		position: relative;
		isolation: isolate;
		box-sizing: border-box;
		transition:
			background-color var(--ed-duration-micro) var(--ed-ease-out),
			color var(--ed-duration-micro) var(--ed-ease-out),
			border-color var(--ed-duration-micro) var(--ed-ease-out),
			transform var(--ed-duration-micro) var(--ed-ease-out),
			box-shadow var(--ed-duration-micro) var(--ed-ease-out);
	}
	.ed-btn-md {
		height: var(--control-height);
	}
	.ed-btn-lg {
		height: var(--touch-target);
		padding: 0 var(--space-4);
	}
	.ed-btn-icon-only {
		padding: 0;
		aspect-ratio: 1;
	}

	/* The ink wash: one overlay under the content, over the ground */
	.ed-btn::after {
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
	.ed-btn:not(:disabled):hover {
		border-color: var(--stroke-hover);
	}
	.ed-btn:not(:disabled):hover::after {
		opacity: 0.06;
	}
	.ed-btn:not(:disabled):active::after {
		opacity: 0.14;
	}
	.ed-btn:focus-visible {
		outline: 2px solid transparent;
		outline-offset: 2px;
		box-shadow: var(--focus-ring);
	}

	.ed-btn-quiet {
		background: transparent;
		border-color: transparent;
	}
	.ed-btn-quiet:not(:disabled):hover {
		border-color: transparent;
	}

	/* Filled variants: a 1 px ink edge, a top-lit sheen and an inner highlight, all set by the brand level */
	.ed-btn-filled {
		border-color: var(--ed-fill-edge);
		background-image: linear-gradient(to bottom, rgba(255, 255, 255, var(--ed-fill-sheen)), rgba(255, 255, 255, 0));
		box-shadow:
			inset 0 1px 0 var(--ed-fill-highlight),
			var(--ed-fill-shadow);
	}
	.ed-btn-filled:not(:disabled):hover {
		border-color: var(--ed-fill-edge);
	}
	.ed-btn-filled:not(:disabled):hover::after {
		opacity: 0.08;
	}
	.ed-btn-filled:focus-visible {
		box-shadow: var(--focus-ring);
	}
	/* The press (D-49): every variant compresses from the top, bottom edge fixed; a fill's shadow collapses as well */
	.ed-btn:not(:disabled):active {
		transform: scale(1, var(--ed-press-scale));
		transform-origin: 50% 100%;
	}
	.ed-btn-filled:not(:disabled):active {
		box-shadow:
			inset 0 1px 0 var(--ed-fill-highlight),
			var(--ed-press-shadow);
	}
	.ed-btn-primary {
		background-color: var(--brand-primary);
		color: var(--on-brand);
	}
	.ed-btn-danger {
		background-color: var(--danger);
		color: var(--on-danger);
	}
	.ed-btn-ai {
		background-color: var(--ai);
		color: var(--on-ai);
	}
	.ed-btn-honey {
		background-color: var(--honey);
		color: var(--on-honey);
	}

	.ed-btn:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.ed-btn:disabled::after {
		display: none;
	}
</style>
