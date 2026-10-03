<script lang="ts">
	// Hearth's Grocery on the phone (product/domains/kitchen.md, "Mobile"; D-176), after the phone
	// canvas of Domains/Hearth/Grocery, for a list read one-handed in a shop: one list per store (D-96), every one on
	// the page, with a row of chips under the header to stand in one store (All, each store with what is left on it,
	// Miscellaneous), held for the session. A tap anywhere on a row checks it off or back on, with no toast: the row
	// is its own undo; a swipe to the right does the same, a swipe to the left deletes it with an undo. The ⋯ at the
	// row's end holds Edit, Move to and Delete. Checked rows keep their place until the list is completed, from the
	// list's head or from the button under it. Under the lists, Buy it again (D-92) and the stores (D-101), each a
	// card: a tap on a store stands in it. The item's form and the store's are the shared sheets (D-95), the same
	// ones desktop opens. Nothing is dragged on the phone.
	import {
		Button,
		Chip,
		EmptyState,
		IconButton,
		List,
		Thumbnail,
		type ListRowData,
		type MenuItem,
		type SwipeLeading,
		type SwipeTrailing,
	} from '@eden/ui-kit'
	import { openExternal } from '@eden/shared/api'
	import { daysSince, formatEventTime } from '@eden/shared/dates'
	import {
		categoryGlyph,
		groceryLineOf,
		kitchen,
		listEstimate,
		type GroceryBlock,
		type GroceryItem,
		type GroceryStore,
		type StockItem,
		type Undo,
	} from '@eden/shared/domains/kitchen'
	import GroceryItemSheet from '@eden/shared/domains/kitchen/views/GroceryItemSheet.svelte'
	import StoreSheet from '@eden/shared/domains/kitchen/views/StoreSheet.svelte'
	import { formatUsd } from '@eden/shared/gardener'
	import { locale, t } from '@eden/shared/i18n'
	import { settings } from '@eden/shared/settings'
	import { undoToast } from '@eden/shared/shell'
	import { groceryStand } from '../stand.svelte'

	const uid = $props.id()
	const lang = $derived($locale ?? 'en')
	const format = $derived({ lang, clock: settings.clock })
	const anyStore = $derived($t('domains.kitchen.grocery.anyStore'))
	const nameOf = (store: GroceryStore | undefined) => store?.name ?? anyStore
	/** A block's key among the chips: the store's id, '' for Miscellaneous. */
	const keyOf = (block: GroceryBlock) => block.store?.id ?? ''

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
	// The row's own menu, its ⋯: a tap checks, so Check is not in it.
	const actionsFor = (store: GroceryStore | undefined): MenuItem[] => [
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
		actions: actionsFor(store),
	})
	const total = $derived(kitchen.grocery.items.length)

	// The store the page stands in, held for the session: one that has gone shows every list again.
	const standing = $derived(
		groceryStand.store === null || kitchen.blocks.some((block) => keyOf(block) === groceryStand.store)
			? groceryStand.store
			: null
	)
	const blocks = $derived(
		standing === null ? kitchen.blocks : kitchen.blocks.filter((block) => keyOf(block) === standing)
	)
	function stand(key: string | null) {
		groceryStand.store = key
	}
	/** A store picked from the stores' card: the page stands in it, from the top. */
	function goTo(id: string) {
		stand(id)
		window.scrollTo({ top: 0 })
	}

	/** A check makes no toast: the row is its own undo (D-176). */
	function toggle(id: string) {
		kitchen.toggleGrocery(id)
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
		if (action === 'edit') itemSheet?.edit(row.id)
		else if (action === 'delete') remove(row.id)
		else if (action.startsWith('move:')) move(row.id, action.slice('move:'.length))
	}
	const checkSwipe = (row: ListRowData): SwipeLeading => ({
		label: $t(row.done ? 'domains.kitchen.grocery.actions.uncheck' : 'domains.kitchen.grocery.actions.check'),
		icon: 'check',
		onaction: () => toggle(row.id),
	})
	const deleteSwipe = (row: ListRowData): SwipeTrailing => ({
		label: $t('domains.kitchen.grocery.actions.delete'),
		icon: 'trash',
		onaction: () => remove(row.id),
	})
	function complete(block: GroceryBlock) {
		if (!block.list) return
		const { count, undo } = kitchen.completeList(block.list.id)
		if (!count) return
		undoToast($t('domains.kitchen.grocery.toast.completed', { values: { count, store: nameOf(block.store) } }), undo)
	}

	/** The toast of an item that landed on a list: it names the store, or says only that it was added. */
	function landed(name: string, store: GroceryStore | undefined, undo: Undo) {
		const message = store
			? $t('domains.kitchen.grocery.toast.addedTo', { values: { name, store: store.name } })
			: $t('domains.kitchen.grocery.toast.added', { values: { name } })
		undoToast(message, undo)
	}

	// Buy it again: what ran out and is not on a list. A tap puts it on the list of the store it was last bought at,
	// whichever store the page stands in (D-97); its menu names a store, or forgets the item.
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
		const { store, undo } = kitchen.addToGrocery(groceryLineOf(stocked), 'ran-out', target)
		landed(stocked.name, store, undo)
	}
	function onagain(menuItem: MenuItem, row: ListRowData) {
		const action = menuItem.id ?? ''
		if (action.startsWith('again:')) return again(row.id, action.slice('again:'.length))
		if (action !== 'forget') return
		const { item, undo } = kitchen.removeStock(row.id)
		if (item) undoToast($t('domains.kitchen.stock.toast.removed', { values: { name: item.name } }), undo)
	}

	// The stores, in the owner's order, under the lists.
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
						? [{ label: $t('domains.kitchen.grocery.shopped', { values: { when: dayAgo(store.shoppedAt) } }) }]
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
	function onstore(menuItem: MenuItem, row: ListRowData) {
		if (menuItem.id === 'edit') storeSheet?.edit(row.id)
		else if (menuItem.id === 'website') void openExternal(kitchen.storeById(row.id)?.place?.url ?? '')
		else if (menuItem.id === 'up' || menuItem.id === 'down') {
			const { store, undo } = kitchen.moveStore(row.id, menuItem.id === 'up' ? -1 : 1)
			if (store) undoToast($t('domains.kitchen.grocery.toast.storeMoved', { values: { store: store.name } }), undo)
		} else if (menuItem.id === 'delete') {
			const { store, undo } = kitchen.removeStore(row.id)
			if (store) undoToast($t('domains.kitchen.grocery.toast.storeRemoved', { values: { store: store.name } }), undo)
		}
	}

	let itemSheet = $state<GroceryItemSheet>()
	let storeSheet = $state<StoreSheet>()
	/** The header's Add item: no store picked, or the store the page stands in. */
	export function addItem() {
		itemSheet?.add(standing ?? undefined)
	}
	/** The header's Add store. */
	export function addStore() {
		storeSheet?.add()
	}
