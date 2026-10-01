<script module lang="ts">
	import type { ReadItem } from '../ReadList/ReadList.svelte'
	/** One registry id in a request: what the Gardener reads, or a T2 id kept out until the owner allows it. */
	export type CanSeeItem = ReadItem
</script>

<script lang="ts">
	// The "can see" button in the composer's foot (product/substrate/ai.md): an eye IconButton, beside the paperclip
	// and like it, that opens a DetailPopover saying, literally, what the Gardener can see in this request. The
	// popover is green because the Gardener is saying what it reads (D-40); its caption carries the count. Inside: the
	// ReadList (one row per id with rows to read, each opening to the exact rows or to a sentence; what was trimmed);
	// then the T2 ids kept out, each with an Allow when the app can ask for the grant; and the audit log one quiet
	// button away.
	import type { Snippet } from 'svelte'
	import type { HTMLAttributes } from 'svelte/elements'
	import Icon from '../../icons/Icon.svelte'
	import { useStrings } from '../../i18n/context.js'
	import Button from '../Button/Button.svelte'
	import DetailPopover from '../DetailPopover/DetailPopover.svelte'
	import DetailSection from '../DetailPopover/DetailSection.svelte'
	import IconButton from '../IconButton/IconButton.svelte'
	import ReadList from '../ReadList/ReadList.svelte'

	type Props = HTMLAttributes<HTMLElement> & {
		/** The registry ids in the context pack, with counts. */
		items: CanSeeItem[]
		/** T2 ids excluded from this request. */
		locked?: CanSeeItem[]
		/** The ids whose rows were cut to fit the pack. */
		trimmed?: string[]
		/** The button's size; sm sits beside the composer's paperclip. */
		size?: 'xs' | 'sm' | 'md'
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
		size = 'sm',
		onexpand,
		onunlock,
		onaudit,
		expanded,
		class: className = '',
		...rest
	}: Props = $props()

	const s = useStrings()
	const uid = $props.id()
	const nameId = (id: string) => `${uid}-${id}-name`

	let open = $state(false)
	let anchor = $state<HTMLElement>()
	// bumped as the popover closes, so the list opens folded next time
	let generation = $state(0)

	// The caption's count: a count the app rendered as a string counts as no rows.
	const rowTotal = $derived(items.reduce((sum, item) => sum + (typeof item.count === 'number' ? item.count : 0), 0))
	// the types counted are the ones the list shows: an id with nothing to read is not in the request
	const types = $derived(items.filter((item) => item.count !== 0).length)
	const summary = $derived(
		s.gardener.canSeeSummary(rowTotal, types) + (locked.length ? ` · ${s.gardener.notShared(locked.length)}` : '')
	)
</script>

{#snippet auditFooter()}
	<Button variant="quiet" size="md" label={s.gardener.openAuditLog} onclick={() => onaudit?.()} />
{/snippet}

<div class={['ed-cansee', className]} {...rest}>
	<span class="ed-cansee-anchor" bind:this={anchor}>
		<IconButton
			icon="eye"
			{size}
			label={s.gardener.canSee}
			active={open}
			tooltip
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
		onclose={() => generation++}
	>
		<DetailSection label={s.gardener.inThisRequest}>
			{#key generation}
				<ReadList {items} {trimmed} {onexpand} {expanded} />
			{/key}
		</DetailSection>
		{#if locked.length}
			<DetailSection label={s.gardener.notSharedLabel} hint={s.gardener.notSharedExplain}>
				<div class="ed-cansee-list">
					{#each locked as item (item.id)}
						<div class="ed-cansee-locked">
							<Icon name="lock" size="sm" class="ed-cansee-lock" />
							<span class="ed-cansee-name" id={nameId(item.id)}>{item.label ?? item.id}</span>
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
	.ed-cansee-name {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.ed-cansee-locked :global(.ed-cansee-lock) {
		color: var(--text-secondary);
	}
	.ed-cansee-locked :global(.ed-cansee-allow) {
		margin-left: auto;
	}
</style>
