<script module lang="ts">
	/** One registry id in a request: what the Gardener reads, or a T2 id kept out until the owner allows it. */
	export interface CanSeeItem {
		/** A registry id: kebab-case, no domain prefix. */
		id: string
		/** The name the owner knows the id by; the id is shown beside it in mono. */
		label?: string
		/** The row count in the context pack, or the app's own rendering of it; absent for a locked item. */
		count?: number | string
	}
</script>

<script lang="ts">
	// The "can see" chip above the composer (product/substrate/ai.md): one green chip with the row total that opens a
	// DetailPopover saying, literally, what the Gardener can see in this request. Green because the Gardener is saying
	// what it reads (D-40). Inside: one row per id with rows to read, each opening to the exact rows (the consumer's
	// `expanded` snippet) or, at the least, to a sentence saying how many are in the request, one at a time; the ids
	// with nothing to read behind a quiet toggle; what was trimmed to fit; then the T2 ids kept out, each with an Allow
	// when the app can ask for the grant; and the audit log one quiet button away in the footer.
	import type { Snippet } from 'svelte'
	import type { HTMLAttributes } from 'svelte/elements'
	import Icon from '../../icons/Icon.svelte'
	import { useStrings } from '../../i18n/context.js'
	import Button from '../Button/Button.svelte'
	import Chip from '../Chip/Chip.svelte'
	import DetailPopover from '../DetailPopover/DetailPopover.svelte'
	import DetailSection from '../DetailPopover/DetailSection.svelte'

	type Props = HTMLAttributes<HTMLElement> & {
		/** The registry ids in the context pack, with counts. */
		items: CanSeeItem[]
		/** T2 ids excluded from this request. */
		locked?: CanSeeItem[]
		/** The ids whose rows were cut to fit the pack. */
		trimmed?: string[]
		/** Called with the item when its row opens. */
		onexpand?: (item: CanSeeItem) => void
		/** Given, each locked row ends in an Allow button asking for the grant; called with the id. */
		onunlock?: (id: string) => void
		/** Called by the footer's "Open the audit log" button, which renders only when this is given. */
		onaudit?: () => void
		/** Fills an open row's region with the rows themselves; without it, one sentence says how many there are. */
		expanded?: Snippet<[CanSeeItem]>
	}
	let {
		items,
		locked = [],
		trimmed = [],
		onexpand,
		onunlock,
		onaudit,
		expanded,
		class: className = '',
		...rest
	}: Props = $props()

	const s = useStrings()
	const uid = $props.id()
	const regionId = `${uid}-region`
	const rowId = (id: string) => `${uid}-${id}`
	const nameId = (id: string) => `${uid}-${id}-name`

	let open = $state(false)
	let anchor = $state<HTMLElement>()
	let openId = $state<string>()
	let emptyOpen = $state(false)

	// The chip's count: a count the app rendered as a string counts as no rows.
	const rowTotal = $derived(items.reduce((sum, item) => sum + (typeof item.count === 'number' ? item.count : 0), 0))
	const summary = $derived(
		s.gardener.canSeeSummary(rowTotal, items.length) +
			(locked.length ? ` · ${s.gardener.notShared(locked.length)}` : '')
	)
	const readable = $derived(items.filter((item) => item.count !== 0))
	const empty = $derived(items.filter((item) => item.count === 0))

	function toggle(item: CanSeeItem) {
		if (openId === item.id) {
			openId = undefined
			return
		}
		openId = item.id
		onexpand?.(item)
	}

	/** Each opening starts folded: no row open, the empty ids behind their toggle. */
	function closed() {
		openId = undefined
		emptyOpen = false
	}
</script>

