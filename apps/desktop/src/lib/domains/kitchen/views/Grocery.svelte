<script lang="ts">
	// Hearth's Grocery view (Domains/Hearth/Grocery): one list per store (D-96), all on the page at once: the store's
	// name in the display face, its shop day when it has one (D-98), about what it costs (D-105), Complete, Edit store and
	// Add as quiet icon buttons, and its rows. What no store has yet sits under "Miscellaneous". Every row leads with
	// its checkbox and carries an origin badge (manual, recipe, low stock, ran out); a checked row is struck through
	// and stays until its list is completed. It is a checklist: a click on a row or on its checkbox checks it off
	// (D-94), and Edit and Move to are in the row's menu. A row can also be dragged onto another store's list, which is
	// the same move (D-106); Miscellaneous shows for the length of a drag even when it holds nothing.
	// At the side, in view while the lists scroll (D-101): Buy it
	// again (D-92), what ran out, each one a click from a list; and beneath it the stores in the owner's order, each
	// row saying what is left to buy and its shop day or its last trip. A click on a store goes to its list; its menu
	// edits, moves and deletes it. Nothing is typed on the page: an item's form and a store's open in a sheet over it
	// (D-95), the same one to add as to edit, and the header's Add menu opens either through `addItem` and `addStore`
	// (D-102). An item added with no store picked is filed where it was last bought (D-97). A store has a picture
	// (D-103), beside its name and in its row: its website's icon, fetched when the website is saved, or one the
	// owner chose in its form, or the store glyph on a tile.
	import {
		Chip,
		DropTarget,
		EmptyState,
		IconButton,
		List,
		Thumbnail,
		type ListRowData,
		type MenuItem,
	} from '@eden/ui-kit'
	import { openExternal } from '@eden/shared/api'
	import { listEstimate } from '@eden/shared/domains/kitchen'
	import { formatUsd } from '@eden/shared/gardener'
	import { locale, t } from '@eden/shared/i18n'
	import { settings } from '@eden/shared/settings'
	import { undoToast } from '@eden/shared/shell'
	import { daysSince, formatEventTime } from '@eden/shared/dates'
	import { categoryGlyph } from '@eden/shared/domains/kitchen'
	import {
		kitchen,
		type GroceryBlock,
		type GroceryItem,
		type GroceryStore,
		type StockItem,
		type Undo,
	} from '@eden/shared/domains/kitchen'
	import GroceryItemSheet from '@eden/shared/domains/kitchen/views/GroceryItemSheet.svelte'
	import StoreSheet from '@eden/shared/domains/kitchen/views/StoreSheet.svelte'

	const uid = $props.id()
	const lang = $derived($locale ?? 'en')
	const format = $derived({ lang, clock: settings.clock })
	const anyStore = $derived($t('domains.kitchen.grocery.anyStore'))
	const nameOf = (store: GroceryStore | undefined) => store?.name ?? anyStore

	const originLabel = (item: GroceryItem) => {
		const key = item.origin === 'low-stock' ? 'lowStock' : item.origin === 'ran-out' ? 'ranOut' : item.origin
		const origin = $t(`domains.kitchen.grocery.origin.${key}`)
		return item.note ? `${origin}: ${item.note}` : origin
	}
	/** The lists but this one, as a submenu: every other store, then the unfiled list. */
	const placesBut = (prefix: string, storeId?: string | null): MenuItem[] =>
		[...kitchen.grocery.stores.map((store) => ({ id: store.id, label: store.name })), { id: '', label: anyStore }]
			.filter((entry) => storeId === null || entry.id !== (storeId ?? ''))
			.map((entry) => ({ id: `${prefix}:${entry.id}`, label: entry.label }))
	const actionsFor = (item: GroceryItem, store: GroceryStore | undefined): MenuItem[] => [
		{
			id: 'check',
			label: $t(item.done ? 'domains.kitchen.grocery.actions.uncheck' : 'domains.kitchen.grocery.actions.check'),
			icon: 'check',
		},
		{ id: 'edit', label: $t('domains.kitchen.grocery.actions.edit'), icon: 'pencil' },
		{
			id: 'move',
			label: $t('domains.kitchen.grocery.actions.moveTo'),
			icon: 'arrow-right',
			children: placesBut('move', store?.id),
		},
		{ id: 'delete', label: $t('domains.kitchen.grocery.actions.delete'), icon: 'trash', destructive: true },
	]
	const toRow = (item: GroceryItem, store: GroceryStore | undefined): ListRowData => ({
		id: item.id,
		primary: item.name,
		secondary: item.brand,
		chips: [
			...(item.qty ? [{ label: item.qty, mono: true }] : []),
			...(item.size ? [{ id: 'size', label: item.size, mono: true }] : []),
			// a price the owner typed on the line; what the store remembers shows only in the list's sum (D-105)
			...(item.price === undefined
				? []
				: [
						{
							id: 'price',
							label: $t('domains.kitchen.grocery.priced', { values: { price: formatUsd(item.price) } }),
							mono: true,
						},
					]),
		],
		badges: [{ kind: 'origin' as const, label: originLabel(item) }],
		done: item.done,
		checkable: true,
		actions: actionsFor(item, store),
	})
	const total = $derived(kitchen.grocery.items.length)

	/** The group the lists' rows are dragged in, from one store's list to another's (D-106). */
	const DRAG_GROUP = 'grocery-item'
	let dragging = $state(false)
	/** The lists on the page; while a row is held, Miscellaneous is among them even when empty, to be dropped on. */
	const blocks = $derived.by((): GroceryBlock[] => {
		const all = kitchen.blocks
		if (!dragging || all.some((block) => !block.store)) return all
		return [...all, { items: [], checked: 0, left: 0 }]
	})

	/** The toast of an item that landed on a list: it names the store, or says only that it was added. */
	function landed(name: string, store: GroceryStore | undefined, undo: Undo) {
		const message = store
			? $t('domains.kitchen.grocery.toast.addedTo', { values: { name, store: store.name } })
			: $t('domains.kitchen.grocery.toast.added', { values: { name } })
		undoToast(message, undo)
	}
	function toggle(id: string) {
		const { item, undo } = kitchen.toggleGrocery(id)
		if (!item) return
		const key = item.done ? 'domains.kitchen.grocery.toast.checked' : 'domains.kitchen.grocery.toast.unchecked'
		undoToast($t(key, { values: { name: item.name } }), undo)
	}
	function remove(id: string) {
		const { item, undo } = kitchen.removeGrocery(id)
		if (item) undoToast($t('domains.kitchen.grocery.toast.removed', { values: { name: item.name } }), undo)
	}
	function move(id: string, storeId: string) {
		const { item, store, undo } = kitchen.updateGrocery(id, { storeId: storeId || null })
		if (!item) return
		undoToast($t('domains.kitchen.grocery.toast.moved', { values: { name: item.name, store: nameOf(store) } }), undo)
	}
	function onaction(menuItem: MenuItem, row: ListRowData) {
		const action = menuItem.id ?? ''
		if (action === 'check') toggle(row.id)
		else if (action === 'edit') edit(row.id)
		else if (action === 'delete') remove(row.id)
		else if (action.startsWith('move:')) move(row.id, action.slice('move:'.length))
	}
	function complete(block: GroceryBlock) {
		if (!block.list) return
		const { count, undo } = kitchen.completeList(block.list.id)
		if (!count) return
		undoToast($t('domains.kitchen.grocery.toast.completed', { values: { count, store: nameOf(block.store) } }), undo)
	}

	// Buy it again: what ran out and is not on a list. A click puts it on the list of the store it was last bought
	// at; its menu names a store, or forgets the item.
	const toAgainRow = (item: StockItem): ListRowData => ({
		id: item.id,
		primary: item.name,
		secondary: item.brand,
		chips: item.size ? [{ label: item.size, mono: true }] : [],
		thumbnail: kitchen.photoOf(item),
		icon: categoryGlyph(item.category),
		tile: true,
		actions: [
			{
				id: 'again',
				label: $t('domains.kitchen.grocery.actions.addTo'),
				icon: 'plus',
				children: placesBut('again', null),
			},
			{ id: 'forget', label: $t('domains.kitchen.stock.actions.delete'), icon: 'trash', destructive: true },
		],
	})
	function again(id: string, storeId?: string) {
		const stocked = kitchen.stockById(id)
		if (!stocked) return
		const target = storeId === undefined ? undefined : storeId || null
		// the brand and the size to buy again go with the name (D-104)
		const row = {
			name: stocked.name,
			...(stocked.brand ? { brand: stocked.brand } : {}),
			...(stocked.size ? { size: stocked.size } : {}),
		}
		const { store, undo } = kitchen.addToGrocery(row, 'ran-out', target)
		landed(stocked.name, store, undo)
	}
	function onagain(menuItem: MenuItem, row: ListRowData) {
		const action = menuItem.id ?? ''
		if (action.startsWith('again:')) return again(row.id, action.slice('again:'.length))
		if (action !== 'forget') return
		const { item, undo } = kitchen.removeStock(row.id)
		if (item) undoToast($t('domains.kitchen.stock.toast.removed', { values: { name: item.name } }), undo)
	}

	// An item's form and a store's, each in its sheet (D-95), the same one to add as to edit.
	let itemSheet = $state<GroceryItemSheet>()
	let storeSheet = $state<StoreSheet>()
	/**
	 * Opens the item's form blank: the header's Add item and the empty state's action with no store picked, a
	 * list's own Add with its store picked ('' for the unfiled list).
	 */
	export function addItem(store?: string) {
		itemSheet?.add(store)
	}
	const edit = (id: string) => itemSheet?.edit(id)
	/** Opens the store's form blank: the header's Add store. */
	export function addStore() {
		storeSheet?.add()
	}
	const editStore = (id: string) => storeSheet?.edit(id)

	// The stores, at the side: each row goes to its list.
	/** A last trip by its day: `today`, `yesterday`, `5 days ago`. */
	const dayAgo = (iso: string) =>
		new Intl.RelativeTimeFormat(lang, { numeric: 'auto' }).format(-Math.max(0, daysSince(iso)), 'day')
	const storeBlocks = $derived(kitchen.blocks.filter((block) => block.store))
	const storeRows = $derived<ListRowData[]>(
		storeBlocks.map((block, at) => {
			const store = block.store!
			const shopDay = block.list?.shopDay
			return {
				id: store.id,
				primary: store.name,
				hint: store.note,
				thumbnail: kitchen.storePhotoOf(store),
				icon: 'store' as const,
				tile: true,
				chips: shopDay
					? [{ label: formatEventTime(shopDay, format), icon: 'calendar' as const }]
					: store.shoppedAt
						? [
								{
									label: $t('domains.kitchen.grocery.shopped', {
										values: { when: dayAgo(store.shoppedAt) },
									}),
								},
							]
						: [],
				meta: block.left ? $t('domains.kitchen.grocery.left', { values: { count: block.left } }) : undefined,
				actions: [
					{ id: 'edit', label: $t('domains.kitchen.grocery.actions.edit'), icon: 'pencil' as const },
					...(store.place?.url
						? [
								{
									id: 'website',
									label: $t('domains.kitchen.grocery.actions.openWebsite'),
									icon: 'external-link' as const,
								},
							]
						: []),
					...(at > 0
						? [{ id: 'up', label: $t('domains.kitchen.grocery.actions.moveUp'), icon: 'chevron-up' as const }]
						: []),
					...(at < storeBlocks.length - 1
						? [{ id: 'down', label: $t('domains.kitchen.grocery.actions.moveDown'), icon: 'chevron-down' as const }]
						: []),
					{
						id: 'delete',
						label: $t('domains.kitchen.grocery.actions.delete'),
						icon: 'trash' as const,
						destructive: true,
					},
				],
			}
		})
	)
	/** The store whose list holds the focus: the stores' current row. */
	let at = $state<string>()
	/** Goes to a store's list: its section comes into view and its name takes the focus. */
	function goTo(id: string) {
		const name = document.getElementById(`${uid}-${id}`)
		name?.closest('section')?.scrollIntoView({ block: 'nearest' })
		name?.focus({ preventScroll: true })
	}
	function moveStore(id: string, delta: number) {
		const { store, undo } = kitchen.moveStore(id, delta)
		if (store) undoToast($t('domains.kitchen.grocery.toast.storeMoved', { values: { store: store.name } }), undo)
	}
	function removeStore(id: string) {
		const { store, undo } = kitchen.removeStore(id)
		if (store) undoToast($t('domains.kitchen.grocery.toast.storeRemoved', { values: { store: store.name } }), undo)
	}
	function onstore(menuItem: MenuItem, row: ListRowData) {
		if (menuItem.id === 'edit') editStore(row.id)
		else if (menuItem.id === 'website') void openExternal(kitchen.storeById(row.id)?.place?.url ?? '')
		else if (menuItem.id === 'up') moveStore(row.id, -1)
		else if (menuItem.id === 'down') moveStore(row.id, 1)
		else if (menuItem.id === 'delete') removeStore(row.id)
	}
