<script lang="ts">
	// A run of tool calls as one card: several reads in a row fold into a single title line on the tool chrome, with
	// one status for the lot and a chevron that opens the cards themselves. It is closed until the owner opens it, so
	// a reply that read eight things stays a line tall between what was said before and the answer after. The heading
	// is the app's words (the tool and how many); the cards arrive as children.
	import type { Snippet } from 'svelte'
	import type { HTMLAttributes } from 'svelte/elements'
	import { useStrings } from '../../i18n/context.js'
	import IconButton from '../IconButton/IconButton.svelte'
	import ToolChrome from './ToolChrome.svelte'

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
		/** The title line: what ran and how many times, as the app words it. */
		heading: string
		/** The run as a whole: running while any call is, done once all are, cancelled when the request went away. */
		status?: 'running' | 'done' | 'cancelled'
		/** Bindable. Whether the cards show. */
		open?: boolean
		/** The cards of the run. */
		children?: Snippet
	}
	let {
		heading,
		status = 'running',
		open = $bindable(false),
		children,
		class: className = '',
		...rest
	}: Props = $props()

	const s = useStrings()
	const uid = $props.id()
	const bodyId = `${uid}-cards`
</script>

<ToolChrome tone="honey" icon="shovel" {heading} {status} done={status === 'done'} class={className} {...rest}>
	{#snippet end()}
		<IconButton
			icon={open ? 'chevron-up' : 'chevron-down'}
			size="xs"
			label={open ? s.hide : s.show}
			tooltip
			aria-expanded={open}
			aria-controls={bodyId}
			class="ed-toolrun-fold"
			onclick={() => (open = !open)}
		/>
	{/snippet}
	<div class="ed-toolrun-cards" id={bodyId} hidden={!open}>
		{#if open}{@render children?.()}{/if}
	</div>
</ToolChrome>

<style>
	.ed-toolrun-cards {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	.ed-toolrun-cards[hidden] {
		display: none;
	}
</style>