</script>

<div class="body">
	{#if kitchen.blocks.length > 1}
		<div class="stand" role="group" aria-label={$t('domains.kitchen.grocery.storeFilter')}>
			<Chip
				label={$t('domains.kitchen.grocery.allStores')}
				selectable
				tone={standing === null ? 'accent' : 'outline'}
				bind:selected={() => standing === null, () => stand(null)}
			/>
			{#each kitchen.blocks as block (keyOf(block))}
				<Chip
					label={nameOf(block.store)}
					count={block.left || undefined}
					selectable
					tone={standing === keyOf(block) ? 'accent' : 'outline'}
					bind:selected={() => standing === keyOf(block), (on) => stand(on ? keyOf(block) : null)}
				/>
			{/each}
		</div>
	{/if}
	{#if total === 0}
		<EmptyState
			title={$t('domains.kitchen.grocery.empty.title')}
			text={$t('domains.kitchen.grocery.empty.text')}
			action={{ label: $t('domains.kitchen.grocery.empty.action'), icon: 'plus', onclick: () => itemSheet?.add() }}
		/>
	{/if}
	{#each blocks as block (keyOf(block))}
		{@const key = block.store?.id ?? 'any'}
		{@const name = nameOf(block.store)}
		<section class="store" aria-labelledby="{uid}-{key}">
			<header class="store-head">
				{#if block.store}
					<Thumbnail size="md" src={kitchen.storePhotoOf(block.store)} icon="store" />
				{/if}
				<h2 class="store-title" id="{uid}-{key}">{name}</h2>
				{#if block.store && block.list?.shopDay}
					<Chip
						label={formatEventTime(block.list.shopDay, format)}
						icon="calendar"
						tone="outline"
						onclick={() => storeSheet?.edit(block.store!.id)}
					/>
				{/if}
				<span class="store-tools">
					{#if block.items.length}
						{@const estimate = listEstimate(block.items, kitchen.grocery.stores, block.store?.id)}
						{#if estimate.priced}
							<span class="store-count">
								{$t(estimate.unpriced ? 'domains.kitchen.grocery.estimateSome' : 'domains.kitchen.grocery.estimate', {
									values: { total: formatUsd(estimate.total), count: estimate.unpriced },
								})}
							</span>
						{/if}
					{/if}
					<IconButton
						icon="check-check"
						size="xs"
						label={$t('domains.kitchen.grocery.complete', { values: { store: name } })}
						disabled={block.checked === 0}
						onclick={() => complete(block)}
					/>
					{#if block.store}
						<IconButton
							icon="pencil"
							size="xs"
							label={$t('domains.kitchen.grocery.editStore', { values: { store: name } })}
							onclick={() => storeSheet?.edit(block.store!.id)}
						/>
					{/if}
					<IconButton
						icon="plus"
						size="xs"
						label={$t('domains.kitchen.grocery.addTo', { values: { store: name } })}
						onclick={() => itemSheet?.add(block.store?.id ?? '')}
					/>
				</span>
			</header>
			{#if block.items.length && block.checked === block.items.length}
				<p class="voice">{$t('domains.kitchen.grocery.allChecked')}</p>
			{/if}
			{#if block.items.length}
				<List
					labelledby="{uid}-{key}"
					rows={block.items.map((item) => toRow(item, block.store))}
					onpick={(row) => toggle(row.id)}
					oncheck={(row) => toggle(row.id)}
					leading={checkSwipe}
					trailing={deleteSwipe}
					{onaction}
				/>
				{#if block.checked}
					<!-- at the foot of the list, where the thumb is once the shop is done -->
					<Button
						label={$t('domains.kitchen.grocery.complete', { values: { store: name } })}
						icon="check-check"
						onclick={() => complete(block)}
					/>
				{/if}
			{:else if total > 0}
				<EmptyState
					inline
					title={$t('domains.kitchen.grocery.emptyList.title')}
					text={$t('domains.kitchen.grocery.emptyList.text')}
					action={{
						label: $t('domains.kitchen.grocery.addItem'),
						icon: 'plus',
						onclick: () => itemSheet?.add(block.store?.id ?? ''),
					}}
				/>
			{/if}
		</section>
	{/each}

	{#if kitchen.buyAgain.length}
		<List
			header={$t('domains.kitchen.grocery.buyAgain')}
			count={kitchen.buyAgain.length}
			rows={kitchen.buyAgain.map(toAgainRow)}
			onpick={(row) => again(row.id)}
			onaction={onagain}
		/>
	{/if}
	{#if storeRows.length}
		<List
			header={$t('domains.kitchen.grocery.stores')}
			count={storeRows.length}
			rows={storeRows}
			current={standing ?? undefined}
			onpick={(row) => goTo(row.id)}
			onaction={onstore}
		/>
	{/if}
</div>

<GroceryItemSheet bind:this={itemSheet} />
<StoreSheet bind:this={storeSheet} />

<style>
	.body {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding: 0 var(--ed-gutter);
	}
	/* The chips to stand in one store, wrapping */
	.stand {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	/* One list per store: its name, its shop day when it has one, about what it costs and its actions */
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
		font: var(--ed-t-display-md);
		letter-spacing: var(--ed-t-display-md-tracking);
		font-variation-settings: var(--ed-t-display-md-opsz);
	}
	.store-tools {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-left: auto;
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
</style>
