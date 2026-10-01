<script lang="ts">
	// Hearth's Stock view (product/domains/kitchen.md, "Surfaces"): the page header with Capture a haul as the primary
	// action and Take stock beside it, the domain's tabs and the filter chips beneath it (Expiring, Low stock, and a
	// Sort chip that opens a menu), a quick-add line, then one List per location (Fridge, Freezer, Pantry, Counter).
	// Every row leads with the item's picture, or its category's glyph on a tile of the same size (D-90), then
	// quantities in mono, `estimated` where the capture guessed, a warning where stock is low and the info button
	// where an item has a tip (D-87). On desktop the selected item opens in a detail pane, which is also where it is
	// edited, its picture included; a List in select mode (D-41) offers Move, Add to grocery and Delete on what is
	// selected. On mobile the rows are a SwipeList whose trailing action deletes, and the detail would be a pushed view.
	import {
		Badge,
		Button,
		Chip,
		EmptyState,
		Field,
		FileButton,
		Icon,
		IconButton,
		List,
		Menu,
		PageHeader,
		QuickAdd,
		Segmented,
		domainGlyph,
		type IconName,
		type ListRowData,
		type MenuItem,
	} from '$lib/index.js'
	import AppFrame from '../_frame/AppFrame.svelte'
	import SwipeList from '../_frame/SwipeList.svelte'
	import { haul, haulCategories, sidebar, stock, type StockItem, type StockLocation } from '../../sample-data.js'

	type Sort = 'expiry' | 'name' | 'added'
	type Bulk = 'move' | 'grocery' | 'delete'

	type Props = {
		/** The Expiring filter: only what is dated on or before Friday. */
		expiring?: boolean
		/** The Low stock filter. */
		lowStock?: boolean
		/** How each location is ordered when the page opens; the Sort chip's menu changes it. */
		sort?: Sort
		/** No stock at all: the EmptyState in place of the lists. */
		empty?: boolean
		/** The item open in the detail pane on desktop. */
		selected?: string
		/** The detail pane in its edit form. */
		editing?: boolean
		/** The Fridge in select mode, with its bulk actions in the header. */
		selecting?: boolean
		oncapture?: () => void
		/** Take stock from photos of the shelves: the header's second action and the empty state's own. */
		ontakestock?: () => void
		onadd?: (text: string) => void
		onopen?: (row: ListRowData) => void
		onaction?: (item: MenuItem, row: ListRowData) => void
		/** A bulk action on what a list in select mode holds; Move names where to. */
		onbulk?: (action: Bulk, ids: string[], location?: StockLocation) => void
		/** Save in the pane's edit form, with the item's id. */
		onsave?: (id: string) => void
		/** A picture chosen for the item in the pane's form, and the one it had removed. */
		onpicture?: (id: string, files: File[]) => void
		onremovepicture?: (id: string) => void
		ondelete?: (row: ListRowData) => void
		onsample?: () => void
		onnavigate?: (id: string) => void
	}
	let {
		expiring = false,
		lowStock = false,
		sort = 'expiry',
		empty = false,
		selected = 'st-01',
		editing = false,
		selecting = false,
		oncapture,
		ontakestock,
		onadd,
		onopen,
		onaction,
		onbulk,
		onsave,
		onpicture,
		onremovepicture,
		ondelete,
		onsample,
		onnavigate,
	}: Props = $props()

	const uid = $props.id()
	const hearth = sidebar.items.find((entry) => entry.id === 'kitchen')!
	const TABS = ['Stock', 'Recipes', 'Grocery']
	const LOCATIONS: { id: StockLocation; label: string }[] = [
		{ id: 'fridge', label: 'Fridge' },
		{ id: 'freezer', label: 'Freezer' },
		{ id: 'pantry', label: 'Pantry' },
		{ id: 'counter', label: 'Counter' },
	]
	const locationLabel = (id: StockLocation) => LOCATIONS.find((location) => location.id === id)?.label ?? id
	/** Today is Wednesday 09-30; anything dated on or before Friday counts as expiring. */
	const SOON = '10-02'
	/** Sorts after every date, so what never expires sits at the bottom of its section. */
	const UNDATED = '9999-12-31'
	const categoryLabel = (id?: string) => haulCategories.find((category) => category.id === id)?.label
	/** A category's glyph: the item's picture until it has a photo of its own. */
	const GLYPHS: Record<string, IconName> = {
		produce: 'carrot',
		'meat-and-fish': 'beef',
		'dairy-and-eggs': 'milk',
		bakery: 'croissant',
		'grains-and-pasta': 'wheat',
		'canned-and-jarred': 'soup',
		frozen: 'snowflake',
		snacks: 'popcorn',
		drinks: 'cup-soda',
		'condiments-and-spices': 'flask-conical',
		'supplements-and-mixes': 'pill',
		other: 'package',
	}
	const glyphOf = (item: StockItem): IconName => GLYPHS[item.category ?? ''] ?? 'package'
	/** A stand-in for an item's photo, as a data URL: a story needs no binary asset, and the app's CSP has no blob:. */
	const photo = (ground: string, mark: string) =>
		'data:image/svg+xml,' +
		encodeURIComponent(
			`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><rect width="4" height="4" fill="${ground}"/><circle cx="2" cy="2" r="1.2" fill="${mark}"/></svg>`
		)
	/** The items with a photo of their own: the chicken, the spinach, the avocados. The rest show their glyph. */
	let photos = $state<Partial<Record<string, string>>>({
		'st-01': photo('#e6d9cf', '#c9a48f'),
		'st-04': photo('#dcd8c8', '#7c8a7f'),
		'st-17': photo('#dfe2cf', '#8a9466'),
	})
	const TIP: Partial<Record<string, string>> = {
		'st-01': 'Keep on the lowest shelf, and cook or freeze within two days of the date.',
		'st-04': 'Wrap in a dry towel inside the bag; it wilts fastest in the door.',
		'st-17': 'Ripen on the counter, then move to the fridge to hold them a few more days.',
	}
	/** What yesterday's haul brought in: its source reads `capture`, and Sort: newest puts it first. */
	const captured = new Set(haul.rows.map((row) => row.name))
	const SORTS: { id: Sort; label: string }[] = [
		{ id: 'expiry', label: 'expiry' },
		{ id: 'name', label: 'name' },
		{ id: 'added', label: 'newest' },
	]
	const ORDER: Record<Sort, (a: StockItem, b: StockItem) => number> = {
		expiry: (a, b) => (a.expiry ?? UNDATED).localeCompare(b.expiry ?? UNDATED),
		name: (a, b) => a.name.localeCompare(b.name),
		added: (a, b) => Number(captured.has(b.name)) - Number(captured.has(a.name)),
	}

	const moveItems = (current?: StockLocation): MenuItem[] =>
		LOCATIONS.filter((location) => location.id !== current).map((location) => ({
			id: `move:${location.id}`,
			label: `Move to ${location.label}`,
			icon: 'arrow-right' as const,
		}))
	const actionsFor = (item: StockItem): MenuItem[] => [
		{ id: 'edit', label: 'Edit', icon: 'pencil' },
		...moveItems(item.location),
		{ id: 'grocery', label: 'Add to grocery', icon: 'plus' },
		{ id: 'delete', label: 'Delete', icon: 'trash', destructive: true },
	]
	const quantity = (item: StockItem) => (item.unit ? `${item.qty} ${item.unit}` : item.qty)
	const soon = (item: StockItem) => !!item.expiry && item.expiry <= SOON
	const toRow = (item: StockItem): ListRowData => ({
		id: item.id,
		primary: item.name,
		thumbnail: photos[item.id],
		icon: glyphOf(item),
		tile: true,
		hint: TIP[item.id],
		chips: [{ label: quantity(item), mono: true }],
		badges: [
			...(item.lowStock ? [{ kind: 'warning' as const, label: 'low stock' }] : []),
			...(item.estimated ? [{ kind: 'estimated' as const }] : []),
		],
		meta: item.expiry,
		metaWarn: soon(item),
		actions: actionsFor(item),
	})

	// The Sort chip's menu: how each location is ordered.
	// svelte-ignore state_referenced_locally
	let sorting = $state(sort)
	let sortAnchor = $state<HTMLElement>()
	let sortOpen = $state(false)
	const sortItems = $derived<MenuItem[]>(SORTS.map((entry) => ({ ...entry, checked: sorting === entry.id })))
	const sortLabel = $derived(SORTS.find((entry) => entry.id === sorting)?.label ?? sorting)

	const visible = $derived(
		empty ? [] : stock.filter((item) => (!expiring || soon(item)) && (!lowStock || item.lowStock))
	)
	const sections = $derived(
		LOCATIONS.map((location) => ({
			...location,
			items: visible.filter((item) => item.location === location.id).sort(ORDER[sorting]),
		})).filter((section) => section.items.length)
	)

	// The pane: the item that is open, read or in its form.
	// svelte-ignore state_referenced_locally
	let current = $state(selected)
	const detail = $derived(stock.find((item) => item.id === current))
	/** A sample expiry (`10-02`, `2027-01`) as the date field holds it. */
	function isoDate(expiry = '') {
		if (/^\d{2}-\d{2}$/.test(expiry)) return `2026-${expiry}`
		return /^\d{4}-\d{2}$/.test(expiry) ? `${expiry}-01` : expiry
	}
	const formOf = (item?: StockItem) => ({
		name: item?.name ?? '',
		qty: item?.qty ?? '',
		unit: item?.unit ?? '',
		location: item?.location ?? ('pantry' as StockLocation),
		expiry: isoDate(item?.expiry),
		category: item?.category ?? '',
		threshold: item?.lowStock ? '10' : '',
		tip: (item && TIP[item.id]) ?? '',
	})
	// svelte-ignore state_referenced_locally
	let inForm = $state(editing)
	let form = $state(formOf(stock.find((item) => item.id === selected)))
	function edit(item: StockItem) {
		current = item.id
		form = formOf(item)
		inForm = true
	}
	const categoryItems = $derived<MenuItem[]>([
		...haulCategories.map((category) => ({ ...category, checked: form.category === category.id })),
		{ id: '', label: 'No category', checked: !form.category },
	])
	let categoryAnchor = $state<HTMLElement>()
	let categoryOpen = $state(false)
	// The pane's Move opens the same choices as the row's menu, anchored to its button.
	let moveAnchor = $state<HTMLElement>()
	let moveOpen = $state(false)

	function act(item: MenuItem, row: ListRowData) {
		const target = stock.find((entry) => entry.id === row.id)
		if (item.id === 'edit' && target) edit(target)
		onaction?.(item, row)
	}
	/** A button in the pane does what the row's menu item of the same id does. */
	function paneAction(id: string, item: StockItem) {
		const action = actionsFor(item).find((entry) => entry.id === id)
		if (action) act(action, toRow(item))
	}

	// Select mode, one per location (D-41): what is selected is moved, listed or deleted at once, and the mode ends.
	// svelte-ignore state_referenced_locally
	let picking = $state<Record<StockLocation, boolean>>({
		fridge: selecting,
		freezer: false,
		pantry: false,
		counter: false,
	})
	let bulkMove = $state<{ ids: string[]; from: StockLocation; anchor: HTMLElement }>()
	let bulkMoveOpen = $state(false)
	function bulkAct(action: Bulk, ids: string[], from: StockLocation, location?: StockLocation) {
		onbulk?.(action, ids, location)
		picking[from] = false
	}

	const headerActions = $derived([
		{
			label: 'Capture a haul',
			icon: 'camera' as const,
			variant: empty ? ('secondary' as const) : undefined,
			onclick: oncapture,
		},
		{ label: 'Take stock', icon: 'refrigerator' as const, onclick: ontakestock },
		{ label: 'Add', onclick: () => onadd?.('') },
	])
