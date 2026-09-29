<script module lang="ts">
	/** One registry id the request reads, with how many of its rows are in the context pack. */
	export interface CanSeeItem {
		/** A registry id: kebab-case, no domain prefix. */
		id: string
		/** The row count, or the app's own rendering of it. */
		count: number | string
	}
</script>

<script lang="ts">
	// The "can see" row above the composer (product/substrate/ai.md): one green chip per registry id the request
	// reads, with its row count, and a grey locked chip for each T2 id kept out of this request. It is the privacy
	// story made literal, never a summary: a chip opens to the exact rows (the consumer's `expanded` snippet) or, at
	// the least, to a sentence saying how many are in the request. One chip is open at a time. Green because the
	// Gardener is saying what it can see (D-40); the audit log is one quiet button away.
	import type { Snippet } from 'svelte'
	import type { HTMLAttributes } from 'svelte/elements'
	import { useStrings } from '../../i18n/context.js'
	import Button from '../Button/Button.svelte'
	import Chip from '../Chip/Chip.svelte'

	type Props = HTMLAttributes<HTMLElement> & {
		/** The registry ids in the context pack, with counts. */
		items: CanSeeItem[]
		/** T2 ids excluded from this request: grey, with a lock. */
		locked?: string[]
		/** Called with the item when its chip opens. */
		onexpand?: (item: CanSeeItem) => void
		/** Called by the trailing "Open the audit log" button, which renders only when this is given. */
		onaudit?: () => void
		/** Fills an open chip's region with the rows themselves; without it, one sentence says how many there are. */
		expanded?: Snippet<[CanSeeItem]>
	}
	let { items, locked = [], onexpand, onaudit, expanded, class: className = '', ...rest }: Props = $props()

	const s = useStrings()
	const uid = $props.id()
	const labelId = `${uid}-label`
	const regionId = `${uid}-region`
	const chipId = (id: string) => `${uid}-${id}`

	let openId = $state<string>()
	const openItem = $derived(items.find((item) => item.id === openId))

	function toggle(item: CanSeeItem) {
		if (openId === item.id) {
			openId = undefined
			return
		}
		openId = item.id
		onexpand?.(item)
	}
</script>

<div class={['ed-cansee', className]} role="group" aria-labelledby={labelId} {...rest}>
	<div class="ed-cansee-row">
		<span class="ed-cansee-label" id={labelId}>{s.gardener.canSee}</span>
		{#each items as item (item.id)}
			<Chip
				id={chipId(item.id)}
				class="ed-cansee-chip"
				tone="ai"
				mono
				label={item.id}
				count={item.count}
				aria-label={s.gardener.contextRows(item.count, item.id)}
				aria-expanded={openId === item.id}
				aria-controls={openId === item.id ? regionId : undefined}
				onclick={() => toggle(item)}
			/>
		{/each}
		{#each locked as id (id)}
			<!-- the chip is the picture; the sentence beside it is what a screen reader gets, lock included -->
			<span class="ed-cansee-locked">
				<Chip tone="grey" mono icon="lock" label={id} aria-hidden="true" />
				<span class="ed-sr-only">{s.gardener.locked(id)}</span>
			</span>
		{/each}
		{#if onaudit}
			<Button class="ed-cansee-audit" variant="quiet" label={s.gardener.openAuditLog} onclick={() => onaudit?.()} />
		{/if}
	</div>
	{#if openItem}
		<div class="ed-cansee-region" role="region" id={regionId} aria-labelledby={chipId(openItem.id)}>
			{#if expanded}
				{@render expanded(openItem)}
			{:else}
				<p class="ed-cansee-sentence">{s.gardener.inContext(openItem.count, openItem.id)}</p>
			{/if}
		</div>
	{/if}
</div>

<style>
	.ed-cansee {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.ed-cansee-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-2);
	}
	.ed-cansee-label {
		font: var(--ed-t-label);
		letter-spacing: var(--ed-t-label-tracking);
		color: var(--ai);
	}
	.ed-cansee-locked {
		display: inline-flex;
	}
	/* The open chip shows its state by a firmer edge in its own colour, not by a new hue */
	.ed-cansee :global(.ed-cansee-chip[aria-expanded='true']) {
		border-color: color-mix(in srgb, var(--ai) 40%, transparent);
	}
	.ed-cansee :global(.ed-cansee-audit) {
		margin-left: auto;
	}
	.ed-cansee-region {
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		color: var(--text-secondary);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--ed-radius-control);
		border: 1px solid var(--ed-card-border);
		background: var(--surface-1);
	}
	.ed-cansee-sentence {
		margin: 0;
	}
</style>
