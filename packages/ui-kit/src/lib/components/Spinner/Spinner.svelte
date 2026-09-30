<script lang="ts">
	// The one loop a control may show (D-79): the refresh arrows turning clockwise while a tool call runs, the same
	// glyph and turn a busy refresh button shows, so the owner sees the Gardener is still acting. One turn takes the
	// spin duration, which is zero under reduced motion: the arrows then hold still and the spoken name carries the
	// state alone. Never a page's loading state; that is a skeleton.
	import type { HTMLAttributes } from 'svelte/elements'
	import Icon from '../../icons/Icon.svelte'
	import { useStrings } from '../../i18n/context.js'

	type Props = HTMLAttributes<HTMLSpanElement> & {
		/** sm 16, md 20. */
		size?: 'sm' | 'md'
		/** The spoken name; the kit's "Loading" by default. */
		label?: string
	}
	let { size = 'sm', label, class: className = '', ...rest }: Props = $props()

	const s = useStrings()
</script>

<span class={['ed-spinner', className]} role="status" {...rest}>
	<Icon name="refresh-cw" {size} />
	<span class="ed-sr-only">{label ?? s.loading}</span>
</span>

<style>
	.ed-spinner {
		display: inline-flex;
		flex: none;
		color: inherit;
	}
	.ed-spinner :global(.ed-icon) {
		animation: ed-spin var(--ed-duration-spin) linear infinite;
	}
	@keyframes ed-spin {
		to {
			transform: rotate(1turn);
		}
	}
</style>
