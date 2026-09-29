<script lang="ts">
	// Hearth's Stock view (product/domains/kitchen.md, "Surfaces"): the page header with Capture a haul as the primary
	// action, the domain's tabs and the filter chips beneath it, a quick-add line, then one List per location (Fridge,
	// Freezer, Pantry, Counter) sorted by expiry, with quantities in mono, `estimated` where the capture guessed and a
	// warning where stock is low. On desktop the selected item opens in a detail pane; on mobile the rows are a
	// SwipeList whose trailing action deletes, and the detail would be a pushed view.
	import {
		Badge,
		Button,
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
	import { haul, sidebar, stock, type StockItem, type StockLocation } from '../../sample-data.js'

	type Props = {
		/** The Expiring filter: only what is dated on or before Friday. */
		expiring?: boolean
		/** The Low stock filter. */
		lowStock?: boolean
		/** No stock at all: the EmptyState in place of the lists. */
		empty?: boolean
		/** The item open in the detail pane on desktop. */
		selected?: string
		oncapture?: () => void
		onadd?: (text: string) => void
		onopen?: (row: ListRowData) => void
		onaction?: (item: MenuItem, row: ListRowData) => void
		ondelete?: (row: ListRowData) => void
		onsample?: () => void
		onnavigate?: (id: string) => void
	}
	let {
		expiring = false,
		lowStock = false,
		empty = false,
		selected = 'st-01',
		oncapture,
		onadd,
		onopen,
		onaction,
		ondelete,
		onsample,
		onnavigate,
	}: Props = $props()

	const uid = $props.id()
	const hearth = sidebar.items.find((entry) => entry.id === 'kitchen')!
	const TABS = ['Stock', 'Recipes', 'Grocery', 'Tips']
	const LOCATIONS: { id: StockLocation; label: string }[] = [
		{ id: 'fridge', label: 'Fridge' },
		{ id: 'freezer', label: 'Freezer' },
		{ id: 'pantry', label: 'Pantry' },
		{ id: 'counter', label: 'Counter' },
	]
	/** Today is Wednesday 09-30; anything dated on or before Friday counts as expiring. */
	const SOON = '10-02'
	const CATEGORY: Partial<Record<string, string>> = {
		'st-01': 'Meat',
		'st-04': 'Produce',
		'st-16': 'Supplements and mixes',
	}
	const TIP: Partial<Record<string, string>> = {
		'st-01': 'Keep on the lowest shelf, and cook or freeze within two days of the date.',
		'st-04': 'Wrap in a dry towel inside the bag; it wilts fastest in the door.',
		'st-16': 'Anywhere dry. Nine packets left: the list already has a box.',
	}
	const rowActions: MenuItem[] = [
		{ id: 'edit', label: 'Edit', icon: 'pencil' },
		{ id: 'move', label: 'Move', icon: 'arrow-right' },
		{ id: 'grocery', label: 'Add to grocery', icon: 'plus' },
		{ id: 'delete', label: 'Delete', icon: 'trash', destructive: true },
	]

	const quantity = (item: StockItem) => (item.unit ? `${item.qty} ${item.unit}` : item.qty)
	const soon = (item: StockItem) => !!item.expiry && item.expiry <= SOON
	const toRow = (item: StockItem): ListRowData => ({
		id: item.id,
		primary: item.name,
		chips: [{ label: quantity(item), mono: true }],
		badges: [
			...(item.lowStock ? [{ kind: 'warning' as const, label: 'low stock' }] : []),
			...(item.estimated ? [{ kind: 'estimated' as const }] : []),
		],
		meta: item.expiry,
		metaWarn: soon(item),
		actions: rowActions,
	})
	/** Expiry first, soonest at the top; what never expires sits at the bottom of its section. */
	const byExpiry = (a: StockItem, b: StockItem) => (a.expiry ?? '~').localeCompare(b.expiry ?? '~')

	const visible = $derived(
		empty ? [] : stock.filter((item) => (!expiring || soon(item)) && (!lowStock || item.lowStock))
	)
	const sections = $derived(
		LOCATIONS.map((location) => ({
			...location,
			items: visible.filter((item) => item.location === location.id).sort(byExpiry),
		})).filter((section) => section.items.length)
	)
	const detail = $derived(stock.find((item) => item.id === selected))
	const headerActions = $derived([
		{
			label: 'Capture a haul',
			icon: 'camera' as const,
			variant: empty ? ('secondary' as const) : undefined,
			onclick: oncapture,
		},
		{ label: 'Add', onclick: () => onadd?.('') },
	])
</script>

<AppFrame current="kitchen" {onnavigate}>
	{#snippet children(platform)}
		<div class="page">
			<PageHeader name={hearth.name} subtitle={hearth.subtitle} icon={domainGlyph('kitchen')} actions={headerActions}>
				{#snippet filters()}
					<Segmented items={TABS} selected={0} label="Hearth sections" />
					<Chip label="Expiring" tone="outline" icon="clock" selectable selected={expiring} />
					<Chip label="Low stock" tone="outline" selectable selected={lowStock} />
					<Chip label="Sort: expiry" tone="outline" icon="chevron-down" onclick={() => {}} />
				{/snippet}
			</PageHeader>

			{#if empty}
				<EmptyState
					title="Nothing in stock yet"
					text="Capture a haul and it lands here by location, with an estimated expiry on each item."
					action={{ label: 'Capture a haul', icon: 'camera', onclick: oncapture }}
					sample={{ onclick: onsample }}
				/>
			{:else}
				<div class={['body', { 'body-wide': platform === 'desktop' && detail }]}>
					<div class="lists">
						<QuickAdd placeholder="Add to stock" onadd={(text) => onadd?.(text)} />
						{#each sections as section (section.id)}
							{#if platform === 'desktop'}
								<List
									header={section.label}
									count={section.items.length}
									rows={section.items.map(toRow)}
									selectable
									{onopen}
									{onaction}
								/>
							{:else}
								<section class="card" aria-labelledby="{uid}-{section.id}">
									<h2 class="card-title" id="{uid}-{section.id}">
										{section.label}<span class="card-count">{section.items.length}</span>
									</h2>
									<SwipeList
										rows={section.items.map(toRow)}
										trailing={(row) => ({ label: 'Delete', icon: 'trash', onaction: () => ondelete?.(row) })}
										{onopen}
									/>
								</section>
							{/if}
						{/each}
					</div>

					{#if platform === 'desktop' && detail}
						<aside class="detail" aria-labelledby="{uid}-detail">
							<h2 class="detail-title" id="{uid}-detail">{detail.name}</h2>
							<dl class="fields">
								<dt>Quantity</dt>
								<dd class="mono">{quantity(detail)}</dd>
								<dt>Location</dt>
								<dd><Chip label={LOCATIONS.find((l) => l.id === detail.location)?.label ?? detail.location} /></dd>
								{#if detail.expiry}
									<dt>Expires</dt>
									<dd class="mono">
										{detail.expiry}
										{#if detail.estimated}<Badge kind="estimated" />{/if}
										{#if soon(detail)}<Badge kind="warning" label="this week" />{/if}
									</dd>
								{/if}
								{#if CATEGORY[detail.id]}
									<dt>Category</dt>
									<dd>{CATEGORY[detail.id]}</dd>
								{/if}
								<dt>Source</dt>
								<dd><Badge kind="origin" label="capture" /><span class="mono">{haul.capturedAt}</span></dd>
								{#if detail.lowStock}
									<dt>Low-stock threshold</dt>
									<dd class="mono">10</dd>
								{/if}
							</dl>
							{#if TIP[detail.id]}
								<section class="tip" aria-labelledby="{uid}-tip">
									<h3 class="tip-title" id="{uid}-tip">Storage tip</h3>
									<p class="tip-text">{TIP[detail.id]}</p>
								</section>
							{/if}
							<div class="detail-actions">
								<Button label="Add to grocery" icon="plus" onclick={() => onaction?.(rowActions[2]!, toRow(detail))} />
								<Button label="Move" icon="arrow-right" onclick={() => onaction?.(rowActions[1]!, toRow(detail))} />
								<Button label="Delete" variant="quiet" onclick={() => onaction?.(rowActions[3]!, toRow(detail))} />
							</div>
						</aside>
					{/if}
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
	/* The lists on the left and the detail pane on the right on a wide screen; one column otherwise */
	.body {
		display: grid;
		gap: var(--space-6);
		padding: 0 var(--ed-gutter);
	}
	.body-wide {
		grid-template-columns: minmax(0, 1fr) var(--sheet-sm);
		align-items: start;
	}
	.lists {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}

	/* Mobile: a card per location with a heading and swipe rows, on the List's chrome */
	.card {
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
		background: var(--surface-1);
		overflow: hidden;
	}
	.card-title {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		box-sizing: border-box;
		min-height: var(--ed-control);
		margin: 0;
		padding: 0 var(--space-3);
		border-bottom: 1px solid var(--stroke-subtle);
		color: var(--text-secondary);
		font: var(--ed-t-title);
		letter-spacing: var(--ed-t-title-tracking);
		font-variation-settings: var(--ed-t-title-opsz);
	}
	.card-count {
		font: var(--ed-t-data-sm);
		letter-spacing: var(--ed-t-data-sm-tracking);
		font-variant-numeric: tabular-nums;
	}

	/* The detail pane: the item's name, its fields as a definition list, the storage tip in the voice, the actions */
	.detail {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		box-sizing: border-box;
		padding: var(--space-4);
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-card);
		background: var(--surface-1);
		box-shadow: var(--shadow-card);
	}
	.detail-title {
		margin: 0;
		font: var(--ed-t-display-sm);
		letter-spacing: var(--ed-t-display-sm-tracking);
		font-variation-settings: var(--ed-t-display-sm-opsz);
		text-wrap: balance;
	}
	.fields {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: var(--space-2) var(--space-4);
		align-items: center;
		margin: 0;
	}
	.fields dt {
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		color: var(--text-secondary);
	}
	.fields dd {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: 0;
		font: var(--ed-t-body);
		letter-spacing: var(--ed-t-body-tracking);
	}
	.mono {
		font: var(--ed-t-data);
		letter-spacing: var(--ed-t-data-tracking);
		font-variant-numeric: tabular-nums;
	}
	.tip {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		padding: var(--space-3);
		border-radius: var(--ed-radius-control);
		background: var(--surface-2);
	}
	.tip-title {
		margin: 0;
		font: var(--ed-t-label);
		letter-spacing: var(--ed-t-label-tracking);
		color: var(--text-secondary);
	}
	.tip-text {
		margin: 0;
		font: var(--ed-t-voice);
		letter-spacing: var(--ed-t-voice-tracking);
		font-variation-settings: var(--ed-t-voice-opsz);
		text-wrap: pretty;
	}
	.detail-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
</style>
