<script lang="ts">
	// Hearth's Grocery view (Domains/Hearth/Grocery): a quick-add line, then the active list grouped by store with the
	// shop day beside each store's name. Every row leads with its checkbox and carries an origin badge (manual, recipe,
	// low stock, ran out); a checked row is struck through and stays until Clear checked. It is a checklist: a click on a row
	// or on its checkbox checks it off (D-94), and Edit in the row's menu opens it in the pane. The pane on the right is the list itself (its name, the store
	// its items are bought at unless they say otherwise, its shop day, which sets the morning's reminder) or, when an
	// item is being edited, that item's fields. Beneath the list sits Buy it again (D-92): what ran out, each one a
	// click from the list.
	import { Button, Chip, EmptyState, Field, List, QuickAdd, type ListRowData, type MenuItem } from '@eden/ui-kit'
	import { locale, t } from '@eden/shared/i18n'
	import { settings } from '@eden/shared/settings'
	import { undoToast } from '$lib/shell/undo'
	import { formatEventTime } from '@eden/shared/dates'
	import { categoryGlyph } from '../words'
	import { kitchen, type GroceryItem, type StockItem } from '../store.svelte'

	type Props = {
		/** The id the page's Add action focuses. */
		quickAddId: string
		/** The empty state's primary action: focus the quick-add line. */
		onadd: () => void
	}
	let { quickAddId, onadd }: Props = $props()

	const uid = $props.id()
	const lang = $derived($locale ?? 'en')
	const format = $derived({ lang, clock: settings.clock })

	const originLabel = (item: GroceryItem) => {
		const key = item.origin === 'low-stock' ? 'lowStock' : item.origin === 'ran-out' ? 'ranOut' : item.origin
		const origin = $t(`domains.kitchen.grocery.origin.${key}`)
		return item.note ? `${origin}: ${item.note}` : origin
	}
	const actionsFor = (item: GroceryItem): MenuItem[] => [
		{
			id: 'check',
			label: $t(item.done ? 'domains.kitchen.grocery.actions.uncheck' : 'domains.kitchen.grocery.actions.check'),
			icon: 'check',
		},
		{ id: 'edit', label: $t('domains.kitchen.grocery.actions.edit'), icon: 'pencil' },
		{ id: 'delete', label: $t('domains.kitchen.grocery.actions.delete'), icon: 'trash', destructive: true },
	]
	const toRow = (item: GroceryItem): ListRowData => ({
		id: item.id,
		primary: item.name,
		chips: item.qty ? [{ label: item.qty, mono: true }] : [],
		badges: [{ kind: 'origin' as const, label: originLabel(item) }],
		done: item.done,
		checkable: true,
		actions: actionsFor(item),
	})

	/** One group per store, the list's own store for the items that name none. */
	const groups = $derived.by(() => {
		const stores: { store: string; items: GroceryItem[] }[] = []
		for (const item of kitchen.grocery.items) {
			const store = item.store ?? kitchen.grocery.store
			const group = stores.find((entry) => entry.store === store)
			if (group) group.items.push(item)
			else stores.push({ store, items: [item] })
		}
		return stores.map((group) => ({ ...group, checked: group.items.filter((item) => item.done).length }))
	})
	const storeName = (store: string) => store || $t('domains.kitchen.grocery.anyStore')

	function toggle(id: string) {
		const { item, undo } = kitchen.toggleGrocery(id)
		if (!item) return
		const key = item.done ? 'domains.kitchen.grocery.toast.checked' : 'domains.kitchen.grocery.toast.unchecked'
		undoToast($t(key, { values: { name: item.name } }), undo)
	}
	function remove(id: string) {
		const { item, undo } = kitchen.removeGrocery(id)
		if (editing === id) editing = undefined
		if (item) undoToast($t('domains.kitchen.grocery.toast.removed', { values: { name: item.name } }), undo)
	}
	function onaction(menuItem: MenuItem, row: ListRowData) {
		if (menuItem.id === 'check') toggle(row.id)
		else if (menuItem.id === 'edit') edit(row.id)
		else if (menuItem.id === 'delete') remove(row.id)
	}
	// Buy it again: what ran out and is not on the list. Opening a row puts it on; its menu can forget the item.
	const toAgainRow = (item: StockItem): ListRowData => ({
		id: item.id,
		primary: item.name,
		thumbnail: kitchen.photoOf(item),
		icon: categoryGlyph(item.category),
		tile: true,
		actions: [
			{ id: 'again', label: $t('domains.kitchen.stock.actions.addToGrocery'), icon: 'plus' },
			{ id: 'forget', label: $t('domains.kitchen.stock.actions.delete'), icon: 'trash', destructive: true },
		],
	})
	function again(id: string) {
		const item = kitchen.stockById(id)
		if (!item) return
		const { undo } = kitchen.addToGrocery(item.name, '', 'ran-out')
		undoToast($t('domains.kitchen.grocery.toast.added', { values: { name: item.name } }), undo)
	}
	function onagain(menuItem: MenuItem, row: ListRowData) {
		if (menuItem.id === 'again') return again(row.id)
		const { item, undo } = kitchen.removeStock(row.id)
		if (item) undoToast($t('domains.kitchen.stock.toast.removed', { values: { name: item.name } }), undo)
	}
	function add(text: string) {
		const { item, undo } = kitchen.addGrocery(text)
		undoToast($t('domains.kitchen.grocery.toast.added', { values: { name: item.name } }), undo)
	}

	// An item's fields, in the pane; saved as one change.
	let editing = $state<string>()
	let form = $state({ name: '', qty: '', store: '', note: '' })
	const edited = $derived(kitchen.grocery.items.find((item) => item.id === editing))
	function edit(id: string) {
		const item = kitchen.grocery.items.find((entry) => entry.id === id)
		if (!item) return
		form = { name: item.name, qty: item.qty, store: item.store ?? '', note: item.note ?? '' }
		editing = id
	}
	function save(item: GroceryItem) {
		const { undo } = kitchen.updateGrocery(item.id, {
			name: form.name.trim(),
			qty: form.qty.trim(),
			store: form.store.trim() || undefined,
			note: form.note.trim() || undefined,
		})
		undoToast($t('domains.kitchen.grocery.toast.edited', { values: { name: form.name.trim() || item.name } }), undo)
		editing = undefined
	}

	// The list's own fields: each is written when the owner leaves it, or picks a day.
	const shopDate = $derived(kitchen.grocery.shopDay?.slice(0, 10) ?? '')
	const shopTime = $derived(kitchen.grocery.shopDay?.slice(11, 16) ?? '')
	function setList(patch: { name?: string; store?: string }) {
		const next = Object.fromEntries(
			Object.entries(patch).filter(([key, value]) => value !== kitchen.grocery[key as 'name' | 'store'])
		)
		if (Object.keys(next).length) undoToast($t('domains.kitchen.grocery.toast.listSaved'), kitchen.updateList(next))
	}
	function setShopDay(date: string, time: string) {
		const shopDay = date ? `${date}T${time || '10:00'}:00` : undefined
		if (shopDay === kitchen.grocery.shopDay) return
		const undo = kitchen.updateList({ shopDay })
		undoToast(
			$t(shopDay ? 'domains.kitchen.grocery.toast.shopDaySet' : 'domains.kitchen.grocery.toast.shopDayCleared'),
			undo
		)
	}
