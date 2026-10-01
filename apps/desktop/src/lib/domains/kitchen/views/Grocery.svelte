<script lang="ts">
	// Hearth's Grocery view (Domains/Hearth/Grocery): a quick-add line that files an item where it was last bought
	// (D-97), then one list per store (D-96), all on the page at once: the store's name, its shop day when it has one
	// (D-98), the count of what is checked, Complete and Edit store as quiet icon buttons, its rows and an add line of
	// its own. What no store has yet sits under "Miscellaneous". Every row leads with its checkbox and carries an origin
	// badge (manual, recipe, low stock, ran out); a checked row is struck through and stays until its list is completed.
	// It is a checklist: a click on a row or on its checkbox checks it off (D-94), and Edit and Move to are in the row's
	// menu. The pane on the right is the stores; an item's form and a store's open in a sheet over the page (D-95).
	// Beneath the lists sits Buy it again (D-92): what ran out, each one a click from a list.
	import {
		Button,
		Chip,
		EmptyState,
		Field,
		IconButton,
		List,
		QuickAdd,
		Sheet,
		type ListRowData,
		type MenuItem,
	} from '@eden/ui-kit'
	import { STORE_SELLS, shopDayMorning } from '@eden/shared/domains/kitchen'
	import { locale, t } from '@eden/shared/i18n'
	import { settings } from '@eden/shared/settings'
	import { undoToast } from '$lib/shell/undo'
	import { daysFromToday, formatEventTime, todayIso } from '@eden/shared/dates'
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

	type Props = {
		/** The id the page's Add action focuses. */
		quickAddId: string
		/** The id the page's Add a store action focuses. */
		storeAddId: string
		/** The empty state's primary action: focus the quick-add line. */
		onadd: () => void
	}
	let { quickAddId, storeAddId, onadd }: Props = $props()

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
	/** A line added: from the page's own field it is filed where it was last bought, from a list's field on that list. */
	function add(text: string, storeId?: string) {
		const { item, store, undo } = kitchen.addGrocery(text, storeId)
		landed(item.name, store, undo)
	}

	// An item's form, in its sheet (D-95); saved as one change. `store` is the store's id, '' for the unfiled list.
	let itemOpen = $state(false)
	let editing = $state<string>()
	let form = $state({ name: '', qty: '', store: '', note: '' })
	const edited = $derived(kitchen.grocery.items.find((item) => item.id === editing))
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

	// The stores, in the pane: each opens its form, and a line adds one.
	const storeRows = $derived<ListRowData[]>(
		kitchen.grocery.stores.map((store) => ({
			id: store.id,
			primary: store.name,
			chips: store.sells.map((kind) => ({ label: $t(`domains.kitchen.grocery.sells.${kind}`) })),
			actions: [
				{ id: 'edit', label: $t('domains.kitchen.grocery.actions.edit'), icon: 'pencil' as const },
				{
					id: 'delete',
					label: $t('domains.kitchen.grocery.actions.delete'),
					icon: 'trash' as const,
					destructive: true,
				},
			],
		}))
	)
	function addStore(text: string) {
		const { store, created, undo } = kitchen.addStore(text)
		const key = created ? 'domains.kitchen.grocery.toast.storeAdded' : 'domains.kitchen.grocery.toast.storeExists'
		undoToast($t(key, { values: { store: store.name } }), undo)
	}
	function removeStore(id: string) {
		const { store, undo } = kitchen.removeStore(id)
		storeOpen = false
		if (store) undoToast($t('domains.kitchen.grocery.toast.storeRemoved', { values: { store: store.name } }), undo)
	}
	function onstore(menuItem: MenuItem, row: ListRowData) {
		if (menuItem.id === 'edit') editStore(row.id)
		else if (menuItem.id === 'delete') removeStore(row.id)
	}

	// A store's form, in its sheet (D-95): its name, what it sells and its shop day, which is optional (D-98).
	let storeOpen = $state(false)
	let storeId = $state<string>()
	let place = $state({ name: '', sells: [] as StoreSells[], date: '', time: '' })
	const shown = $derived(kitchen.storeById(storeId))
	const shopDayOf = (id: string) => kitchen.grocery.lists.find((list) => list.storeId === id)?.shopDay
	function editStore(id: string) {
		const store = kitchen.storeById(id)
		if (!store) return
		const shopDay = shopDayOf(id)
		place = {
			name: store.name,
			sells: [...store.sells],
			date: shopDay?.slice(0, 10) ?? '',
			time: shopDay?.slice(11, 16) ?? '',
		}
		storeId = id
		storeOpen = true
	}
	function saveStore(store: GroceryStore) {
		const undos: Undo[] = []
		const name = place.name.trim() || store.name
		const sells = STORE_SELLS.filter((kind) => place.sells.includes(kind))
		if (name !== store.name || sells.join() !== store.sells.join()) {
			undos.push(kitchen.updateStore(store.id, { name, sells }).undo)
		}
		const shopDay = place.date ? `${place.date}T${place.time || '10:00'}:00` : undefined
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
		<QuickAdd id={quickAddId} placeholder={$t('domains.kitchen.grocery.addPlaceholder')} onadd={(text) => add(text)} />
		{#if total === 0}
			<EmptyState
				title={$t('domains.kitchen.grocery.empty.title')}
				text={$t('domains.kitchen.grocery.empty.text')}
				action={{ label: $t('domains.kitchen.grocery.empty.action'), icon: 'plus', onclick: onadd }}
			/>
		{/if}
		{#each kitchen.blocks as block (block.store?.id ?? '')}
			{@const key = block.store?.id ?? 'any'}
			{@const name = nameOf(block.store)}
			<section class="store" aria-labelledby="{uid}-{key}">
				<header class="store-head">
					<h2 class="store-title" id="{uid}-{key}">{name}</h2>
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
				{/if}
				{#if block.store}
					<QuickAdd
						placeholder={$t('domains.kitchen.grocery.addTo', { values: { store: name } })}
						onadd={(text) => add(text, block.store!.id)}
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
	</div>

	<aside class="pane" aria-labelledby="{uid}-pane">
		<h2 class="pane-title" id="{uid}-pane">{$t('domains.kitchen.grocery.stores')}</h2>
		{#if storeRows.length}
			<List rows={storeRows} onpick={(row) => editStore(row.id)} onaction={onstore} />
		{/if}
		<QuickAdd
			id={storeAddId}
			placeholder={$t('domains.kitchen.grocery.addStore')}
			parse={() => []}
			onadd={(text) => addStore(text)}
		/>
		<p class="help">{$t('domains.kitchen.grocery.storesHelp')}</p>
	</aside>
</div>

<Sheet bind:open={itemOpen} size="sm" labelledby="{uid}-item-title">
	{#snippet header()}
		<h2 class="title" id="{uid}-item-title">{$t('domains.kitchen.grocery.pane.editing')}</h2>
	{/snippet}
	{#if edited}
		<form
			class="form"
			id="{uid}-item-form"
			onsubmit={(event) => {
				event.preventDefault()
				save(edited)
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
							bind:selected={() => form.store === entry.id, () => (form.store = entry.id)}
						/>
					{/each}
				</div>
			</div>
			<Field label={$t('domains.kitchen.grocery.pane.note')} bind:value={form.note} />
		</form>
	{/if}
	{#snippet footer()}
		<Button label={$t('common.cancel')} variant="quiet" onclick={() => (itemOpen = false)} />
		<Button
			label={$t('common.save')}
			variant="primary"
			type="submit"
			form="{uid}-item-form"
			disabled={!edited || !form.name.trim()}
		/>
	{/snippet}
</Sheet>

<Sheet bind:open={storeOpen} size="sm" labelledby="{uid}-store-title">
	{#snippet header()}
		<h2 class="title" id="{uid}-store-title">{$t('domains.kitchen.grocery.pane.editingStore')}</h2>
	{/snippet}
	{#if shown}
		<form
			class="form"
			id="{uid}-store-form"
			onsubmit={(event) => {
				event.preventDefault()
				saveStore(shown)
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
				variant="quiet"
				icon="trash"
				onclick={() => removeStore(shown.id)}
			/>
		{/if}
		<Button label={$t('common.cancel')} variant="quiet" onclick={() => (storeOpen = false)} />
		<Button
			label={$t('common.save')}
			variant="primary"
			type="submit"
			form="{uid}-store-form"
			disabled={!shown || !place.name.trim()}
		/>
	{/snippet}
</Sheet>

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
	/* One list per store: its name, its shop day when it has one, the count of what is checked and its two actions */
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
	.store-tools {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-left: auto;
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

	/* The pane: the stores; it stays in view while the lists scroll */
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
