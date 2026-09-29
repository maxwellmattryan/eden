<script module lang="ts">
	export type ProposalState = 'pending' | 'accepted' | 'dismissed'
</script>

<script lang="ts">
	// A fact the Gardener infers, in green: it is speaking, asking whether it read you right (D-40). Nothing is stored
	// before Accept, which saves the fact as user-confirmed (your word beats inference); Dismiss leaves no trace. After
	// the choice the card says which happened, and an accepted fact settles with the Breeze (D-42).
	import type { HTMLAttributes } from 'svelte/elements'
	import { useStrings } from '../../i18n/context.js'
	import Badge from '../Badge/Badge.svelte'
	import Button from '../Button/Button.svelte'
	import ToolChrome from '../ToolCard/ToolChrome.svelte'

	type Props = HTMLAttributes<HTMLDivElement> & {
		/** The fact type, a registry id ("disliked-ingredient"). */
		fact: string
		/** The inferred value. */
		value: string
		/** The Gardener's sentence, when it has one ("I noticed you avoid cilantro. Save as a dislike?"). */
		text?: string
		/** Called when the owner accepts; the app stores the fact as user-confirmed. */
		onaccept?: () => void
		/** Called when the owner dismisses; nothing is stored. */
		ondismiss?: () => void
		/** pending, accepted or dismissed (bindable); the buttons set it. */
		state?: ProposalState
	}
	let {
		fact,
		value,
		text,
		onaccept,
		ondismiss,
		state = $bindable('pending'),
		class: className = '',
		...rest
	}: Props = $props()

	const s = useStrings()
	const result = $derived(
		state === 'accepted' ? s.gardener.savedToProfile : state === 'dismissed' ? s.gardener.dismissedNotStored : undefined
	)

	function decide(next: ProposalState) {
		state = next
		if (next === 'accepted') onaccept?.()
		else ondismiss?.()
	}
</script>

{#snippet choices()}
	<Button variant="ai" icon="check" label={s.gardener.accept} onclick={() => decide('accepted')} />
	<Button variant="quiet" label={s.dismiss} onclick={() => decide('dismissed')} />
{/snippet}

<ToolChrome
	tone="ai"
	icon="sparkles"
	heading={s.gardener.proposedFact}
	done={state === 'accepted'}
	{result}
	actions={choices}
	class={className}
	{...rest}
>
	{#snippet badge()}<Badge kind="ai" label={s.gardener.inferred} />{/snippet}
	{#if text}<p class="ed-proposal-text">{text}</p>{/if}
	<p class="ed-proposal-fact">
		<code class="ed-proposal-id">{fact}</code> <span class="ed-proposal-value">{value}</span>
	</p>
</ToolChrome>

<style>
	.ed-proposal-text,
	.ed-proposal-fact {
		margin: 0;
		font: var(--ed-t-voice);
		letter-spacing: var(--ed-t-voice-tracking);
		font-variation-settings: var(--ed-t-voice-opsz);
		color: var(--text-primary);
		text-wrap: pretty;
	}
	.ed-proposal-fact {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-1) var(--space-2);
	}
	.ed-proposal-id {
		font: var(--ed-t-code);
		letter-spacing: var(--ed-t-code-tracking);
		background: var(--surface-0);
		border-radius: calc(var(--ed-radius-control) / 2);
		padding: 0 calc(var(--space-1) + 2px);
	}
</style>