</script>

<div class="body">
	<div class="lists">
		<QuickAdd id={quickAddId} placeholder={$t('domains.kitchen.grocery.addPlaceholder')} onadd={add} />
		{#if kitchen.grocery.items.length === 0}
			<EmptyState
				title={$t('domains.kitchen.grocery.empty.title')}
				text={$t('domains.kitchen.grocery.empty.text')}
				action={{ label: $t('domains.kitchen.grocery.empty.action'), icon: 'plus', onclick: onadd }}
			/>
		{:else}
			{#each groups as group (group.store)}
				<section class="store" aria-labelledby="{uid}-{group.store}">
					<header class="store-head">
						<h2 class="store-title" id="{uid}-{group.store}">{storeName(group.store)}</h2>
						{#if kitchen.grocery.shopDay}
							<Chip label={formatEventTime(kitchen.grocery.shopDay, format)} icon="calendar" tone="outline" />
						{/if}
						<span class="store-count">
							{$t('domains.kitchen.grocery.checked', { values: { checked: group.checked, total: group.items.length } })}
						</span>
					</header>
					{#if group.checked === group.items.length}
						<p class="voice">{$t('domains.kitchen.grocery.allChecked')}</p>
					{/if}
					<List
						header={kitchen.grocery.name || storeName(group.store)}
						count={group.items.length}
						rows={group.items.map(toRow)}
						selectable
						current={editing}
						onpick={(row) => toggle(row.id)}
						oncheck={(row) => toggle(row.id)}
						{onaction}
					/>
				</section>
			{/each}
		{/if}
		{#if kitchen.buyAgain.length}
			<List
				header={$t('domains.kitchen.grocery.buyAgain')}
				count={kitchen.buyAgain.length}
				rows={kitchen.buyAgain.map(toAgainRow)}
				onpick={(row) => again(row.id)}
				onaction={onagain}
			/>
		{/if}
	</div>

	{#if edited}
		<aside class="pane" aria-labelledby="{uid}-pane">
			<h2 class="pane-title" id="{uid}-pane">{$t('domains.kitchen.grocery.pane.editing')}</h2>
			<form
				class="form"
				onsubmit={(event) => {
					event.preventDefault()
					save(edited)
				}}
			>
				<Field label={$t('domains.kitchen.grocery.pane.name')} bind:value={form.name} />
				<Field label={$t('domains.kitchen.grocery.pane.quantity')} bind:value={form.qty} mono />
				<Field
					label={$t('domains.kitchen.grocery.pane.store')}
					helper={$t('domains.kitchen.grocery.pane.storeHelp', {
						values: { store: storeName(kitchen.grocery.store) },
					})}
					bind:value={form.store}
				/>
				{#if kitchen.stores.length}
					<div class="chips">
						{#each kitchen.stores as store (store)}
							<Chip
								label={store}
								tone={form.store === store ? 'accent' : 'outline'}
								onclick={() => (form.store = store)}
							/>
						{/each}
					</div>
				{/if}
				<Field label={$t('domains.kitchen.grocery.pane.note')} bind:value={form.note} />
				<div class="pane-actions">
					<Button label={$t('common.save')} variant="primary" type="submit" disabled={!form.name.trim()} />
					<Button label={$t('common.cancel')} variant="quiet" onclick={() => (editing = undefined)} />
				</div>
			</form>
		</aside>
	{:else}
		<aside class="pane" aria-labelledby="{uid}-pane">
			<h2 class="pane-title" id="{uid}-pane">{$t('domains.kitchen.grocery.pane.list')}</h2>
			<div class="form">
				<Field
					label={$t('domains.kitchen.grocery.pane.listName')}
					placeholder={$t('domains.kitchen.grocery.pane.listNamePlaceholder')}
					value={kitchen.grocery.name}
					onchange={(event: Event) => setList({ name: (event.currentTarget as HTMLInputElement).value.trim() })}
				/>
				<Field
					label={$t('domains.kitchen.grocery.pane.defaultStore')}
					helper={$t('domains.kitchen.grocery.pane.defaultStoreHelp')}
					value={kitchen.grocery.store}
					onchange={(event: Event) => setList({ store: (event.currentTarget as HTMLInputElement).value.trim() })}
				/>
				<div class="pair">
					<Field
						label={$t('domains.kitchen.grocery.pane.shopDay')}
						type="date"
						value={shopDate}
						onchange={(event: Event) => setShopDay((event.currentTarget as HTMLInputElement).value, shopTime)}
					/>
					<Field
						label={$t('domains.kitchen.grocery.pane.shopTime')}
						type="time"
						value={shopTime}
						disabled={!shopDate}
						onchange={(event: Event) => setShopDay(shopDate, (event.currentTarget as HTMLInputElement).value)}
					/>
				</div>
				<p class="help">{$t('domains.kitchen.grocery.pane.shopDayHelp')}</p>
				{#if kitchen.grocery.shopDay}
					<div class="pane-actions">
						<Button
							label={$t('domains.kitchen.grocery.pane.clearShopDay')}
							variant="quiet"
							onclick={() => setShopDay('', '')}
						/>
					</div>
				{/if}
			</div>
		</aside>
	{/if}
</div>

<style>
	/* The list on the left and its pane on the right */
	.body {
		flex: 1 0 auto;
		display: grid;
		grid-template-columns: minmax(0, 1fr) var(--sheet-sm);
		align-items: start;
		gap: var(--space-6);
		padding: 0 var(--ed-gutter);
	}
	.lists {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	/* One group per store: its name, the shop day beside it, and the count of what is checked */
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

	/* The pane: the list's own fields, or the item being edited; it stays in view while the list scrolls */
	.pane {
		position: sticky;
		top: var(--space-4);
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