</script>

{#snippet picture(item: StockItem)}
	{#if photos[item.id]}
		<img class="picture" src={photos[item.id]} alt="" />
	{:else}
		<span class="picture picture-glyph" aria-hidden="true"><Icon name={glyphOf(item)} /></span>
	{/if}
{/snippet}

<AppFrame current="kitchen" {onnavigate}>
	{#snippet children(platform)}
		<div class="page">
			<PageHeader name={hearth.name} subtitle={hearth.subtitle} icon={domainGlyph('kitchen')} actions={headerActions}>
				{#snippet filters()}
					<Segmented items={TABS} selected={0} label="Hearth sections" />
					<Chip label="Expiring" tone="outline" icon="clock" selectable selected={expiring} />
					<Chip label="Low stock" tone="outline" selectable selected={lowStock} />
					<span class="anchor" bind:this={sortAnchor}>
						<Chip
							label="Sort: {sortLabel}"
							tone="outline"
							icon="chevron-down"
							aria-haspopup="menu"
							aria-expanded={sortOpen}
							onclick={() => (sortOpen = !sortOpen)}
						/>
					</span>
					<Menu
						bind:open={sortOpen}
						anchor={sortAnchor}
						align="start"
						label="Sort the stock"
						items={sortItems}
						onselect={(item) => (sorting = (item.id as Sort | undefined) ?? 'expiry')}
					/>
				{/snippet}
			</PageHeader>

			{#if empty}
				<EmptyState
					title="Nothing in stock yet"
					text="Take stock from a few photos of your fridge, freezer and pantry, and what is in them lands here by location. After a shop, capture the haul from a photo, a receipt or an order."
					action={{ label: 'Take stock', icon: 'refrigerator', onclick: ontakestock }}
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
									bind:selecting={picking[section.id]}
									onopen={(row) => {
										current = row.id
										inForm = false
										onopen?.(row)
									}}
									onaction={act}
								>
									{#snippet bulk(ids: string[])}
										<IconButton
											icon="arrow-right"
											size="xs"
											label="Move"
											tooltip
											disabled={!ids.length}
											aria-haspopup="menu"
											onclick={(event: MouseEvent) => {
												bulkMove = { ids, from: section.id, anchor: event.currentTarget as HTMLElement }
												bulkMoveOpen = true
											}}
										/>
										<IconButton
											icon="plus"
											size="xs"
											label="Add to grocery"
											tooltip
											disabled={!ids.length}
											onclick={() => bulkAct('grocery', ids, section.id)}
										/>
										<IconButton
											icon="trash"
											size="xs"
											label="Delete"
											danger
											tooltip
											disabled={!ids.length}
											onclick={() => bulkAct('delete', ids, section.id)}
										/>
									{/snippet}
								</List>
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
						{#if !sections.length}
							<p class="voice">Nothing in stock matches these filters.</p>
						{/if}
					</div>

					{#if platform === 'desktop' && detail && inForm}
						<aside class="detail" aria-labelledby="{uid}-detail">
							<h2 class="detail-title" id="{uid}-detail">Edit item</h2>
							<form
								class="form"
								onsubmit={(event) => {
									event.preventDefault()
									onsave?.(detail.id)
									inForm = false
								}}
							>
								<div class="picture-row">
									{@render picture(detail)}
									<FileButton
										label="Choose a picture"
										icon="image-plus"
										accept={['image/*']}
										multiple={false}
										tooltip
										onfiles={(files) => onpicture?.(detail.id, files)}
									/>
									{#if photos[detail.id]}
										<IconButton
											icon="trash"
											size="sm"
											label="Remove the picture"
											tooltip
											onclick={() => {
												delete photos[detail.id]
												onremovepicture?.(detail.id)
											}}
										/>
									{/if}
								</div>
								<Field label="Name" bind:value={form.name} />
								<div class="pair">
									<Field label="Quantity" bind:value={form.qty} mono inputmode="decimal" />
									<Field label="Unit" bind:value={form.unit} />
								</div>
								<div class="group">
									<span class="group-label">Location</span>
									<Segmented
										items={LOCATIONS.map((location) => location.label)}
										selected={LOCATIONS.findIndex((location) => location.id === form.location)}
										label="Location"
										onchange={(index) => (form.location = LOCATIONS[index]!.id)}
									/>
								</div>
								<Field label="Expires" type="date" bind:value={form.expiry} />
								<div class="group">
									<span class="group-label">Category</span>
									<span class="anchor" bind:this={categoryAnchor}>
										<Chip
											label={categoryLabel(form.category) ?? 'No category'}
											tone="outline"
											icon="chevron-down"
											aria-haspopup="menu"
											aria-expanded={categoryOpen}
											onclick={() => (categoryOpen = !categoryOpen)}
										/>
									</span>
									<Menu
										bind:open={categoryOpen}
										anchor={categoryAnchor}
										align="start"
										label="Category"
										items={categoryItems}
										onselect={(item) => (form.category = item.id ?? '')}
									/>
								</div>
								<Field
									label="Low-stock threshold"
									helper="The item reads as low once it holds no more than this. Leave empty for none."
									bind:value={form.threshold}
									mono
									inputmode="decimal"
								/>
								<Field
									label="Tip"
									helper="A line worth knowing about storing or handling it. It shows as the info button beside the name."
									bind:value={form.tip}
									multiline
									rows={2}
								/>
								<div class="detail-actions">
									<Button label="Save" variant="primary" type="submit" disabled={!form.name.trim()} />
									<Button label="Cancel" variant="quiet" onclick={() => (inForm = false)} />
								</div>
							</form>
						</aside>
					{:else if platform === 'desktop' && detail}
						<aside class="detail" aria-labelledby="{uid}-detail">
							<div class="detail-head">
								{@render picture(detail)}
								<h2 class="detail-title" id="{uid}-detail">{detail.name}</h2>
								{#if TIP[detail.id]}
									<IconButton icon="info" size="xs" label="A tip for {detail.name}" tooltip={TIP[detail.id]} />
								{/if}
							</div>
							<dl class="fields">
								<dt>Quantity</dt>
								<dd class="mono">
									{quantity(detail)}
									{#if detail.lowStock}<Badge kind="warning" label="low stock" />{/if}
								</dd>
								<dt>Location</dt>
								<dd><Chip label={locationLabel(detail.location)} /></dd>
								{#if detail.expiry}
									<dt>Expires</dt>
									<dd class="mono">
										{detail.expiry}
										{#if detail.estimated}<Badge kind="estimated" />{/if}
										{#if soon(detail)}<Badge kind="warning" label="this week" />{/if}
									</dd>
								{/if}
								{#if detail.category}
									<dt>Category</dt>
									<dd>{categoryLabel(detail.category)}</dd>
								{/if}
								<dt>Source</dt>
								<dd>
									<Badge kind="origin" label={captured.has(detail.name) ? 'capture' : 'sample'} />
									<span class="mono">{haul.capturedAt}</span>
								</dd>
								{#if detail.lowStock}
									<dt>Low-stock threshold</dt>
									<dd class="mono">10</dd>
								{/if}
							</dl>
							<div class="detail-actions">
								<Button label="Edit" icon="pencil" onclick={() => paneAction('edit', detail)} />
								<Button label="Add to grocery" icon="plus" onclick={() => paneAction('grocery', detail)} />
								<span class="anchor" bind:this={moveAnchor}>
									<Button
										label="Move"
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
									label="Move"
									items={moveItems(detail.location)}
									onselect={(item) => onaction?.(item, toRow(detail))}
								/>
								<Button label="Delete" variant="quiet" onclick={() => paneAction('delete', detail)} />
							</div>
						</aside>
					{/if}
				</div>
				<Menu
					bind:open={bulkMoveOpen}
					anchor={bulkMove?.anchor}
					align="start"
					label="Move"
					items={moveItems(bulkMove?.from)}
					onselect={(item) => {
						if (!bulkMove) return
						bulkAct('move', bulkMove.ids, bulkMove.from, (item.id ?? '').slice('move:'.length) as StockLocation)
					}}
				/>
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
	.picture-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
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

	/* The edit form: the same pane, the fields one under another */
	.form {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.pair {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: var(--space-3);
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
</style>