{#snippet auditFooter()}
	<Button variant="quiet" size="md" label={s.gardener.openAuditLog} onclick={() => onaudit?.()} />
{/snippet}

<div class={['ed-cansee', className]} {...rest}>
	<span class="ed-cansee-anchor" bind:this={anchor}>
		<Chip
			tone="ai"
			icon="eye"
			label={s.gardener.canSee}
			count={rowTotal}
			aria-haspopup="dialog"
			aria-expanded={open}
			onclick={() => (open = !open)}
		/>
	</span>
	<DetailPopover
		bind:open
		{anchor}
		tone="ai"
		icon="eye"
		title={s.gardener.canSeeTitle}
		subtitle={summary}
		side="top"
		width="md"
		footer={onaudit ? auditFooter : undefined}
		onclose={closed}
	>
		<DetailSection label={s.gardener.inThisRequest}>
			<div class="ed-cansee-list">
				{#each readable as item (item.id)}
					<button
						type="button"
						class="ed-cansee-row"
						id={rowId(item.id)}
						aria-expanded={openId === item.id}
						aria-controls={openId === item.id ? regionId : undefined}
						onclick={() => toggle(item)}
					>
						<span class="ed-cansee-name">{item.label ?? item.id}</span>
						{#if item.label}<span class="ed-cansee-id">{item.id}</span>{/if}
						{#if item.count !== undefined}<span class="ed-cansee-count">{item.count}</span>{/if}
					</button>
					{#if openId === item.id}
						<div class="ed-cansee-region" role="region" id={regionId} aria-labelledby={rowId(item.id)}>
							{#if expanded}
								{@render expanded(item)}
							{:else}
								<p class="ed-cansee-sentence">{s.gardener.inContext(item.count ?? 0, item.id)}</p>
							{/if}
						</div>
					{/if}
				{/each}
			</div>
			{#if empty.length}
				<div class="ed-cansee-empty">
					<Button
						variant="quiet"
						size="md"
						label={s.gardener.nothingToRead(empty.length)}
						iconRight={emptyOpen ? 'chevron-up' : 'chevron-down'}
						aria-expanded={emptyOpen}
						onclick={() => (emptyOpen = !emptyOpen)}
					/>
					{#if emptyOpen}
						<div class="ed-cansee-chips">
							{#each empty as item (item.id)}
								<Chip tone="grey" mono label={item.id} />
							{/each}
						</div>
					{/if}
				</div>
			{/if}
			{#if trimmed.length}
				<p class="ed-cansee-trimmed">{s.gardener.trimmed(trimmed.join(', '))}</p>
			{/if}
		</DetailSection>
		{#if locked.length}
			<DetailSection label={s.gardener.notSharedLabel}>
				<p class="ed-cansee-explain">{s.gardener.notSharedExplain}</p>
				<div class="ed-cansee-list">
					{#each locked as item (item.id)}
						<div class="ed-cansee-locked">
							<Icon name="lock" size="sm" class="ed-cansee-lock" />
							<span class="ed-cansee-name" id={nameId(item.id)}>{item.label ?? item.id}</span>
							{#if item.label}<span class="ed-cansee-id">{item.id}</span>{/if}
							{#if onunlock}
								<Button
									class="ed-cansee-allow"
									variant="quiet"
									size="md"
									label={s.gardener.allow}
									aria-describedby={nameId(item.id)}
									onclick={() => onunlock(item.id)}
								/>
							{:else}
								<span class="ed-sr-only">{s.gardener.locked(item.id)}</span>
							{/if}
						</div>
					{/each}
				</div>
			</DetailSection>
		{/if}
	</DetailPopover>
</div>

<style>
	.ed-cansee {
		display: inline-flex;
		align-items: center;
	}
	.ed-cansee-anchor {
		display: inline-flex;
	}

	.ed-cansee-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}
	/* A row is a button the width of the section; its ground bleeds past the text by its padding, so the name lines
	   up with the caption above */
	.ed-cansee-row {
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
	.ed-cansee-row:hover,
	.ed-cansee-row[aria-expanded='true'] {
		background: var(--surface-2);
	}
	.ed-cansee-row:focus-visible {
		outline: 2px solid transparent;
		box-shadow: var(--focus-ring);
	}
	.ed-cansee-name {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.ed-cansee-id {
		flex: 0 1 auto;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font: var(--ed-t-data-sm);
		letter-spacing: var(--ed-t-data-sm-tracking);
		font-variation-settings: var(--ed-t-data-sm-opsz);
		color: var(--text-secondary);
	}
	.ed-cansee-count {
		margin-left: auto;
		flex: none;
		font: var(--ed-t-data-sm);
		letter-spacing: var(--ed-t-data-sm-tracking);
		font-variation-settings: var(--ed-t-data-sm-opsz);
		font-variant-numeric: tabular-nums;
	}

	/* The open row's region: a well one step down, with the rows or the one sentence */
	.ed-cansee-region {
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		font-variation-settings: var(--ed-t-body-sm-opsz);
		color: var(--text-secondary);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--ed-radius-control);
		border: 1px solid var(--ed-card-border);
		background: var(--surface-0);
	}
	.ed-cansee-sentence {
		margin: 0;
	}

	.ed-cansee-empty {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		align-items: flex-start;
	}
	/* the quiet button's label lines up with the rows */
	.ed-cansee-empty :global(.ed-btn) {
		margin-left: calc(-1 * var(--ed-btn-pad));
	}
	.ed-cansee-chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}
	.ed-cansee-trimmed,
	.ed-cansee-explain {
		margin: 0;
		color: var(--text-secondary);
	}
	.ed-cansee-trimmed {
		font: var(--ed-t-caption);
		letter-spacing: var(--ed-t-caption-tracking);
		font-variation-settings: var(--ed-t-caption-opsz);
	}
	.ed-cansee-explain {
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		font-variation-settings: var(--ed-t-body-sm-opsz);
	}

	.ed-cansee-locked {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: var(--control-height);
		min-width: 0;
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		font-variation-settings: var(--ed-t-body-sm-opsz);
		color: var(--text-primary);
	}
	.ed-cansee-locked :global(.ed-cansee-lock) {
		color: var(--text-secondary);
	}
	.ed-cansee-locked :global(.ed-cansee-allow) {
		margin-left: auto;
	}
</style>
