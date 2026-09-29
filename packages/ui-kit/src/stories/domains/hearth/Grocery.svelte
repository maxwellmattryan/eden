<script lang="ts">
	// Hearth's Grocery view (product/domains/kitchen.md, "Surfaces"): the same header as Stock with the Grocery tab
	// selected and Add as the primary action, a quick-add line, then the active list grouped by store with its shop-day
	// Event beside the store's name. Every row carries an origin badge (manual, recipe, low stock); a checked row is
	// struck through and stays until Clear checked. On mobile a swipe to the right checks a row off and a swipe to the
	// left deletes it.
	import {
		Chip,
		EmptyState,
		List,
		PageHeader,
		QuickAdd,
		Segmented,
		domainGlyph,
		type ListRowData,
		type MenuItem,
	} from '$lib/index.js'
	import AppFrame from '../_frame/AppFrame.svelte'
	import SwipeList from '../_frame/SwipeList.svelte'
	import { grocery, sidebar } from '../../sample-data.js'

	type Props = {
		/** Every row checked off: the list is done for the trip. */
		allChecked?: boolean
		/** No items on the list. */
		empty?: boolean
		onadd?: (text: string) => void
		onclear?: () => void
		oncheck?: (row: ListRowData) => void
		ondelete?: (row: ListRowData) => void
		onopen?: (row: ListRowData) => void
		onaction?: (item: MenuItem, row: ListRowData) => void
		onnavigate?: (id: string) => void
	}
	let {
		allChecked = false,
		empty = false,
		onadd,
		onclear,
		oncheck,
		ondelete,
		onopen,
		onaction,
		onnavigate,
	}: Props = $props()

	const uid = $props.id()
	const hearth = sidebar.items.find((entry) => entry.id === 'kitchen')!
	const TABS = ['Stock', 'Recipes', 'Grocery', 'Tips']
	const STORE = 'H-E-B'
	const rowActions: MenuItem[] = [
		{ id: 'check', label: 'Check off', icon: 'check' },
		{ id: 'edit', label: 'Edit', icon: 'pencil' },
		{ id: 'delete', label: 'Delete', icon: 'trash', destructive: true },
	]

	const rows = $derived<ListRowData[]>(
		empty
			? []
			: grocery.items.map((item) => ({
					id: item.id,
					primary: item.name,
					chips: item.qty ? [{ label: item.qty, mono: true }] : [],
					badges: [{ kind: 'origin' as const, label: item.origin }],
					done: allChecked || item.done,
					actions: rowActions,
				}))
	)
	const checked = $derived(rows.filter((row) => row.done).length)
	const headerActions = $derived([
		{
			label: 'Add',
			icon: 'plus' as const,
			variant: empty ? ('secondary' as const) : undefined,
			onclick: () => onadd?.(''),
		},
		{ label: 'Clear checked', onclick: onclear },
	])
</script>

<AppFrame current="kitchen" {onnavigate}>
	{#snippet children(platform)}
		<div class="page">
			<PageHeader name={hearth.name} subtitle={hearth.subtitle} icon={domainGlyph('kitchen')} actions={headerActions}>
				{#snippet filters()}
					<Segmented items={TABS} selected={2} label="Hearth sections" />
					<Chip label={grocery.name} tone="accent" icon="list" />
				{/snippet}
			</PageHeader>

			{#if empty}
				<EmptyState
					title="The list is empty"
					text="Add an item in one line, or send a recipe's missing ingredients here from Recipes."
					action={{ label: 'Add an item', icon: 'plus', onclick: () => onadd?.('') }}
				/>
			{:else}
				<div class="body">
					<QuickAdd placeholder="Add to the list" onadd={(text) => onadd?.(text)} />
					<section class="store" aria-labelledby="{uid}-store">
						<header class="store-head">
							<h2 class="store-title" id="{uid}-store">{STORE}</h2>
							<Chip label={grocery.shopDay} icon="calendar" tone="outline" />
							<span class="store-count">{checked} of {rows.length} checked</span>
						</header>
						{#if allChecked}
							<p class="voice">Everything is checked. Clear the list once you are home.</p>
						{/if}
						{#if platform === 'desktop'}
							<List header={grocery.name} count={rows.length} {rows} selectable {onopen} {onaction} />
						{:else}
							<div class="card">
								<SwipeList
									{rows}
									leading={(row) => ({ label: 'Check off', icon: 'check', onaction: () => oncheck?.(row) })}
									trailing={(row) => ({ label: 'Delete', icon: 'trash', onaction: () => ondelete?.(row) })}
									{onopen}
								/>
							</div>
						{/if}
					</section>
				</div>
			{/if}
		</div>
	{/snippet}
</AppFrame>

<style>
	.page {
		display: flex;
		flex-direction: column;
		padding-bottom: var(--space-8);
	}
	.body {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding: 0 var(--ed-gutter);
		max-width: calc(var(--sheet-max) * 0.8);
	}
	/* One group per store: its name, the shop-day Event beside it, and the count of what is checked */
	.store {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.store-head {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.store-title {
		margin: 0;
		font: var(--ed-t-title-lg);
		letter-spacing: var(--ed-t-title-lg-tracking);
		font-variation-settings: var(--ed-t-title-lg-opsz);
	}
	.store-count {
		margin-left: auto;
		font: var(--ed-t-data-sm);
		letter-spacing: var(--ed-t-data-sm-tracking);
		font-variant-numeric: tabular-nums;
		color: var(--text-secondary);
	}
	.voice {
		margin: 0;
		font: var(--ed-t-voice);
		letter-spacing: var(--ed-t-voice-tracking);
		font-variation-settings: var(--ed-t-voice-opsz);
		color: var(--text-secondary);
	}
	/* Mobile: the rows on the List's chrome, each a swipe row */
	.card {
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
		background: var(--surface-1);
		overflow: hidden;
	}
</style>