</script>

<div class="body">
	<div class="lists">
		{#if total === 0}
			<EmptyState
				title={$t('domains.kitchen.grocery.empty.title')}
				text={$t('domains.kitchen.grocery.empty.text')}
				action={{ label: $t('domains.kitchen.grocery.empty.action'), icon: 'plus', onclick: () => addItem() }}
			/>
		{/if}
		{#each blocks as block (block.store?.id ?? '')}
			{@const key = block.store?.id ?? 'any'}
			{@const name = nameOf(block.store)}
			<DropTarget accepts={[DRAG_GROUP]} ondrop={(ids) => ids.forEach((id) => move(id, block.store?.id ?? ''))}>
				<section
					class="store"
					aria-labelledby="{uid}-{key}"
					onfocusin={() => (at = block.store?.id)}
					onfocusout={() => (at = undefined)}
				>
					<header class="store-head">
						{#if block.store}
							<Thumbnail size="md" src={kitchen.storePhotoOf(block.store)} icon="store" />
						{/if}
						<h2 class="store-title" id="{uid}-{key}" tabindex="-1">{name}</h2>
						{#if block.store && block.list?.shopDay}
							<Chip
								label={formatEventTime(block.list.shopDay, format)}
								icon="calendar"
								tone="outline"
								onclick={() => editStore(block.store!.id)}
							/>
						{/if}
						<span class="store-tools">
							{#if block.items.length}
								{@const estimate = listEstimate(block.items, kitchen.grocery.stores, block.store?.id)}
								{#if estimate.priced}
									<span class="store-count">
										{$t(
											estimate.unpriced ? 'domains.kitchen.grocery.estimateSome' : 'domains.kitchen.grocery.estimate',
											{ values: { total: formatUsd(estimate.total), count: estimate.unpriced } }
										)}
									</span>
								{/if}
							{/if}
							<IconButton
								icon="check-check"
								size="xs"
								label={$t('domains.kitchen.grocery.complete', { values: { store: name } })}
								tooltip={$t('domains.kitchen.grocery.completeHint')}
								disabled={block.checked === 0}
								onclick={() => complete(block)}
							/>
							{#if block.store}
								<IconButton
									icon="pencil"
									size="xs"
									label={$t('domains.kitchen.grocery.editStore', { values: { store: name } })}
									tooltip={$t('domains.kitchen.grocery.editStoreHint')}
									onclick={() => editStore(block.store!.id)}
								/>
							{/if}
							<IconButton
								icon="plus"
								size="xs"
								label={$t('domains.kitchen.grocery.addTo', { values: { store: name } })}
								tooltip={$t('domains.kitchen.grocery.addItem')}
								onclick={() => addItem(block.store?.id ?? '')}
							/>
						</span>
					</header>
					{#if block.items.length && block.checked === block.items.length}
						<p class="voice">{$t('domains.kitchen.grocery.allChecked')}</p>
					{/if}
					{#if block.items.length}
						<List
							rows={block.items.map((item) => toRow(item, block.store))}
							onpick={(row) => toggle(row.id)}
							oncheck={(row) => toggle(row.id)}
							{onaction}
							dragGroup={DRAG_GROUP}
							ondragstate={(on) => (dragging = on)}
						/>
					{:else if total > 0}
						<EmptyState
							inline
							title={$t('domains.kitchen.grocery.emptyList.title')}
							text={$t('domains.kitchen.grocery.emptyList.text')}
							action={{
								label: $t('domains.kitchen.grocery.addItem'),
								icon: 'plus',
								onclick: () => addItem(block.store?.id ?? ''),
							}}
						/>
					{/if}
				</section>
			</DropTarget>
		{/each}
	</div>

	<div class="side">
		<List
			header={$t('domains.kitchen.grocery.buyAgain')}
			count={kitchen.buyAgain.length}
			rows={kitchen.buyAgain.map(toAgainRow)}
			onpick={(row) => again(row.id)}
			onaction={onagain}
		>
			{#if !kitchen.buyAgain.length}
				<p class="voice none">{$t('domains.kitchen.grocery.buyAgainNone')}</p>
			{/if}
		</List>
		<List
			header={$t('domains.kitchen.grocery.stores')}
			count={storeRows.length}
			rows={storeRows}
			current={at}
			onpick={(row) => goTo(row.id)}
			onopen={(row) => editStore(row.id)}
			onaction={onstore}
		>
			{#if !storeRows.length}
				<p class="voice none">{$t('domains.kitchen.grocery.storesNone')}</p>
			{/if}
		</List>
	</div>
</div>

<GroceryItemSheet bind:this={itemSheet} />
<StoreSheet bind:this={storeSheet} />

<style>
	/* The lists on the left and the side on the right */
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
	/* One list per store: its name, its shop day when it has one, about what it costs and its actions */
	.store {
		scroll-margin-top: var(--space-4);
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
	/* A store's name, and Miscellaneous, in the display face */
	.store-title {
		margin: 0;
		font: var(--ed-t-display-md);
		letter-spacing: var(--ed-t-display-md-tracking);
		font-variation-settings: var(--ed-t-display-md-opsz);
	}
	.store-tools {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-left: auto;
	}
	/* The last tool, Add, stands over the rows' menu buttons: the card's edge, the row's padding, and half of what
	   the row's button is wider by */
	.store-tools {
		padding-right: calc(1px + var(--space-2) + var(--space-1));
	}
	/* About what the list costs (D-105), kept whole */
	.store-count {
		white-space: nowrap;
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

	.none {
		padding: var(--space-3);
	}
	/* The side stays in view while the lists scroll: Buy it again (D-92), and beneath it the stores (D-101) */
	.side {
		position: sticky;
		top: var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
		max-height: calc(100vh - var(--space-8) * 3);
		overflow-y: auto;
	}
	/* narrow page */
	@container page (max-width: 48rem) {
		/* one column: the lists, then Buy it again and the stores under them */
		.body {
			grid-template-columns: minmax(0, 1fr);
		}
		.side {
			position: static;
			max-height: none;
			overflow-y: visible;
		}
	}
</style>
