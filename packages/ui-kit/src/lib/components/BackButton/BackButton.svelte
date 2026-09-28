<script lang="ts">
	// The quiet back arrow at the top left of content (product/substrate/shell.md): it appears only when the history
	// stack has somewhere to go, and names the previous screen in a tooltip on hover and keyboard focus.
	import type { HTMLButtonAttributes } from 'svelte/elements'
	import Icon from '$lib/icons/Icon.svelte'
	import { useStrings } from '$lib/i18n/context.js'
	import { tooltip } from '../Tooltip/tooltip.js'

	type Props = Omit<HTMLButtonAttributes, 'type' | 'onclick' | 'aria-label'> & {
		/** Goes back. Without it there is nowhere to go, and the button renders nothing. */
		onback?: () => void
		/** The previous screen's name, shown as the tooltip. */
		breadcrumb?: string
		/** The accessible name; "Back" by default. */
		label?: string
	}
	let { onback, breadcrumb, label, class: className = '', ...rest }: Props = $props()
	const s = useStrings()
</script>

{#if onback}
	<button
		type="button"
		class="ed-back {className}"
		aria-label={label ?? s.back}
		onclick={() => onback()}
		{@attach tooltip(() => breadcrumb ?? '')}
		{...rest}
	>
		<Icon name="arrow-left" size="md" />
	</button>
{/if}

<style>
	.ed-back {
		position: relative;
		isolation: isolate;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		box-sizing: border-box;
		width: var(--ed-control);
		height: var(--ed-control);
		padding: 0;
		border: 0;
		border-radius: var(--radius-full);
		background: transparent;
		color: var(--text-secondary);
		cursor: pointer;
		transition:
			color var(--ed-duration-micro) var(--ed-ease-out),
			transform var(--ed-duration-micro) var(--ed-ease-out);
	}
	/* the ink wash: a hover is a tint of the ink, never a new hue; the press compresses from the top (D-49) */
	.ed-back::after {
		content: '';
		position: absolute;
		inset: 0;
		z-index: -1;
		border-radius: inherit;
		background: var(--ed-hover-ink);
		opacity: 0;
		transition: opacity var(--ed-duration-micro) var(--ed-ease-out);
		pointer-events: none;
	}
	.ed-back:hover,
	.ed-back:focus-visible {
		color: var(--text-primary);
	}
	.ed-back:hover::after {
		opacity: 0.06;
	}
	.ed-back:active::after {
		opacity: 0.14;
	}
	.ed-back:active {
		transform: scale(1, var(--ed-press-scale));
		transform-origin: 50% 100%;
	}
	.ed-back:focus-visible {
		outline: 2px solid transparent;
		box-shadow: var(--focus-ring);
	}
</style>
