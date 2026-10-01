<script lang="ts">
	// Hearth's Grocery view (Domains/Hearth/Grocery): one list per store (D-96), all on the page at once: the store's
	// name in the display face, its shop day when it has one (D-98), the count of what is checked, Complete, Edit store and
	// Add as quiet icon buttons, and its rows. What no store has yet sits under "Miscellaneous". Every row leads with
	// its checkbox and carries an origin badge (manual, recipe, low stock, ran out); a checked row is struck through
	// and stays until its list is completed. It is a checklist: a click on a row or on its checkbox checks it off
	// (D-94), and Edit and Move to are in the row's menu. At the side, in view while the lists scroll (D-101): Buy it
	// again (D-92), what ran out, each one a click from a list; and beneath it the stores in the owner's order, each
	// row saying what is left to buy and its shop day or its last trip. A click on a store goes to its list; its menu
	// edits, moves and deletes it. Nothing is typed on the page: an item's form and a store's open in a sheet over it
	// (D-95), the same one to add as to edit, and the header's Add menu opens either through `addItem` and `addStore`
	// (D-102). An item added with no store picked is filed where it was last bought (D-97).
	import {
		Button,
		Chip,
		EmptyState,
		Field,
		IconButton,
		List,
		Sheet,
		type ListRowData,
		type MenuItem,
	} from '@eden/ui-kit'
	import { openExternal } from '@eden/shared/api'
	import { STORE_SELLS, shopDayMorning } from '@eden/shared/domains/kitchen'
	import { locale, t } from '@eden/shared/i18n'
	import { settings } from '@eden/shared/settings'
	import { undoToast } from '$lib/shell/undo'
	import { daysFromToday, daysSince, formatEventTime, todayIso } from '@eden/shared/dates'
	import { categoryGlyph } from '../words'
	import {
		kitchen,
		type GroceryBlock,
		type GroceryItem,
		type GroceryStore,
		type StockItem,
		type StoreSells,
		type Undo,
	} from '../store.svelte'

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
		chips: item.qty ? [{ label: item.qty, mono: true }] : [],
		badges: [{ kind: 'origin' as const, label: originLabel(item) }],
		done: item.done,
		checkable: true,
		actions: actionsFor(item, store),
	})
	const total = $derived(kitchen.grocery.items.length)

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
		const { store, undo } = kitchen.addToGrocery(stocked.name, '', 'ran-out', undefined, target)
		landed(stocked.name, store, undo)
	}
	function onagain(menuItem: MenuItem, row: ListRowData) {
		const action = menuItem.id ?? ''
		if (action.startsWith('again:')) return again(row.id, action.slice('again:'.length))
		if (action !== 'forget') return
		const { item, undo } = kitchen.removeStock(row.id)
		if (item) undoToast($t('domains.kitchen.stock.toast.removed', { values: { name: item.name } }), undo)
	}

	// An item's form, in its sheet (D-95), to add with or to edit; saved as one change. `store` is the store's id,
	// '' for the unfiled list; none, while adding, is no store picked: the item goes where it was last bought (D-97).
	type ItemForm = { name: string; qty: string; store: string | undefined; note: string }
	let itemOpen = $state(false)
	let editing = $state<string>()
	let form = $state<ItemForm>({ name: '', qty: '', store: undefined, note: '' })
	const edited = $derived(kitchen.grocery.items.find((item) => item.id === editing))
	/**
	 * Opens the item's form blank: the header's Add item and the empty state's action with no store picked, a
	 * list's own Add with its store picked ('' for the unfiled list).
	 */
	export function addItem(store?: string) {
		form = { name: '', qty: '', store, note: '' }
		editing = undefined
		itemOpen = true
	}
	function create() {
		const target = form.store === undefined ? undefined : form.store || null
		const note = form.note.trim() || undefined
		const { item, store, undo } = kitchen.addToGrocery(form.name.trim(), form.qty.trim(), 'manual', note, target)
		landed(item.name, store, undo)
		itemOpen = false
	}
	function edit(id: string) {
		const item = kitchen.grocery.items.find((entry) => entry.id === id)
		if (!item) return
		form = { name: item.name, qty: item.qty, store: kitchen.storeOf(item)?.id ?? '', note: item.note ?? '' }
		editing = id
		itemOpen = true
	}
	function save(item: GroceryItem) {
		const { undo } = kitchen.updateGrocery(item.id, {
			name: form.name.trim(),
			qty: form.qty.trim(),
			note: form.note.trim() || undefined,
			storeId: form.store || null,
		})
		undoToast($t('domains.kitchen.grocery.toast.edited', { values: { name: form.name.trim() || item.name } }), undo)
		itemOpen = false
	}

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
		storeOpen = false
		if (store) undoToast($t('domains.kitchen.grocery.toast.storeRemoved', { values: { store: store.name } }), undo)
	}
	function onstore(menuItem: MenuItem, row: ListRowData) {
		if (menuItem.id === 'edit') editStore(row.id)
		else if (menuItem.id === 'website') void openExternal(kitchen.storeById(row.id)?.place?.url ?? '')
		else if (menuItem.id === 'up') moveStore(row.id, -1)
		else if (menuItem.id === 'down') moveStore(row.id, 1)
		else if (menuItem.id === 'delete') removeStore(row.id)
	}

	// A store's form, in its sheet (D-95): its name, what it sells, where it is (D-101), a note and its shop day,
	// which is optional (D-98).
	const blankPlace = () => ({
		name: '',
		sells: ['grocery'] as StoreSells[],
		address: '',
		url: '',
		phone: '',
		note: '',
		date: '',
		time: '',
	})
	let storeOpen = $state(false)
	let storeId = $state<string>()
	let place = $state(blankPlace())
	/** Opens the store's form blank: the header's Add store. */
	export function addStore() {
		place = blankPlace()
		storeId = undefined
		storeOpen = true
	}
	const placeFields = () => ({
		sells: STORE_SELLS.filter((kind) => place.sells.includes(kind)),
		where: { address: place.address.trim(), url: place.url.trim(), phone: place.phone.trim() },
		note: place.note.trim(),
		shopDay: place.date ? `${place.date}T${place.time || '10:00'}:00` : undefined,
	})
	/** Add in the store's form: the store with all its form held, and its shop day, as one undo. */
	function createStore() {
		const { sells, where, note, shopDay } = placeFields()
		const { store, created, undo } = kitchen.addStore(place.name, sells, { note, place: where })
		storeOpen = false
		if (!created) {
			undoToast($t('domains.kitchen.grocery.toast.storeExists', { values: { store: store.name } }), undo)
			return
		}
		const undos = [undo]
		if (shopDay) undos.push(kitchen.setShopDay(store.id, shopDay))
		undoToast($t('domains.kitchen.grocery.toast.storeAdded', { values: { store: store.name } }), () =>
			undos.reverse().forEach((entry) => entry())
		)
	}
	const shown = $derived(kitchen.storeById(storeId))
	const shopDayOf = (id: string) => kitchen.grocery.lists.find((list) => list.storeId === id)?.shopDay
	function editStore(id: string) {
		const store = kitchen.storeById(id)
		if (!store) return
		const shopDay = shopDayOf(id)
		place = {
			name: store.name,
			sells: [...store.sells],
			address: store.place?.address ?? '',
			url: store.place?.url ?? '',
			phone: store.place?.phone ?? '',
			note: store.note ?? '',
			date: shopDay?.slice(0, 10) ?? '',
			time: shopDay?.slice(11, 16) ?? '',
		}
		storeId = id
		storeOpen = true
	}
	function saveStore(store: GroceryStore) {
		const undos: Undo[] = []
		const name = place.name.trim() || store.name
		const { sells, where, note, shopDay } = placeFields()
		const same =
			name === store.name &&
			sells.join() === store.sells.join() &&
			note === (store.note ?? '') &&
			where.address === (store.place?.address ?? '') &&
			where.url === (store.place?.url ?? '') &&
			where.phone === (store.place?.phone ?? '')
		if (!same) undos.push(kitchen.updateStore(store.id, { name, sells, note, place: where }).undo)
		const moved = shopDay !== shopDayOf(store.id)
		if (moved) undos.push(kitchen.setShopDay(store.id, shopDay))
		storeOpen = false
		if (!undos.length) return
		// a morning already past has no reminder to promise
		const late = (shopDayMorning(shopDay)?.at ?? Infinity) <= Date.now()
		const key = !moved ? 'storeSaved' : !shopDay ? 'shopDayCleared' : late ? 'shopDaySetLate' : 'shopDaySet'
		undoToast($t(`domains.kitchen.grocery.toast.${key}`, { values: { store: name } }), () =>
			undos.reverse().forEach((undo) => undo())
		)
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
		{#each kitchen.blocks as block (block.store?.id ?? '')}
			{@const key = block.store?.id ?? 'any'}
			{@const name = nameOf(block.store)}
			<section
				class="store"
				aria-labelledby="{uid}-{key}"
				onfocusin={() => (at = block.store?.id)}
				onfocusout={() => (at = undefined)}
			>
				<header class="store-head">
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
							<span class="store-count">
								{$t('domains.kitchen.grocery.checked', {
									values: { checked: block.checked, total: block.items.length },
								})}
							</span>
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

<Sheet bind:open={itemOpen} size="sm" labelledby="{uid}-item-title">
	{#snippet header()}
		<h2 class="title" id="{uid}-item-title">
			{$t(edited ? 'domains.kitchen.grocery.pane.editing' : 'domains.kitchen.grocery.addItem')}
		</h2>
	{/snippet}
	{#if edited || !editing}
		<form
			class="form"
			id="{uid}-item-form"
			onsubmit={(event) => {
				event.preventDefault()
				if (edited) save(edited)
				else create()
			}}
		>
			<Field label={$t('domains.kitchen.grocery.pane.name')} bind:value={form.name} />
			<Field label={$t('domains.kitchen.grocery.pane.quantity')} bind:value={form.qty} mono />
			<div class="group" role="group" aria-labelledby="{uid}-where">
				<span class="group-label" id="{uid}-where">{$t('domains.kitchen.grocery.pane.store')}</span>
				<div class="chips">
					{#each [...kitchen.grocery.stores.map( (store) => ({ id: store.id, label: store.name }) ), { id: '', label: anyStore }] as entry (entry.id)}
						<Chip
							label={entry.label}
							selectable
							tone={form.store === entry.id ? 'accent' : 'outline'}
							bind:selected={() => form.store === entry.id, (on) => (form.store = on || edited ? entry.id : undefined)}
						/>
					{/each}
				</div>
				{#if !edited}
					<p class="help">{$t('domains.kitchen.grocery.pane.storeHelp')}</p>
				{/if}
			</div>
			<Field label={$t('domains.kitchen.grocery.pane.note')} bind:value={form.note} />
		</form>
	{/if}
	{#snippet footer()}
		<Button label={$t('common.cancel')} variant="quiet" onclick={() => (itemOpen = false)} />
		<Button
			label={$t(edited ? 'common.save' : 'domains.kitchen.grocery.add')}
			variant="primary"
			type="submit"
			form="{uid}-item-form"
			disabled={(!edited && !!editing) || !form.name.trim()}
		/>
	{/snippet}
</Sheet>

<Sheet bind:open={storeOpen} size="sm" labelledby="{uid}-store-title">
	{#snippet header()}
		<h2 class="title" id="{uid}-store-title">
			{$t(shown ? 'domains.kitchen.grocery.pane.editingStore' : 'domains.kitchen.grocery.addStore')}
		</h2>
	{/snippet}
	{#if shown || !storeId}
		<form
			class="form"
			id="{uid}-store-form"
			onsubmit={(event) => {
				event.preventDefault()
				if (shown) saveStore(shown)
				else createStore()
			}}
		>
			<Field label={$t('domains.kitchen.grocery.pane.name')} bind:value={place.name} />
			<div class="group" role="group" aria-labelledby="{uid}-sells">
				<span class="group-label" id="{uid}-sells">{$t('domains.kitchen.grocery.pane.sells')}</span>
				<div class="chips">
					{#each STORE_SELLS as kind (kind)}
						<Chip
							label={$t(`domains.kitchen.grocery.sells.${kind}`)}
							selectable
							tone={place.sells.includes(kind) ? 'accent' : 'outline'}
							bind:selected={
								() => place.sells.includes(kind),
								(on) => (place.sells = on ? [...place.sells, kind] : place.sells.filter((entry) => entry !== kind))
							}
						/>
					{/each}
				</div>
			</div>
			<Field label={$t('domains.kitchen.grocery.pane.address')} bind:value={place.address} />
			<div class="pair">
				<Field label={$t('domains.kitchen.grocery.pane.website')} type="url" bind:value={place.url} />
				<Field label={$t('domains.kitchen.grocery.pane.phone')} type="tel" bind:value={place.phone} />
			</div>
			<Field label={$t('domains.kitchen.grocery.pane.storeNote')} multiline bind:value={place.note} />
			<div class="pair">
				<Field label={$t('domains.kitchen.grocery.pane.shopDay')} type="date" bind:value={place.date} />
				<Field
					label={$t('domains.kitchen.grocery.pane.shopTime')}
					type="time"
					bind:value={place.time}
					disabled={!place.date}
				/>
			</div>
			<div class="chips">
				<Chip
					label={$t('domains.kitchen.grocery.pane.today')}
					tone="outline"
					onclick={() => (place.date = todayIso())}
				/>
				<Chip
					label={$t('domains.kitchen.grocery.pane.tomorrow')}
					tone="outline"
					onclick={() => (place.date = daysFromToday(1))}
				/>
				{#if place.date}
					<Chip
						label={$t('domains.kitchen.grocery.pane.noShopDay')}
						tone="outline"
						onclick={() => {
							place.date = ''
							place.time = ''
						}}
					/>
				{/if}
			</div>
			<p class="help">{$t('domains.kitchen.grocery.pane.shopDayHelp')}</p>
		</form>
	{/if}
	{#snippet footer()}
		{#if shown}
			<Button
				label={$t('domains.kitchen.grocery.pane.deleteStore')}
				variant="danger"
				onclick={() => removeStore(shown.id)}
			/>
		{/if}
		<Button label={$t('common.cancel')} variant="quiet" onclick={() => (storeOpen = false)} />
		<Button
			label={$t(shown ? 'common.save' : 'domains.kitchen.grocery.add')}
			variant="primary"
			type="submit"
			form="{uid}-store-form"
			disabled={(!shown && !!storeId) || !place.name.trim()}
		/>
	{/snippet}
</Sheet>

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
	/* One list per store: its name, its shop day when it has one, the count of what is checked and its two actions */
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
	.store-count {
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
	.title {
		margin: 0;
		font: var(--ed-t-title);
		letter-spacing: var(--ed-t-title-tracking);
		font-variation-settings: var(--ed-t-title-opsz);
	}
	.group {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-1);
	}
	.group-label {
		font: var(--ed-t-label);
		letter-spacing: var(--ed-t-label-tracking);
		color: var(--text-secondary);
	}
	.chips {
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
