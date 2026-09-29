<script lang="ts">
	// The chrome every text field shares (Field now, QuickAdd later): a row on surface-2 with a stroke border. Hover
	// firms the border to stroke-hover; focus-within turns that same border into the flush 2 px ring (1 px border plus
	// 1 px box-shadow), so there is only ever one line around a field. Invalid keeps danger for both. The input itself
	// lives in the owning component's markup, which styles it through a scoped descendant rule.
	import type { Snippet } from 'svelte'
	import type { HTMLAttributes } from 'svelte/elements'

	type Props = HTMLAttributes<HTMLDivElement> & {
		/** The Quick Log value height (--field-lg) instead of the control height. */
		large?: boolean
		/** Keeps the border and the ring in danger. */
		invalid?: boolean
		/** The input and whatever sits beside it: an icon, a unit chip, a trailing control. */
		children?: Snippet
	}
	let { large = false, invalid = false, children, class: className = '', ...rest }: Props = $props()
</script>

<div class="ed-input-wrap {className}" class:ed-input-wrap-lg={large} class:ed-input-wrap-invalid={invalid} {...rest}>
	{@render children?.()}
</div>

<style>
	.ed-input-wrap {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		box-sizing: border-box;
		height: var(--ed-control);
		padding: 0 var(--space-2) 0 var(--space-3);
		border: 1px solid var(--stroke);
		border-radius: var(--ed-radius-control);
		background: var(--surface-2);
		color: var(--text-primary);
		transition:
			border-color var(--ed-duration-micro) var(--ed-ease-out),
			box-shadow var(--ed-duration-micro) var(--ed-ease-out);
	}
	.ed-input-wrap:hover {
		border-color: var(--stroke-hover);
	}
	.ed-input-wrap:focus-within {
		border-color: var(--brand-primary);
		box-shadow: 0 0 0 1px var(--brand-primary);
	}
	.ed-input-wrap-invalid,
	.ed-input-wrap-invalid:hover {
		border-color: var(--danger);
	}
	.ed-input-wrap-invalid:focus-within {
		border-color: var(--danger);
		box-shadow: 0 0 0 1px var(--danger);
	}
	.ed-input-wrap-lg {
		height: var(--field-lg);
		padding-left: var(--space-4);
	}
</style>
