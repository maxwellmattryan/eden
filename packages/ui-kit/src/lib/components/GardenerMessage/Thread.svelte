<script lang="ts">
	// The column a conversation lays out in: messages in order with a breath between them, the owner's aligned to the
	// end, the whole no wider than a comfortable measure. It is a log, so a screen reader hears each new message as it
	// arrives without leaving the composer. The thread list and the composer are the app's (engineering/ui-kit.md).
	import type { Snippet } from 'svelte'
	import type { HTMLAttributes } from 'svelte/elements'
	import { useStrings } from '$lib/i18n/context.js'

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'aria-label'> & {
		/** The log's accessible name; "Conversation with the Gardener" by default. */
		label?: string
		/** The messages, in order. */
		children?: Snippet
	}
	let { label, children, class: className = '', ...rest }: Props = $props()

	const s = useStrings()
</script>

<div class={['ed-thread', className]} role="log" aria-label={label ?? s.gardener.thread} {...rest}>
	{@render children?.()}
</div>

<style>
	.ed-thread {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: var(--space-3);
		max-width: calc(var(--sheet-max) * 0.6);
		box-sizing: border-box;
	}
</style>
