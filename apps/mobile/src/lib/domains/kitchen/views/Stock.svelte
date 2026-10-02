<script lang="ts">
	// Hearth's Stock on the phone (product/domains/kitchen.md, "Mobile"; D-TBD(phone-stock)), after the phone canvas
	// of Domains/Hearth/Stock: a card per location that holds something, sorted as the header's chip says, then what
	// ran out lately (D-92). A row swipes: to the right Ran out, to the left Delete, each with an undo; in Ran out the
	// swipe to the right puts the item on a grocery list instead. A tap opens the item in a sheet (the shared
	// StockDetail), where Edit, Move to and Add to grocery are; a held press offers the two swipes as a menu. Select
	// in a location's card starts its select mode (D-41): Move, Add to grocery, Ran out and Delete act on what is
	// selected as one write with one undo, and Done ends it. The item's form is the shared StockEditSheet (D-95,
	// D-109). Nothing is dragged and nothing is dropped on the phone.
	import {
		EmptyState,
		IconButton,
		List,
		Menu,
		Sheet,
		type ListRowData,
		type SwipeLeading,
		type SwipeTrailing,
	} from '@eden/ui-kit'
	import { formatDay } from '@eden/shared/dates'
	import {
		categoryGlyph,
		groceryLineOf,
		kitchen,
		stockMoveItems,
		type StockItem,
		type StockLocation,
		type StockSort,
	} from '@eden/shared/domains/kitchen'
	import StockDetail from '@eden/shared/domains/kitchen/views/StockDetail.svelte'
	import StockEditSheet from '@eden/shared/domains/kitchen/views/StockEditSheet.svelte'
	import { t } from '@eden/shared/i18n'
	import { holdBack } from '@eden/shared/navigation'
	import { undoToast } from '@eden/shared/shell'
	import { chrome } from '$lib/shell/chrome.svelte'

	type Props = {
		/** The Expiring filter: only what is dated within the next two days. */
		expiring?: boolean
		/** The Low stock filter. */
		lowStock?: boolean
		/** How each location is ordered. */
		sort?: StockSort
		/** Take stock from photos of the shelves, the empty state's primary action. */
		ontakestock: () => void
	}
	let { expiring = false, lowStock = false, sort = 'expiry', ontakestock }: Props = $props()

	const locationLabel = (location: StockLocation) => $t(`domains.kitchen.stock.locations.${location}`)
	const quantity = (item: StockItem) => (item.unit ? `${item.qty} ${item.unit}` : item.qty)
	const sizeChip = (item: StockItem) => (item.size ? [{ id: 'size', label: item.size, mono: true }] : [])

	// The rows carry no menu of their own: the two swipes are their menu under a held press, and a tap opens the item.
	const toRow = (item: StockItem): ListRowData => ({
		id: item.id,
		primary: item.name,
		secondary: item.brand,
		thumbnail: kitchen.photoOf(item),
		icon: categoryGlyph(item.category),
		tile: true,
		hint: item.tip,
		chips: [{ label: quantity(item), mono: true }, ...sizeChip(item)],
		badges: [
			...(kitchen.low(item) ? [{ kind: 'warning' as const, label: $t('domains.kitchen.stock.badge.lowStock') }] : []),
			...(item.estimated ? [{ kind: 'estimated' as const }] : []),
		],
		meta: item.expiry ? formatDay(item.expiry) : undefined,
		metaWarn: kitchen.soon(item),
	})
	/** A row of Ran out: where the item was kept, and the day it ran out. */
	const toOutRow = (item: StockItem): ListRowData => ({
		id: item.id,
		primary: item.name,
		secondary: item.brand,
		thumbnail: kitchen.photoOf(item),
		icon: categoryGlyph(item.category),
		tile: true,
		chips: [{ label: locationLabel(item.location) }, ...sizeChip(item)],
		meta: item.outAt ? formatDay(item.outAt.slice(0, 10)) : undefined,
	})

	/** The locations that hold something under the filters; an empty one is not drawn. */
	const sections = $derived(
		kitchen.sections((item) => (!expiring || kitchen.soon(item)) && (!lowStock || kitchen.low(item)), sort)
	)
	/** What ran out lately; the Expiring filter hides it, the Low stock filter keeps what has a threshold. */
	const ranOut = $derived(expiring ? [] : kitchen.recentlyOut.filter((item) => !lowStock || kitchen.low(item)))

	function addToGrocery(item: StockItem) {
		return kitchen.addToGrocery(
			groceryLineOf(item),
			kitchen.out(item) ? 'ran-out' : kitchen.low(item) ? 'low-stock' : 'manual'
		)
	}
	/** An action on one item: the detail sheet's, and the swipes'. Each write has its undo. */
	function act(action: string, id: string) {
		const item = kitchen.stockById(id)
		if (!item) return
		if (action === 'edit') {
			// the form takes the detail's place, so one sheet stands at a time
			opened = undefined
			editSheet?.edit(item)
		} else if (action.startsWith('move:')) {
			const location = action.slice('move:'.length) as StockLocation
			const label = locationLabel(location)
			const { undo } = kitchen.moveStock(id, location, label)
			undoToast($t('domains.kitchen.stock.toast.moved', { values: { name: item.name, location: label } }), undo)
		} else if (action === 'grocery') {
			const { undo } = addToGrocery(item)
			undoToast($t('domains.kitchen.stock.toast.addedToGrocery', { values: { name: item.name } }), undo)
		} else if (action === 'ranOut') {
			const { undo } = kitchen.ranOutStock(id)
			undoToast($t('domains.kitchen.stock.toast.ranOut', { values: { name: item.name } }), undo)
		} else if (action === 'delete') {
			if (opened === id) opened = undefined
			const { undo } = kitchen.removeStock(id)
			undoToast($t('domains.kitchen.stock.toast.removed', { values: { name: item.name } }), undo)
		}
	}
	const ranOutSwipe = (row: ListRowData): SwipeLeading => ({
		label: $t('domains.kitchen.stock.actions.ranOut'),
		icon: 'circle-dashed',
		tone: 'neutral',
		onaction: () => act('ranOut', row.id),
	})
	const grocerySwipe = (row: ListRowData): SwipeLeading => ({
		label: $t('domains.kitchen.stock.actions.addToGrocery'),
		icon: 'plus',
		onaction: () => act('grocery', row.id),
	})
	const deleteSwipe = (row: ListRowData): SwipeTrailing => ({
		label: $t('domains.kitchen.stock.actions.delete'),
		icon: 'trash',
		onaction: () => act('delete', row.id),
	})

	// The item a tap opened, in its sheet; the sheet closes by itself when the item is gone.
	let opened = $state<string>()
	const detail = $derived(kitchen.stock.find((item) => item.id === opened))

	let editSheet = $state<StockEditSheet>()
	/** The page's Add: the item's form, blank (D-109). */
	export function addItem() {
		editSheet?.add()
	}

	// Select mode, one per location (D-41): what is selected is acted on as one write with one undo, and the mode ends.
	let selecting = $state<Record<StockLocation, boolean>>({
		fridge: false,
		freezer: false,
		pantry: false,
		counter: false,
		household: false,
	})
	const anySelecting = $derived(Object.values(selecting).some(Boolean))
	function endSelecting() {
		for (const location of Object.keys(selecting) as StockLocation[]) selecting[location] = false
	}
	// a mode of its own: the floating + stands down, and the back press ends it
	$effect(() => (anySelecting ? chrome.suppressFab() : undefined))
	$effect(() => (anySelecting ? holdBack(() => (endSelecting(), true)) : undefined))

	let bulkMove = $state<{ ids: string[]; from: StockLocation; anchor: HTMLElement }>()
	let bulkMoveOpen = $state(false)
	function moveMany(ids: string[], from: StockLocation, location: StockLocation) {
		const label = locationLabel(location)
		const { count, undo } = kitchen.moveStockMany(ids, location, label)
		if (count) undoToast($t('domains.kitchen.stock.toast.movedMany', { values: { count, location: label } }), undo)
		selecting[from] = false
	}
	function groceryMany(ids: string[], from: StockLocation) {
		const items = kitchen.stock.filter((item) => ids.includes(item.id))
		const { undo } = kitchen.addGroceryItems(
			items.map(groceryLineOf),
			items.every((item) => kitchen.low(item)) ? 'low-stock' : 'manual'
		)
		undoToast($t('domains.kitchen.stock.toast.addedManyToGrocery', { values: { count: items.length } }), undo)
		selecting[from] = false
	}
	function ranOutMany(ids: string[], from: StockLocation) {
		const { count, undo } = kitchen.ranOutStockMany(ids)
		if (count) undoToast($t('domains.kitchen.stock.toast.ranOutMany', { values: { count } }), undo)
		selecting[from] = false
	}
	function removeMany(ids: string[], from: StockLocation) {
		const { count, undo } = kitchen.removeStockMany(ids)
		undoToast($t('domains.kitchen.stock.toast.removedMany', { values: { count } }), undo)
		selecting[from] = false
	}

	function seed() {
		undoToast($t('common.sampleAdded'), kitchen.seed($t('domains.kitchen.name')))
	}
