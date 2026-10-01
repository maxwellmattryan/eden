<script lang="ts">
	// Hearth's Stock view (Domains/Hearth/Stock): a quick-add line, one List per location sorted as the header's chip
	// says, with quantities in mono, `estimated` where capture guessed, a warning where stock is low and a tip button
	// where an item has one worth knowing (D-87); and the selected item in a detail pane. Edit opens the item's form in
	// a sheet over the page (D-95, StockEditSheet). Selection is the List's own
	// mode (D-41), and what it selects is moved, listed or deleted as one write with one undo. Files dropped or pasted
	// on the page start a capture with them (D-86). Every item has a picture (D-90): the one cut from its photo or
	// chosen by the owner, else its category's glyph; and a grocer's product link, in the quick-add line or the edit
	// sheet, brings the grocer's own picture of the product (D-91). The four lists hold what is there; what ran out
	// lately has a list of its own at the side, each item kept with its picture to be bought again (D-92), and the
	// item a click picks opens above it, fading in as it makes its room (D-94); a double-click does nothing more. The side stays in view while the lists scroll.
	import {
		Badge,
		Button,
		Chip,
		Dropzone,
		EmptyState,
		Icon,
		IconButton,
		List,
		Menu,
		QuickAdd,
		defaultParse,
		type IconName,
		type ListRowData,
		type MenuItem,
		type ParsedChip,
	} from '@eden/ui-kit'
	import { CATEGORIES, productLink, type ProductLink } from '@eden/shared/domains/kitchen'
	import { locale, t } from '@eden/shared/i18n'
	import { settings } from '@eden/shared/settings'
	import { quintOut } from 'svelte/easing'
	import type { TransitionConfig } from 'svelte/transition'
	import { undoToast } from '$lib/shell/undo'
	import { formatDay, formatDayTime } from '@eden/shared/dates'
	import { capture } from '../capture.svelte'
	import { CAPTURE_ACCEPT, linkedPicture } from '../staging.svelte'
	import { categoryGlyph } from '../words'
	import StockEditSheet from './StockEditSheet.svelte'
	import { LOCATIONS, kitchen, type StockItem, type StockLocation, type StockSort } from '../store.svelte'

	type Props = {
		/** The id the page's Add action focuses. */
		quickAddId: string
		/** The Expiring filter: only what is dated within the next two days. */
		expiring?: boolean
		/** The Low stock filter. */
		lowStock?: boolean
		/** How each location is ordered. */
		sort?: StockSort
		/** Take stock from photos of the shelves, the empty state's primary action: the quickest way to a first stock. */
		ontakestock: () => void
	}
	let { quickAddId, expiring = false, lowStock = false, sort = 'expiry', ontakestock }: Props = $props()

	const uid = $props.id()
	const lang = $derived($locale ?? 'en')
	const format = $derived({ lang, clock: settings.clock })
	const locationLabel = (location: StockLocation) => $t(`domains.kitchen.stock.locations.${location}`)
	const quantity = (item: StockItem) => (item.unit ? `${item.qty} ${item.unit}` : item.qty)
	/** A category as the page names it: one of the ids, or the words a row from before they were ids holds. */
	const categoryLabel = (category: string) =>
		(CATEGORIES as readonly string[]).includes(category) ? $t(`domains.kitchen.categories.${category}`) : category

	const LOCATION_ICONS: Record<StockLocation, IconName> = {
		fridge: 'refrigerator',
		freezer: 'snowflake',
		pantry: 'package',
		counter: 'carrot',
	}
	const moveItems = (current?: StockLocation): MenuItem[] =>
		LOCATIONS.filter((location) => location !== current).map((location) => ({
			id: `move:${location}`,
			label: locationLabel(location),
			icon: LOCATION_ICONS[location],
		}))
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
	/** What a grocery line takes of a stock item: its name, and the brand and the size to buy again (D-104). */
	const groceryRow = (item: StockItem) => ({
		name: item.name,
		...(item.brand ? { brand: item.brand } : {}),
		...(item.size ? { size: item.size } : {}),
	})
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

	const sections = $derived(
		kitchen.sections((item) => (!expiring || kitchen.soon(item)) && (!lowStock || kitchen.low(item)), sort)
	)
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
	function pick(id: string) {
		selected = selected === id ? undefined : id
	}

	// Edit opens the item's form in a sheet over the page (D-95); the pane beneath shows the item it is about.
	let editSheet = $state<StockEditSheet>()
	function edit(item: StockItem) {
		selected = item.id
		editSheet?.edit(item)
	}

	function addToGrocery(item: StockItem) {
		return kitchen.addToGrocery(
			groceryRow(item),
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
	/** The chips the quick-add line shows: a product link reads as its brand and name, its size and its store; any other line as typed. */
	const parseLine = (text: string): ParsedChip[] => {
		const product = productLink(text)
		if (!product) return defaultParse(text)
		return [
			{ label: product.brand ? `${product.brand} ${product.name}` : product.name },
			...(product.size ? [{ label: product.size, mono: true }] : []),
			{ label: product.store, icon: 'image' as const },
		]
	}
	function add(text: string) {
		const product = productLink(text)
		if (product) return void addProduct(product)
		const held = kitchen.stock.length
		const { item, undo } = kitchen.addStock(text)
		// no more items than before: one that ran out came back (D-92)
		const key = kitchen.stock.length === held ? 'back' : 'added'
		undoToast($t(`domains.kitchen.stock.toast.${key}`, { values: { name: item.name } }), undo)
	}
	/**
	 * A product's link in the quick-add line (D-91): the item is added at once under the name its address gives, with
	 * its size and, where the address says it, its brand as their own (D-104), and its picture follows when it has
	 * been fetched. One undo takes back both.
	 */
	async function addProduct(product: ProductLink) {
		const { item, undo } = kitchen.addStockItem({ name: product.name, brand: product.brand, size: product.size })
		let unpicture: (() => void) | undefined
		undoToast($t('domains.kitchen.stock.toast.added', { values: { name: item.name } }), () => {
			unpicture?.()
			undo()
		})
		selected = item.id
		const image = await linkedPicture(product.imageUrl)
		// the item may have been taken back while its picture was on its way
		if (image && kitchen.stockById(item.id)) unpicture = kitchen.setStockPhoto(item.id, image).undo
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
			items.map(groceryRow),
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

	// The detail pane's Move opens the same choices as the row's menu, anchored to its button.
	let moveAnchor = $state<HTMLElement>()
	let moveOpen = $state(false)

	/** Files pasted anywhere on the page start a capture with them; pasted text is left to the field it lands in. */
	function onpaste(event: ClipboardEvent) {
		const files = [...(event.clipboardData?.files ?? [])]
		if (!files.length || capture.open) return
		event.preventDefault()
		capture.start(files)
	}
</script>

<svelte:window {onpaste} />

{#snippet picture(item: StockItem)}
	{@const image = kitchen.photoOf(item)}
	{#if image}
		<img class="picture" src={image} alt="" />
	{:else}
		<span class="picture picture-glyph" aria-hidden="true"><Icon name={categoryGlyph(item.category)} /></span>
	{/if}
{/snippet}

<Dropzone accept={[...CAPTURE_ACCEPT]} disabled={capture.open} ondrop={(accepted) => capture.start(accepted)}>
	{#if kitchen.stock.length === 0}
		<EmptyState
			title={$t('domains.kitchen.stock.empty.title')}
			text={$t('domains.kitchen.stock.empty.text')}
			action={{ label: $t('domains.kitchen.capture.takeStock'), icon: 'refrigerator', onclick: ontakestock }}
			sample={{ onclick: seed }}
		/>
	{:else}
		<div class="body">
			<div class="lists">
				<QuickAdd
					id={quickAddId}
					placeholder={$t('domains.kitchen.stock.addPlaceholder')}
					parse={parseLine}
					onadd={add}
				/>
				{#each sections as section (section.location)}
					<List
						header={locationLabel(section.location)}
						count={section.items.length}
						rows={section.items.map(toRow)}
						selectable
						bind:selecting={selecting[section.location]}
						current={detail?.id}
						onpick={(row) => pick(row.id)}
						{onaction}
					>
						{#snippet bulk(ids: string[])}
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
						{/snippet}
					</List>
				{/each}
				{#if !sections.length && !ranOut.length}
					<p class="voice">{$t('domains.kitchen.stock.noneMatch')}</p>
				{/if}
			</div>

			<div class="side">
				{#if detail}
					<div class="reveal" transition:reveal>
						<aside class="detail" aria-labelledby="{uid}-detail">
							<div class="detail-head">
								{@render picture(detail)}
								<h2 class="detail-title" id="{uid}-detail">{detail.name}</h2>
								{#if detail.tip}
									<IconButton
										icon="info"
										size="xs"
										label={$t('domains.kitchen.stock.detail.tipFor', { values: { name: detail.name } })}
										tooltip={detail.tip}
									/>
								{/if}
							</div>
							<dl class="fields">
								{#if detail.brand}
									<dt>{$t('domains.kitchen.stock.detail.brand')}</dt>
									<dd>{detail.brand}</dd>
								{/if}
								{#if detail.size}
									<dt>{$t('domains.kitchen.stock.detail.size')}</dt>
									<dd class="mono">{detail.size}</dd>
								{/if}
								<dt>{$t('domains.kitchen.stock.detail.quantity')}</dt>
								<dd class="mono">
									{#if kitchen.out(detail)}
										<Badge kind="origin" label={$t('domains.kitchen.stock.badge.ranOut')} />
									{:else}
										{quantity(detail)}
									{/if}
									{#if kitchen.low(detail)}<Badge
											kind="warning"
											label={$t('domains.kitchen.stock.badge.lowStock')}
										/>{/if}
								</dd>
								<dt>{$t('domains.kitchen.stock.detail.location')}</dt>
								<dd><Chip label={locationLabel(detail.location)} /></dd>
								{#if detail.expiry}
									<dt>{$t('domains.kitchen.stock.detail.expires')}</dt>
									<dd class="mono">
										{formatDay(detail.expiry)}
										{#if detail.estimated}<Badge kind="estimated" />{/if}
										{#if kitchen.soon(detail)}<Badge
												kind="warning"
												label={$t('domains.kitchen.stock.badge.thisWeek')}
											/>{/if}
									</dd>
								{/if}
								{#if detail.category}
									<dt>{$t('domains.kitchen.stock.detail.category')}</dt>
									<dd>{categoryLabel(detail.category)}</dd>
								{/if}
								<dt>{$t('domains.kitchen.stock.detail.source')}</dt>
								<dd>
									<Badge kind="origin" label={$t(`domains.kitchen.stock.source.${detail.source}`)} />
									<span class="mono">{formatDayTime(detail.sourcedAt, format)}</span>
								</dd>
								{#if detail.threshold !== undefined}
									<dt>{$t('domains.kitchen.stock.detail.threshold')}</dt>
									<dd class="mono">{detail.threshold}</dd>
								{/if}
							</dl>
							<div class="detail-actions">
								<Button label={$t('domains.kitchen.stock.actions.edit')} icon="pencil" onclick={() => edit(detail)} />
								<Button
									label={$t('domains.kitchen.stock.actions.addToGrocery')}
									icon="plus"
									onclick={() => act('grocery', detail.id)}
								/>
								{#if !kitchen.out(detail)}
									<span class="anchor" bind:this={moveAnchor}>
										<Button
											label={$t('domains.kitchen.stock.actions.move')}
											icon="arrow-right"
											aria-haspopup="menu"
											aria-expanded={moveOpen}
											onclick={() => (moveOpen = !moveOpen)}
										/>
									</span>
									<Menu
										bind:open={moveOpen}
										anchor={moveAnchor}
										align="start"
										label={$t('domains.kitchen.stock.actions.move')}
										items={moveItems(detail.location)}
										onselect={(item) => act(item.id ?? '', detail.id)}
									/>
									<Button
										label={$t('domains.kitchen.stock.actions.ranOut')}
										icon="circle-dashed"
										onclick={() => act('ranOut', detail.id)}
									/>
								{/if}
								<Button
									label={$t('domains.kitchen.stock.actions.delete')}
									variant="danger"
									icon="trash"
									onclick={() => act('delete', detail.id)}
								/>
							</div>
						</aside>
					</div>
				{/if}
				<List
					header={$t('domains.kitchen.stock.ranOut')}
					count={ranOut.length}
					rows={ranOut.map(toOutRow)}
					current={detail?.id}
					onpick={(row) => pick(row.id)}
					{onaction}
				>
					{#if !ranOut.length}
						<p class="voice none">{$t('domains.kitchen.stock.ranOutEmpty')}</p>
					{/if}
				</List>
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
		<StockEditSheet bind:this={editSheet} />
	{/if}
</Dropzone>

<style>
	/* The lists on the left and the detail pane on the right */
	.body {
		display: grid;
		grid-template-columns: minmax(0, 1fr) var(--sheet-sm);
		align-items: start;
		gap: var(--space-6);
		padding: 0 var(--ed-gutter);
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
	.lists {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	.anchor {
		display: inline-flex;
	}
	.voice {
		margin: 0;
		font: var(--ed-t-voice);
		letter-spacing: var(--ed-t-voice-tracking);
		font-variation-settings: var(--ed-t-voice-opsz);
		color: var(--text-secondary);
	}

	/* The detail pane: the item's name with its tip beside it, its fields as a definition list, the actions */
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
	.detail-head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	/* the item's picture, or its category's glyph on a tile of the same size */
	.picture {
		flex: none;
		box-sizing: border-box;
		width: calc(var(--space-8) * 2);
		height: calc(var(--space-8) * 2);
		border: 1px solid var(--ed-card-border);
		border-radius: var(--ed-radius-control);
		object-fit: cover;
		background: var(--surface-2);
	}
	.picture-glyph {
		display: inline-grid;
		place-items: center;
		color: var(--text-secondary);
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
	.detail-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
</style>
