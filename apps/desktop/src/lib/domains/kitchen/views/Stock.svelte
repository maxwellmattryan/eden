<script lang="ts">
	// Hearth's Stock view (Domains/Hearth/Stock): one List per location under its own heading, sorted as the header's
	// chip says, with quantities in mono, `estimated` where capture guessed, a warning where stock is low and a tip button
	// where an item has one worth knowing (D-87); and the selected item in a detail pane (the shared StockDetail). Edit opens the item's form in
	// a sheet over the page (D-95, StockEditSheet), and the page's Add opens the same sheet blank (D-109). Selection is the List's own
	// mode (D-41), and what it selects is moved, listed or deleted as one write with one undo. Files dropped or pasted
	// on the page start a capture with them (D-86). Every item has a picture (D-90): the one cut from its photo or
	// chosen by the owner, else its category's glyph; and a grocer's product link, in the item's sheet,
	// brings the grocer's own picture of the product (D-91). The four lists hold what is there; what ran out
	// lately has a list of its own at the side, each item kept with its picture to be bought again (D-92), and the
	// item a click picks opens above it, fading in as it makes its room (D-94); a double-click does nothing more. The side stays in view while the lists scroll.
	// A row can be dragged to another location, which is its menu's Move to, or onto Ran out, which is its menu's Ran
	// out; one that ran out, dropped on a location, opens its form there with the quantity to type (D-111). Every
	// location shows for the length of a drag, even one that holds nothing.
	import {
		BackButton,
		Button,
		DropTarget,
		Dropzone,
		EmptyState,
		Icon,
		IconButton,
		List,
		Menu,
		type ListRowData,
		type MenuItem,
	} from '@eden/ui-kit'
	import { t } from '@eden/shared/i18n'
	import { quintOut } from 'svelte/easing'
	import type { TransitionConfig } from 'svelte/transition'
	import { undoToast } from '@eden/shared/shell'
	import { formatDay } from '@eden/shared/dates'
	import { showPushed } from '@eden/shared/shell'
	import { capture } from '@eden/shared/domains/kitchen'
	import { CAPTURE_ACCEPT } from '@eden/shared/domains/kitchen'
	import { LOCATION_ICONS, categoryGlyph, groceryLineOf, stockMoveItems } from '@eden/shared/domains/kitchen'
	import StockDetail from '@eden/shared/domains/kitchen/views/StockDetail.svelte'
	import StockEditSheet from '@eden/shared/domains/kitchen/views/StockEditSheet.svelte'
	import { LOCATIONS, kitchen, type StockItem, type StockLocation, type StockSort } from '@eden/shared/domains/kitchen'

	type Props = {
		/** The Expiring filter: only what is dated within the next two days. */
		expiring?: boolean
		/** The Low stock filter. */
		lowStock?: boolean
		/** How each location is ordered. */
		sort?: StockSort
		/** Take stock from photos of the shelves, the empty state's primary action: the quickest way to a first stock. */
		ontakestock: () => void
	}
	let { expiring = false, lowStock = false, sort = 'expiry', ontakestock }: Props = $props()

	const uid = $props.id()
	const locationLabel = (location: StockLocation) => $t(`domains.kitchen.stock.locations.${location}`)
	const quantity = (item: StockItem) => (item.unit ? `${item.qty} ${item.unit}` : item.qty)
	const moveItems = (current?: StockLocation): MenuItem[] => stockMoveItems($t, current)
	/** The one "Move to" row: the places it can go are its submenu. */
	const moveMenu = (current: StockLocation): MenuItem => ({
		id: 'move',
		label: $t('domains.kitchen.stock.actions.moveTo'),
		icon: 'arrow-right',
		children: moveItems(current),
	})
	const actionsFor = (item: StockItem): MenuItem[] => [
		{ id: 'edit', label: $t('domains.kitchen.stock.actions.edit'), icon: 'pencil' },
		...(kitchen.out(item) ? [] : [moveMenu(item.location)]),
		{ id: 'grocery', label: $t('domains.kitchen.stock.actions.addToGrocery'), icon: 'plus' },
		...(kitchen.out(item)
			? []
			: [{ id: 'ranOut', label: $t('domains.kitchen.stock.actions.ranOut'), icon: 'circle-dashed' as const }]),
		{ id: 'delete', label: $t('domains.kitchen.stock.actions.delete'), icon: 'trash', destructive: true },
	]
	/** The package's size beside what is held, apart from it by its id: "2" of "16 oz". */
	const sizeChip = (item: StockItem) => (item.size ? [{ id: 'size', label: item.size, mono: true }] : [])
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
		actions: actionsFor(item),
	})

	/** A row of the Ran out list: where the item was kept, and the day it ran out. */
	const toOutRow = (item: StockItem): ListRowData => ({
		id: item.id,
		primary: item.name,
		secondary: item.brand,
		thumbnail: kitchen.photoOf(item),
		icon: categoryGlyph(item.category),
		tile: true,
		hint: item.tip,
		chips: [{ label: locationLabel(item.location) }, ...sizeChip(item)],
		meta: item.outAt ? formatDay(item.outAt.slice(0, 10)) : undefined,
		actions: actionsFor(item),
	})

	/** The group the rows are dragged in, between the locations and Ran out (D-111). */
	const DRAG_GROUP = 'stock-item'
	let dragging = $state(false)
	/**
	 * The lists on the page: every location, even an empty one, so each has its place and can be dropped on. Under a
	 * filter only what matches shows, until a row is held.
	 */
	const sections = $derived.by(() => {
		const held = kitchen.sections((item) => (!expiring || kitchen.soon(item)) && (!lowStock || kitchen.low(item)), sort)
		if (!dragging && (expiring || lowStock)) return held
		return LOCATIONS.map((location) => held.find((section) => section.location === location) ?? { location, items: [] })
	})
	/** What ran out lately; the Expiring filter hides it, the Low stock filter keeps what has a threshold. */
	const ranOut = $derived(expiring ? [] : kitchen.recentlyOut.filter((item) => !lowStock || kitchen.low(item)))
	let selected = $state<string>()
	/** The item the pane shows: the one picked, and none until one is. Picking it again puts the pane away. */
	const detail = $derived(kitchen.stock.find((item) => item.id === selected))
	/**
	 * The pane's coming and going: it fades while its height opens, over the panel duration, so the Ran out list
	 * under it moves down with it. A zero panel duration, which is reduced motion, fades alone.
	 */
	function reveal(node: HTMLElement): TransitionConfig {
		const style = getComputedStyle(node)
		const duration = parseFloat(style.getPropertyValue('--ed-duration-panel')) || 0
		if (!duration) {
			return { duration: parseFloat(style.getPropertyValue('--ed-duration-micro')) || 0, css: (t) => `opacity: ${t}` }
		}
		const height = node.getBoundingClientRect().height
		const bottom = parseFloat(style.paddingBottom) || 0
		return {
			duration,
			easing: quintOut,
			css: (t) =>
				`overflow: hidden; height: ${(t * height).toFixed(2)}px; padding-bottom: ${(t * bottom).toFixed(2)}px; opacity: ${t}`,
		}
	}
	// In a narrow page the pane takes the lists' place, under a back arrow (a pushed view).
	let back = $state<HTMLElement>()
	function pick(id: string) {
		selected = selected === id ? undefined : id
		void showPushed(() => back)
	}

	// Edit opens the item's form in a sheet over the page (D-95); the pane beneath shows the item it is about.
	let editSheet = $state<StockEditSheet>()
	function edit(item: StockItem) {
		selected = item.id
		editSheet?.edit(item)
	}
	/** The page's Add: the same form, blank (D-109). */
	export function addItem() {
		editSheet?.add()
	}

	function addToGrocery(item: StockItem) {
		return kitchen.addToGrocery(
			groceryLineOf(item),
			kitchen.out(item) ? 'ran-out' : kitchen.low(item) ? 'low-stock' : 'manual'
		)
	}
	function act(action: string, id: string) {
		const item = kitchen.stock.find((entry) => entry.id === id)
		if (!item) return
		if (action === 'edit') {
			edit(item)
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
			const { undo } = kitchen.removeStock(id)
			undoToast($t('domains.kitchen.stock.toast.removed', { values: { name: item.name } }), undo)
		}
	}
	function onaction(menuItem: MenuItem, row: ListRowData) {
		act(menuItem.id ?? '', row.id)
	}
	/**
	 * A row dropped on a list (D-111): on a location it is the menu's Move to, on Ran out the menu's Ran out. One
	 * that ran out comes back through its form, opened on that location with its quantity to type.
	 */
	function drop(id: string, target: StockLocation | 'out') {
		const item = kitchen.stock.find((entry) => entry.id === id)
		if (!item) return
		if (target === 'out') {
			if (!kitchen.out(item)) act('ranOut', id)
		} else if (kitchen.out(item)) {
			selected = item.id
			editSheet?.edit(item, { location: target, qty: '' })
		} else if (item.location !== target) {
			act(`move:${target}`, id)
		}
	}
	function seed() {
		undoToast($t('common.sampleAdded'), kitchen.seed($t('domains.kitchen.name')))
	}

	// Select mode, one per location (D-41): what is selected is acted on as one write with one undo, and the mode ends.
	let selecting = $state<Record<StockLocation, boolean>>({
		fridge: false,
		freezer: false,
		pantry: false,
		counter: false,
		household: false,
	})
	/** What each location's list has selected, as the list reports it: the heading's actions act on these. */
	let chosen = $state<Record<StockLocation, string[]>>({
		fridge: [],
		freezer: [],
		pantry: [],
		counter: [],
		household: [],
	})
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

	/** Files pasted anywhere on the page start a capture with them; pasted text is left to the field it lands in. */
	function onpaste(event: ClipboardEvent) {
		const files = [...(event.clipboardData?.files ?? [])]
		if (!files.length || capture.open) return
		event.preventDefault()
		capture.start(files)
	}