</script>

{#if kitchen.stock.length === 0}
	<EmptyState
		title={$t('domains.kitchen.stock.empty.title')}
		text={$t('domains.kitchen.stock.empty.text')}
		action={{ label: $t('domains.kitchen.capture.takeStock'), icon: 'refrigerator', onclick: ontakestock }}
		sample={{ onclick: seed }}
	/>
{:else}
	<div class="body">
		{#each sections as section (section.location)}
			<List
				header={locationLabel(section.location)}
				count={section.items.length}
				rows={section.items.map(toRow)}
				selectable
				bind:selecting={selecting[section.location]}
				leading={ranOutSwipe}
				trailing={deleteSwipe}
				onopen={(row) => (opened = row.id)}
			>
				{#snippet bulk(ids: string[])}
					<IconButton
						icon="arrow-right"
						size="xs"
						label={$t('domains.kitchen.stock.actions.move')}
						disabled={!ids.length}
						aria-haspopup="menu"
						onclick={(event: MouseEvent) => {
							bulkMove = { ids, from: section.location, anchor: event.currentTarget as HTMLElement }
							bulkMoveOpen = true
						}}
					/>
					<IconButton
						icon="plus"
						size="xs"
						label={$t('domains.kitchen.stock.actions.addToGrocery')}
						disabled={!ids.length}
						onclick={() => groceryMany(ids, section.location)}
					/>
					<IconButton
						icon="circle-dashed"
						size="xs"
						label={$t('domains.kitchen.stock.actions.ranOut')}
						disabled={!ids.length}
						onclick={() => ranOutMany(ids, section.location)}
					/>
					<IconButton
						icon="trash"
						size="xs"
						label={$t('domains.kitchen.stock.actions.delete')}
						danger
						disabled={!ids.length}
						onclick={() => removeMany(ids, section.location)}
					/>
				{/snippet}
			</List>
		{/each}
		{#if ranOut.length}
			<List
				header={$t('domains.kitchen.stock.ranOut')}
				count={ranOut.length}
				rows={ranOut.map(toOutRow)}
				leading={grocerySwipe}
				trailing={deleteSwipe}
				onopen={(row) => (opened = row.id)}
			/>
		{/if}
		{#if !sections.length && !ranOut.length}
			<p class="voice">{$t('domains.kitchen.stock.noneMatch')}</p>
		{/if}
	</div>
	<Menu
		bind:open={bulkMoveOpen}
		anchor={bulkMove?.anchor}
		align="start"
		label={$t('domains.kitchen.stock.actions.move')}
		items={stockMoveItems($t, bulkMove?.from)}
		onselect={(item) => {
			if (bulkMove) moveMany(bulkMove.ids, bulkMove.from, (item.id ?? '').slice('move:'.length) as StockLocation)
		}}
	/>
{/if}

<Sheet
	bind:open={() => !!detail, (on) => (on ? undefined : (opened = undefined))}
	label={detail?.name ?? ''}
	initialFocus="container"
>
	{#if detail}
		<StockDetail item={detail} framed={false} onact={(action) => act(action, detail.id)} />
	{/if}
</Sheet>
<StockEditSheet bind:this={editSheet} />

<style>
	/* One card per location, then Ran out, one under another */
	.body {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding: 0 var(--ed-gutter);
	}
	.voice {
		margin: 0;
		font: var(--ed-t-voice);
		letter-spacing: var(--ed-t-voice-tracking);
		font-variation-settings: var(--ed-t-voice-opsz);
		color: var(--text-secondary);
	}
</style>
