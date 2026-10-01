<script lang="ts">
	// Hearth's Grocery view (product/domains/kitchen.md, "Surfaces"): the same header as Stock with the Grocery tab
	// selected and Add as the primary action, a quick-add line, then the active list grouped by store with its shop-day
	// Event beside the store's name. Every row carries an origin badge (manual, recipe, low stock); a checked row is
	// struck through and stays until Clear checked. On desktop the pane on the right is the list itself (its name, the
	// store its items are bought at unless they say otherwise, its shop day, which sets the morning's reminder) or,
	// when an item is being edited, that item's fields. On mobile there is no pane: a swipe to the right checks a row
	// off and a swipe to the left deletes it.
	import {
		Button,
		Chip,
		EmptyState,
		Field,
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

	type Item = (typeof grocery.items)[number]

	type Props = {
		/** Every row checked off: the list is done for the trip. */
		allChecked?: boolean
		/** No items on the list. */
		empty?: boolean
		/** The item whose fields are open in the pane, by id; without it the pane is the list's own. */
		editing?: string
		onadd?: (text: string) => void
		onclear?: () => void
		oncheck?: (row: ListRowData) => void
		ondelete?: (row: ListRowData) => void
		onopen?: (row: ListRowData) => void
		onaction?: (item: MenuItem, row: ListRowData) => void
		/** Save in the pane's item form, with the item's id. */
		onsave?: (id: string) => void
		/** Clear the shop day, in the list's pane. */
		onclearshopday?: () => void
		onnavigate?: (id: string) => void
	}
	let {
		allChecked = false,
		empty = false,
		editing,
		onadd,
		onclear,
		oncheck,
		ondelete,
		onopen,
		onaction,
		onsave,
		onclearshopday,
		onnavigate,
	}: Props = $props()

	const uid = $props.id()
	const hearth = sidebar.items.find((entry) => entry.id === 'kitchen')!
	const TABS = ['Stock', 'Recipes', 'Grocery']
	/** Where the list is bought; an item that names no store of its own sits under it. */
	const STORE = 'H-E-B'
	const isDone = (item: Item) => allChecked || item.done
	const actionsFor = (item: Item): MenuItem[] => [
		{ id: 'check', label: isDone(item) ? 'Uncheck' : 'Check off', icon: 'check' },
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
					done: isDone(item),
					actions: actionsFor(item),
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
		{ label: 'Clear checked', disabled: checked === 0, onclick: onclear },
	])

	// The pane's item form: the fields of the row being edited. A recipe's name after the origin is the item's note.
	const formOf = (item?: Item) => ({
		name: item?.name ?? '',
		qty: item?.qty ?? '',
		store: '',
		note: item?.origin.split(':')[1]?.trim() ?? '',
	})
	// svelte-ignore state_referenced_locally
	let current = $state(editing)
	let form = $state(formOf(grocery.items.find((item) => item.id === editing)))
	const edited = $derived(empty ? undefined : grocery.items.find((item) => item.id === current))
	function act(item: MenuItem, row: ListRowData) {
		if (item.id === 'edit') {
			form = formOf(grocery.items.find((entry) => entry.id === row.id))
			current = row.id
		}
		onaction?.(item, row)
	}

	// The list's own fields; the shop day (`Sat 10-03 10:00`) as its date and time fields hold it.
	const [, shopDate = '', shopTime = ''] = /(\d{2}-\d{2}) (\d{2}:\d{2})/.exec(grocery.shopDay) ?? []
	let list = $state({ name: grocery.name, store: STORE, date: shopDate && `2026-${shopDate}`, time: shopTime })
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

			<div class={['body', { 'body-wide': platform === 'desktop' }]}>
				<div class="lists">
					<QuickAdd placeholder="Add to the list" onadd={(text) => onadd?.(text)} />
					{#if empty}
						<EmptyState
							title="The list is empty"
							text="Add an item in one line, or send a recipe's missing ingredients here from Recipes."
							action={{ label: 'Add an item', icon: 'plus', onclick: () => onadd?.('') }}
						/>
					{:else}
						<section class="store" aria-labelledby="{uid}-store">
							<header class="store-head">
								<h2 class="store-title" id="{uid}-store">{STORE}</h2>
								<Chip label={grocery.shopDay} icon="calendar" tone="outline" />
								<span class="store-count">{checked} of {rows.length} checked</span>
							</header>
							{#if checked === rows.length}
								<p class="voice">Everything is checked. Clear the list once you are home.</p>
							{/if}
							{#if platform === 'desktop'}
								<List header={grocery.name} count={rows.length} {rows} selectable {onopen} onaction={act} />
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
					{/if}
				</div>

				{#if platform === 'desktop' && edited}
					<aside class="pane" aria-labelledby="{uid}-pane">
						<h2 class="pane-title" id="{uid}-pane">Edit item</h2>
						<form
							class="form"
							onsubmit={(event) => {
								event.preventDefault()
								onsave?.(edited.id)
								current = undefined
							}}
						>
							<Field label="Name" bind:value={form.name} />
							<Field label="Quantity" bind:value={form.qty} mono />
							<Field label="Store" helper="Left empty, it is bought at {STORE}." bind:value={form.store} />
							<div class="chips">
								<Chip
									label={STORE}
									tone={form.store === STORE ? 'accent' : 'outline'}
									onclick={() => (form.store = STORE)}
								/>
							</div>
							<Field label="Note" bind:value={form.note} />
							<div class="pane-actions">
								<Button label="Save" variant="primary" type="submit" disabled={!form.name.trim()} />
								<Button label="Cancel" variant="quiet" onclick={() => (current = undefined)} />
							</div>
						</form>
					</aside>
				{:else if platform === 'desktop'}
					<aside class="pane" aria-labelledby="{uid}-pane">
						<h2 class="pane-title" id="{uid}-pane">The list</h2>
						<div class="form">
							<Field label="Name" placeholder="This week" bind:value={list.name} />
							<Field
								label="Store"
								helper="Where the list is bought, unless an item names another store."
								bind:value={list.store}
							/>
							<div class="pair">
								<Field label="Shop day" type="date" bind:value={list.date} />
								<Field label="Time" type="time" bind:value={list.time} disabled={!list.date} />
							</div>
							<p class="help">A reminder arrives on the morning of the shop day.</p>
							{#if list.date}
								<div class="pane-actions">
									<Button
										label="Clear the shop day"
										variant="quiet"
										onclick={() => {
											list.date = ''
											list.time = ''
											onclearshopday?.()
										}}
									/>
								</div>
							{/if}
						</div>
					</aside>
				{/if}
			</div>
		</div>
	{/snippet}
</AppFrame>

<style>
	.page {
		display: flex;
		flex-direction: column;
		padding-bottom: var(--space-8);
	}
	/* The list on the left and its pane on the right on a wide screen; one column otherwise */
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

	/* The pane: the list's own fields, or the item being edited */
	.pane {
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
	.pane-title {
		margin: 0;
		font: var(--ed-t-display-sm);
		letter-spacing: var(--ed-t-display-sm-tracking);
		font-variation-settings: var(--ed-t-display-sm-opsz);
		text-wrap: balance;
	}
	.form {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.pair {
		display: grid;
		grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
		gap: var(--space-3);
	}
	.chips,
	.pane-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.help {
		margin: 0;
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		color: var(--text-secondary);
	}
</style>