</script>

<svelte:window {onpaste} />

<Dropzone accept={[...CAPTURE_ACCEPT]} disabled={capture.open} ondrop={(accepted) => capture.start(accepted)}>
	{#if kitchen.stock.length === 0}
		<EmptyState
			title={$t('domains.kitchen.stock.empty.title')}
			text={$t('domains.kitchen.stock.empty.text')}
			action={{ label: $t('domains.kitchen.capture.takeStock'), icon: 'refrigerator', onclick: ontakestock }}
			sample={{ onclick: seed }}
		/>
	{:else}
		<div class={['body', detail && 'body-open']}>
			<div class="lists">
				{#each sections as section (section.location)}
					<DropTarget accepts={[DRAG_GROUP]} ondrop={(ids) => ids.forEach((id) => drop(id, section.location))}>
						<section class="location" aria-labelledby="{uid}-{section.location}">
							<header class="location-head">
								<Icon name={LOCATION_ICONS[section.location]} />
								<h2 class="location-title" id="{uid}-{section.location}">{locationLabel(section.location)}</h2>
								<span class="location-tools">
									{#if selecting[section.location]}
										{@const ids = chosen[section.location]}
										<IconButton
											icon="arrow-right"
											size="xs"
											label={$t('domains.kitchen.stock.actions.move')}
											tooltip
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
											tooltip
											disabled={!ids.length}
											onclick={() => groceryMany(ids, section.location)}
										/>
										<IconButton
											icon="circle-dashed"
											size="xs"
											label={$t('domains.kitchen.stock.actions.ranOut')}
											tooltip
											disabled={!ids.length}
											onclick={() => ranOutMany(ids, section.location)}
										/>
										<IconButton
											icon="trash"
											size="xs"
											label={$t('domains.kitchen.stock.actions.delete')}
											danger
											tooltip
											disabled={!ids.length}
											onclick={() => removeMany(ids, section.location)}
										/>
										<Button
											variant="quiet"
											label={$t('domains.kitchen.stock.selection.done')}
											onclick={() => (selecting[section.location] = false)}
										/>
									{/if}
									<span class="location-count" aria-live="polite">
										{selecting[section.location]
											? $t('domains.kitchen.stock.selection.count', {
													values: { count: chosen[section.location].length },
												})
											: section.items.length}
									</span>
								</span>
							</header>
							{#if section.items.length}
								<List
									labelledby="{uid}-{section.location}"
									headless
									rows={section.items.map(toRow)}
									selectable
									bind:selecting={selecting[section.location]}
									onselect={(ids) => (chosen[section.location] = ids)}
									current={detail?.id}
									onpick={(row) => pick(row.id)}
									{onaction}
									dragGroup={DRAG_GROUP}
									ondragstate={(on) => (dragging = on)}
								/>
							{:else}
								<EmptyState
									inline
									title={$t('domains.kitchen.stock.emptyLocation.title')}
									text={$t('domains.kitchen.stock.emptyLocation.text')}
								/>
							{/if}
						</section>
					</DropTarget>
				{/each}
				{#if !sections.length && !ranOut.length}
					<p class="voice">{$t('domains.kitchen.stock.noneMatch')}</p>
				{/if}
			</div>

			<div class="side">
				{#if detail}
					<div class="reveal" transition:reveal>
						<div class="back" bind:this={back}><BackButton onback={() => (selected = undefined)} /></div>
						<StockDetail item={detail} onact={(action) => act(action, detail.id)} />
					</div>
				{/if}
				<DropTarget accepts={[DRAG_GROUP]} ondrop={(ids) => ids.forEach((id) => drop(id, 'out'))}>
					<List
						header={$t('domains.kitchen.stock.ranOut')}
						count={ranOut.length}
						rows={ranOut.map(toOutRow)}
						current={detail?.id}
						onpick={(row) => pick(row.id)}
						{onaction}
						dragGroup={DRAG_GROUP}
						ondragstate={(on) => (dragging = on)}
					>
						{#if !ranOut.length}
							<p class="voice none">{$t('domains.kitchen.stock.ranOutEmpty')}</p>
						{/if}
					</List>
				</DropTarget>
			</div>
		</div>
		<Menu
			bind:open={bulkMoveOpen}
			anchor={bulkMove?.anchor}
			align="start"
			label={$t('domains.kitchen.stock.actions.move')}
			items={moveItems(bulkMove?.from)}
			onselect={(item) => {
				if (bulkMove) moveMany(bulkMove.ids, bulkMove.from, (item.id ?? '').slice('move:'.length) as StockLocation)
			}}
		/>
	{/if}
</Dropzone>
<StockEditSheet bind:this={editSheet} onadded={(item) => (selected = item.id)} />

<style>
	/* The lists on the left and the detail pane on the right */
	.body {
		display: grid;
		grid-template-columns: minmax(0, 1fr) var(--sheet-sm);
		align-items: start;
		gap: var(--space-6);
		padding: 0 var(--ed-gutter);
	}
	/* the way back from the open item, which only a narrow page needs */
	.back {
		display: none;
	}
	/* narrow page */
	@container page (max-width: 48rem) {
		/* one column: the lists, and what ran out under them; the open item takes the lists' place */
		.body {
			grid-template-columns: minmax(0, 1fr);
		}
		.body-open .lists {
			display: none;
		}
		.back {
			display: block;
		}
		.side {
			position: static;
			max-height: none;
			overflow-y: visible;
		}
		.location-head {
			flex-wrap: wrap;
		}
	}
	/* the line a list with nothing in it says, inside its card */
	.none {
		padding: var(--space-3);
	}
	/* The side stays in view while the lists scroll: the open item, and beneath it what ran out (D-92) */
	.side {
		position: sticky;
		top: var(--space-4);
		display: flex;
		flex-direction: column;
		min-width: 0;
		max-height: calc(100vh - var(--space-8) * 3);
		overflow-y: auto;
	}
	/* the open item, above what ran out: its space under it opens and closes with it, so the list glides and never jumps */
	.reveal {
		flex: none;
		padding-bottom: var(--space-4);
	}
	/* The locations in two columns of about the same height, read down the first and then the second; one column
	   where two would be too narrow */
	.lists {
		columns: 2 18rem;
		column-gap: var(--space-6);
		min-width: 0;
	}
	.lists > :global(*) {
		break-inside: avoid;
		margin-bottom: var(--space-4);
	}
	/* One list per location: its glyph, plain, and its name in the display face as Grocery's stores are, with the
	   count at the end of the same line */
	.location {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.location-head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		/* as tall as Done, so the list under it does not move when select mode begins */
		min-height: var(--ed-control);
	}
	/* the count stands over the rows' menu buttons: the card's edge and the row's padding from the end, in a box
	   as wide as the row's button; while selecting, the actions on the selection and Done come before it */
	.location-tools {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-left: auto;
		padding-right: calc(1px + var(--space-2));
	}
	.location-count {
		box-sizing: border-box;
		min-width: calc(var(--control-height) - var(--space-1));
		text-align: center;
		white-space: nowrap;
		font: var(--ed-t-data-sm);
		letter-spacing: var(--ed-t-data-sm-tracking);
		font-variant-numeric: tabular-nums;
		color: var(--text-secondary);
	}
	.location-title {
		margin: 0;
		font: var(--ed-t-display-md);
		letter-spacing: var(--ed-t-display-md-tracking);
		font-variation-settings: var(--ed-t-display-md-opsz);
	}
	.voice {
		margin: 0;
		font: var(--ed-t-voice);
		letter-spacing: var(--ed-t-voice-tracking);
		font-variation-settings: var(--ed-t-voice-opsz);
		color: var(--text-secondary);
	}
</style>
