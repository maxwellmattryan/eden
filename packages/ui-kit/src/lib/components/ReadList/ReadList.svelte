<script module lang="ts">
	/** One registry id the Gardener read, or could have: its rows in the pack, or none. */
	export interface ReadItem {
		/** A registry id: kebab-case, no domain prefix. */
		id: string
		/** The name the owner knows the id by, shown instead of the id. */
		label?: string
		/** The row count in the context pack, or the app's own rendering of it; absent for a locked item. */
		count?: number | string
	}
</script>

<script lang="ts">
	// What the Gardener read, literally (product/substrate/ai.md): one row per registry id with rows to read, each
	// opening to the rows themselves (the consumer's `expanded` snippet) or, at the least, to a sentence saying how
	// many are in the request, one at a time; what was trimmed to fit in a caption. An id with nothing to read is not
	// listed: what is absent was not read. The "can see" chip's popover and the audit log's entry show the same list.
	// It starts folded; a consumer that wants it folded again (a popover reopening) keys it.
	import type { Snippet } from 'svelte'
	import type { HTMLAttributes } from 'svelte/elements'
	import { useStrings } from '../../i18n/context.js'

	type Props = HTMLAttributes<HTMLDivElement> & {
		/** The registry ids read, with counts; one with a count of 0 is left out. */
		items: ReadItem[]
		/** The ids whose rows were cut to fit the pack. */
		trimmed?: string[]
		/** Called with the item when its row opens. */
		onexpand?: (item: ReadItem) => void
		/** Fills an open row's region with the rows themselves; without it, one sentence says how many there are. */
		expanded?: Snippet<[ReadItem]>
	}
	let { items, trimmed = [], onexpand, expanded, class: className = '', ...rest }: Props = $props()

	const s = useStrings()
	const uid = $props.id()
	const regionId = `${uid}-region`
	const rowId = (id: string) => `${uid}-${id}`

	let openId = $state<string>()

	const readable = $derived(items.filter((item) => item.count !== 0))

	function toggle(item: ReadItem) {
		if (openId === item.id) {
			openId = undefined
			return
		}
		openId = item.id
		onexpand?.(item)
	}
</script>

<div class={['ed-readlist', className]} {...rest}>
	{#if readable.length}
		<div class="ed-readlist-rows">
			{#each readable as item (item.id)}
				<button
					type="button"
					class="ed-readlist-row"
					id={rowId(item.id)}
					aria-expanded={openId === item.id}
					aria-controls={openId === item.id ? regionId : undefined}
					onclick={() => toggle(item)}
				>
					<span class="ed-readlist-name">{item.label ?? item.id}</span>
					{#if item.count !== undefined}<span class="ed-readlist-count">{item.count}</span>{/if}
				</button>
				{#if openId === item.id}
					<div class="ed-readlist-region" role="region" id={regionId} aria-labelledby={rowId(item.id)}>
						{#if expanded}
							{@render expanded(item)}
						{:else}
							<p class="ed-readlist-sentence">{s.gardener.inContext(item.count ?? 0, item.label ?? item.id)}</p>
						{/if}
					</div>
				{/if}
			{/each}
		</div>
	{/if}
	{#if trimmed.length}
		<p class="ed-readlist-trimmed">{s.gardener.trimmed(trimmed.join(', '))}</p>
	{/if}
</div>

<style>
	.ed-readlist {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	.ed-readlist-rows {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}
	/* A row is a button the width of the section; its ground bleeds past the text by its padding, so the name lines
	   up with the caption above */
	.ed-readlist-row {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		width: calc(100% + 2 * var(--space-2));
		margin: 0 calc(-1 * var(--space-2));
		padding: var(--space-1) var(--space-2);
		border: 0;
		border-radius: var(--ed-radius-control);
		background: transparent;
		color: var(--text-primary);
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		font-variation-settings: var(--ed-t-body-sm-opsz);
		text-align: start;
		cursor: pointer;
		box-sizing: border-box;
		transition: background-color var(--ed-duration-micro) var(--ed-ease-out);
	}
	.ed-readlist-row:hover,
	.ed-readlist-row[aria-expanded='true'] {
		background: var(--surface-2);
	}
	.ed-readlist-row:focus-visible {
		outline: 2px solid transparent;
		box-shadow: var(--focus-ring);
	}
	.ed-readlist-name {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.ed-readlist-count {
		margin-left: auto;
		flex: none;
		font: var(--ed-t-data-sm);
		letter-spacing: var(--ed-t-data-sm-tracking);
		font-variation-settings: var(--ed-t-data-sm-opsz);
		font-variant-numeric: tabular-nums;
	}

	/* The open row's region: a well one step down, with the rows or the one sentence; long lists scroll inside it */
	.ed-readlist-region {
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		font-variation-settings: var(--ed-t-body-sm-opsz);
		color: var(--text-secondary);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--ed-radius-control);
		border: 1px solid var(--ed-card-border);
		background: var(--surface-0);
		max-height: calc(var(--space-8) * 5);
		overflow: auto;
	}
	.ed-readlist-sentence {
		margin: 0;
	}

	.ed-readlist-trimmed {
		margin: 0;
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		font-variation-settings: var(--ed-t-caption-opsz);
		color: var(--text-secondary);
	}
</style>
