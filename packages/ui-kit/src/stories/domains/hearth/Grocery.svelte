<script lang="ts">
	// Hearth's Grocery view (product/domains/kitchen.md, "Surfaces"): the same header as Stock with the Grocery tab
	// selected and one action, Add, whose menu offers Add item and Add store (D-102); then one list per store (D-96),
	// all of them on the page at once. A store's list carries its name in the display face, its shop day when it has
	// one, about what it costs (D-105), Complete, Edit store and Add as quiet icon buttons, and its rows. What names no
	// store yet sits in "Miscellaneous" beneath them. Every row carries an origin badge (manual, recipe, low stock); a
	// checked row is struck through and stays until its list is completed. On desktop the side holds Buy it again
	// and, beneath it, the stores (D-101): each row says what is left to buy and the store's shop day or its last
	// trip, a click goes to its list, and its menu edits, moves and deletes it. An item's form and a store's (its
	// name, what it sells, where it is, a note, its shop day) open in a sheet (D-95), the same one to add as to edit.
	// On mobile there is no side: a swipe to the right checks a row off and a swipe to the left deletes it.
	import {
		Button,
		Chip,
		EmptyState,
		Field,
		FileButton,
		IconButton,
		List,
		PageHeader,
		Segmented,
		Sheet,
		Sketch,
		Thumbnail,
		domainGlyph,
		hearthEmbers,
		type ListRowData,
		type MenuItem,
	} from '$lib/index.js'
	import AppFrame from '../_frame/AppFrame.svelte'
	import SwipeList from '../_frame/SwipeList.svelte'
	import {
		grocery,
		hearthMotif,
		ranOut,
		sidebar,
		type SampleGroceryItem,
		type SampleGroceryStore,
	} from '../../sample-data.js'

	type Item = SampleGroceryItem
	type Store = SampleGroceryStore

	type Props = {
		/** Every row checked off: each list is done for its trip. */
		allChecked?: boolean
		/** No items on any list. */
		empty?: boolean
		/** No list has a shop day: the chip is gone from every store. */
		noShopDay?: boolean
		/** Buy it again (D-92): what ran out, at the side, each a row that opens onto a list. Without it the list is empty. */
		buyAgain?: boolean
		onagain?: (row: ListRowData) => void
		/** The item whose form is open in its sheet, by id. */
		editing?: string
		/** The store whose form is open in its sheet, by id. */
		store?: string
		/** A picture chosen for a store in its form, its website's fetched again, and the one it had removed (D-103). */
		onstorepicture?: (id: string, files: File[]) => void
		onfetchpicture?: (id: string) => void
		onremovepicture?: (id: string) => void
		/** The form open in its sheet to add with: an item's, or a store's. */
		adding?: 'item' | 'store'
		/** Add in the item's form: its name, and its store's id, '' for the unfiled list, none when no store was picked. */
		onadd?: (name: string, store?: string) => void
		/** Complete a store's list: what is checked leaves it. Without an id, the unfiled list. */
		oncomplete?: (store?: string) => void
		oncheck?: (row: ListRowData) => void
		ondelete?: (row: ListRowData) => void
		onopen?: (row: ListRowData) => void
		onaction?: (item: MenuItem, row: ListRowData) => void
		/** Save in the item's form, with the item's id. */
		onsave?: (id: string) => void
		/** A click on a store at the side: go to its list. */
		ongostore?: (id: string) => void
		/** Move up or Move down in a store's menu, as -1 or 1. */
		onmovestore?: (id: string, delta: number) => void
		/** Add in the store's form, with the name it was given. */
		onaddstore?: (name: string) => void
		/** Save in the store's form, with the store's id. */
		onsavestore?: (id: string) => void
		ondeletestore?: (id: string) => void
		onnavigate?: (id: string) => void
	}
	let {
		allChecked = false,
		empty = false,
		noShopDay = false,
		buyAgain = false,
		onagain,
		editing,
		store,
		adding,
		onadd,
		oncomplete,
		oncheck,
		ondelete,
		onopen,
		onaction,
		onsave,
		ongostore,
		onmovestore,
		onaddstore,
		onsavestore,
		ondeletestore,
		onstorepicture,
		onfetchpicture,
		onremovepicture,
		onnavigate,
	}: Props = $props()

	const uid = $props.id()
	const hearth = sidebar.items.find((entry) => entry.id === 'kitchen')!
	const TABS = ['Stock', 'Recipes', 'Grocery']
	const ANY = 'Miscellaneous'
	const SELLS: Store['sells'] = ['grocery', 'home goods']
	const title = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
	const isDone = (item: Item) => allChecked || item.done
	const storeOf = (item?: Item) => grocery.lists.find((list) => list.id === item?.listId)?.storeId ?? ''
	const moveTo = (item: Item): MenuItem[] =>
		[...grocery.stores.map((entry) => ({ id: entry.id, label: entry.name })), { id: '', label: ANY }]
			.filter((entry) => entry.id !== storeOf(item))
			.map((entry) => ({ id: `move:${entry.id}`, label: entry.label }))
	const actionsFor = (item: Item): MenuItem[] => [
		{ id: 'check', label: isDone(item) ? 'Uncheck' : 'Check off', icon: 'check' },
		{ id: 'edit', label: 'Edit', icon: 'pencil' },
		{ id: 'move', label: 'Move to', icon: 'arrow-right', children: moveTo(item) },
		{ id: 'delete', label: 'Delete', icon: 'trash', destructive: true },
	]
	const rowOf = (item: Item): ListRowData => ({
		id: item.id,
		primary: item.name,
		secondary: item.brand,
		chips: [
			...(item.qty ? [{ label: item.qty, mono: true }] : []),
			...(item.size ? [{ id: 'size', label: item.size, mono: true }] : []),
		],
		badges: [{ kind: 'origin' as const, label: item.origin }],
		done: isDone(item),
		checkable: true,
		actions: actionsFor(item),
	})

	// One block per store, in the stores' order, then the unfiled list while it holds anything.
	const blocks = $derived(
		[...grocery.stores, undefined]
			.map((entry) => {
				const list = grocery.lists.find((candidate) => candidate.storeId === entry?.id)
				const items = empty ? [] : grocery.items.filter((item) => item.listId === list?.id)
				const rows = items.map(rowOf)
				// about what the list costs (D-105): each priced line times its bare count, the rest counted apart
				const priced = items.filter((item) => item.price !== undefined)
				const total = priced.reduce((sum, item) => sum + item.price! * (Number(item.qty) || 1), 0)
				return {
					estimate: priced.length ? { total: total.toFixed(2), unpriced: items.length - priced.length } : undefined,
					id: entry?.id ?? 'any',
					storeId: entry?.id,
					name: entry?.name ?? ANY,
					shopDay: noShopDay ? undefined : list?.shopDay,
					rows,
					checked: rows.filter((row) => row.done).length,
				}
			})
			.filter((block) => block.storeId || block.rows.length)
	)
	const total = $derived(blocks.reduce((sum, block) => sum + block.rows.length, 0))
	// One action, whose menu offers what can be added (D-102); secondary while the empty state holds the primary.
	const headerActions = $derived([
		{
			label: 'Add',
			icon: 'plus' as const,
			variant: empty ? ('secondary' as const) : undefined,
			menu: [
				{ id: 'add-item', label: 'Add item', icon: 'list' as const, onselect: () => addItem() },
				{ id: 'add-store', label: 'Add store', icon: 'map-pin' as const, onselect: () => addStore() },
			],
		},
	])

	// The item's form: the fields of the row being edited, or blank to add with. A recipe's name after the origin is
	// the item's note. `store` is the store's id, '' for the unfiled list; none while adding means no store is picked.
	type ItemForm = { name: string; qty: string; store: string | undefined; note: string }
	const formOf = (item?: Item): ItemForm => ({
		name: item?.name ?? '',
		qty: item?.qty ?? '',
		store: item ? storeOf(item) : undefined,
		note: item?.origin.split(':')[1]?.trim() ?? '',
	})
	// svelte-ignore state_referenced_locally
	let current = $state(editing)
	// svelte-ignore state_referenced_locally
	let itemOpen = $state(!!editing || adding === 'item')
	let form = $state(formOf(grocery.items.find((item) => item.id === editing)))
	const edited = $derived(empty ? undefined : grocery.items.find((item) => item.id === current))
	/** Opens the item's form blank, with a list's store picked when its own Add opened it ('' for the unfiled list). */
	function addItem(storeId?: string) {
		form = { ...formOf(), store: storeId }
		current = undefined
		itemOpen = true
	}
	function act(item: MenuItem, row: ListRowData) {
		if (item.id === 'edit') {
			form = formOf(grocery.items.find((entry) => entry.id === row.id))
			current = row.id
			itemOpen = true
		}
		onaction?.(item, row)
	}

	// The store's form; the shop day (`Sat 10-03 10:00`) as its date and time fields hold it.
	const TODAY = '2026-10-01'
	const TOMORROW = '2026-10-02'
	function storeForm(entry?: Store) {
		const shopDay = noShopDay ? undefined : grocery.lists.find((list) => list.storeId === entry?.id)?.shopDay
		const [, date = '', time = ''] = /(\d{2}-\d{2}) (\d{2}:\d{2})/.exec(shopDay ?? '') ?? []
		return {
			name: entry?.name ?? '',
			sells: [...(entry?.sells ?? SELLS.slice(0, 1))],
			address: entry?.address ?? '',
			url: entry?.url ?? '',
			phone: entry?.phone ?? '',
			note: entry?.note ?? '',
			date: date && `2026-${date}`,
			time,
		}
	}
	// svelte-ignore state_referenced_locally
	let shown = $state(store)
	// svelte-ignore state_referenced_locally
	let storeOpen = $state(!!store || adding === 'store')
	let place = $state(storeForm(grocery.stores.find((entry) => entry.id === store)))
	const opened = $derived(grocery.stores.find((entry) => entry.id === shown))
	function openStore(id?: string) {
		if (!id) return
		place = storeForm(grocery.stores.find((entry) => entry.id === id))
		shown = id
		storeOpen = true
	}
	function addStore() {
		place = storeForm()
		shown = undefined
		storeOpen = true
	}
	/** The dataset's today, which a store's last trip is counted from. */
	const SAMPLE_TODAY = '2026-09-30'
	const shopped = (on: string) =>
		`Shopped ${Math.round((Date.parse(SAMPLE_TODAY) - Date.parse(`2026-${on}`)) / 86_400_000)} days ago`
	const storeRows = $derived<ListRowData[]>(
		blocks
			.filter((block) => block.storeId)
			.map((block, at, all) => {
				const entry = grocery.stores.find((candidate) => candidate.id === block.storeId)!
				const left = block.rows.length - block.checked
				return {
					id: entry.id,
					primary: entry.name,
					hint: entry.note,
					thumbnail: entry.picture,
					icon: 'store' as const,
					tile: true,
					chips: block.shopDay
						? [{ label: block.shopDay, icon: 'calendar' as const }]
						: entry.shoppedOn
							? [{ label: shopped(entry.shoppedOn) }]
							: [],
					meta: left ? `${left} left` : undefined,
					actions: [
						{ id: 'edit-store', label: 'Edit', icon: 'pencil' as const },
						...(entry.url ? [{ id: 'website', label: 'Open website', icon: 'external-link' as const }] : []),
						...(at > 0 ? [{ id: 'up', label: 'Move up', icon: 'chevron-up' as const }] : []),
						...(at < all.length - 1 ? [{ id: 'down', label: 'Move down', icon: 'chevron-down' as const }] : []),
						{ id: 'delete-store', label: 'Delete', icon: 'trash' as const, destructive: true },
					],
				}
			})
	)
	function actStore(item: MenuItem, row: ListRowData) {
		if (item.id === 'edit-store') openStore(row.id)
		if (item.id === 'up') onmovestore?.(row.id, -1)
		if (item.id === 'down') onmovestore?.(row.id, 1)
		if (item.id === 'delete-store') ondeletestore?.(row.id)
	}
	const againTo: MenuItem[] = [
		...grocery.stores.map((entry) => ({ id: `again:${entry.id}`, label: entry.name })),
		{ id: 'again:', label: ANY },
	]
	const againRows = $derived<ListRowData[]>(
		buyAgain
			? ranOut.map((item) => ({
					id: item.id,
					primary: item.name,
					icon: 'package' as const,
					tile: true,
					actions: [
						{ id: 'again', label: 'Add to', icon: 'plus' as const, children: againTo },
						{ id: 'delete', label: 'Delete', icon: 'trash' as const, destructive: true },
					],
				}))
			: []
	)
</script>

<AppFrame current="kitchen" {onnavigate}>
	{#snippet children(platform)}
		<div class="page">
			<PageHeader name={hearth.name} subtitle={hearth.subtitle} icon={domainGlyph('kitchen')} actions={headerActions}>
				<!-- the page's one live thing (D-123): the stock as sparks off a fire, the same on every tab -->
				{#snippet motif()}
					<Sketch sketch={hearthEmbers} params={hearthMotif} />
				{/snippet}
				{#snippet legend()}
					{hearthMotif.items} in stock, {hearthMotif.expiring} expiring soon
				{/snippet}
				{#snippet filters()}
					<Segmented items={TABS} selected={2} label="Hearth sections" />
				{/snippet}
			</PageHeader>

			<div class={['body', { 'body-wide': platform === 'desktop' }]}>
				<div class="lists">
					{#if total === 0}
						<EmptyState
							title="Nothing to buy"
							text="Add an item, mark what ran out in Stock, or send a recipe's missing ingredients here."
							action={{ label: 'Add an item', icon: 'plus', onclick: () => addItem() }}
						/>
					{/if}
					{#each blocks as block (block.id)}
						<section class="store" aria-labelledby="{uid}-{block.id}">
							<header class="store-head">
								{#if block.storeId}
									<Thumbnail
										size="md"
										src={grocery.stores.find((entry) => entry.id === block.storeId)?.picture}
										icon="store"
									/>
								{/if}
								<h2 class="store-title" id="{uid}-{block.id}">{block.name}</h2>
								{#if block.shopDay}
									<Chip
										label={block.shopDay}
										icon="calendar"
										tone="outline"
										onclick={platform === 'desktop' ? () => openStore(block.storeId) : undefined}
									/>
								{/if}
								<span class="store-tools">
									{#if block.rows.length}
										{#if block.estimate}
											<span class="store-count">
												about ${block.estimate.total}{block.estimate.unpriced
													? `, ${block.estimate.unpriced} unpriced`
													: ''}
											</span>
										{/if}
									{/if}
									<IconButton
										icon="check-check"
										size="xs"
										label="Complete {block.name}"
										tooltip="Complete: clear what is checked"
										disabled={block.checked === 0}
										onclick={() => oncomplete?.(block.storeId)}
									/>
									{#if block.storeId && platform === 'desktop'}
										<IconButton
											icon="pencil"
											size="xs"
											label="Edit {block.name}"
											tooltip="Edit store"
											onclick={() => openStore(block.storeId)}
										/>
									{/if}
									<IconButton
										icon="plus"
										size="xs"
										label="Add to {block.name}"
										tooltip="Add item"
										onclick={() => addItem(block.storeId ?? '')}
									/>
								</span>
							</header>
							{#if block.rows.length && block.checked === block.rows.length}
								<p class="voice">Everything is checked. Complete the list once you are home.</p>
							{/if}
							{#if block.rows.length && platform === 'desktop'}
								<List rows={block.rows} onpick={oncheck} oncheck={(row) => oncheck?.(row)} onaction={act} />
							{:else if block.rows.length}
								<div class="card">
									<SwipeList
										rows={block.rows}
										leading={(row) => ({ label: 'Check off', icon: 'check', onaction: () => oncheck?.(row) })}
										trailing={(row) => ({ label: 'Delete', icon: 'trash', onaction: () => ondelete?.(row) })}
										{onopen}
									/>
								</div>
							{:else if total > 0}
								<EmptyState
									inline
									title="No items in this list yet"
									text="Add one here, or mark what ran out in Stock."
									action={{ label: 'Add item', icon: 'plus', onclick: () => addItem(block.storeId ?? '') }}
								/>
							{/if}
						</section>
					{/each}
				</div>

				{#if platform === 'desktop'}
					<div class="side">
						<List header="Buy it again" count={againRows.length} rows={againRows} onpick={onagain} onaction={act}>
							{#if !againRows.length}
								<p class="voice none">Nothing to buy again.</p>
							{/if}
						</List>
						<List
							header="Stores"
							count={storeRows.length}
							rows={storeRows}
							onpick={(row) => ongostore?.(row.id)}
							onopen={(row) => openStore(row.id)}
							onaction={actStore}
						/>
					</div>
				{/if}
			</div>

			<Sheet bind:open={itemOpen} size="sm" labelledby="{uid}-item-title">
				{#snippet header()}
					<h2 class="form-title" id="{uid}-item-title">{edited ? 'Edit item' : 'Add item'}</h2>
				{/snippet}
				<form
					class="form"
					id="{uid}-item-form"
					onsubmit={(event) => {
						event.preventDefault()
						if (edited) onsave?.(edited.id)
						else onadd?.(form.name.trim(), form.store)
						itemOpen = false
					}}
				>
					<Field label="Name" bind:value={form.name} />
					<Field label="Quantity" bind:value={form.qty} mono />
					<div class="group" role="group" aria-labelledby="{uid}-where">
						<span class="group-label" id="{uid}-where">Store</span>
						<div class="chips">
							{#each [...grocery.stores.map( (entry) => ({ id: entry.id, label: entry.name }) ), { id: '', label: ANY }] as entry (entry.id)}
								<Chip
									label={entry.label}
									selectable
									tone={form.store === entry.id ? 'accent' : 'outline'}
									bind:selected={
										() => form.store === entry.id, (on) => (form.store = on || edited ? entry.id : undefined)
									}
								/>
							{/each}
						</div>
						{#if !edited}
							<p class="help">With no store picked, it goes where it was last bought.</p>
						{/if}
					</div>
					<Field label="Note" bind:value={form.note} />
				</form>
				{#snippet footer()}
					<Button label="Cancel" variant="quiet" onclick={() => (itemOpen = false)} />
					<Button
						label={edited ? 'Save' : 'Add'}
						variant="primary"
						type="submit"
						form="{uid}-item-form"
						disabled={!form.name.trim()}
					/>
				{/snippet}
			</Sheet>
			<Sheet bind:open={storeOpen} size="sm" labelledby="{uid}-store-title">
				{#snippet header()}
					<h2 class="form-title" id="{uid}-store-title">{opened ? 'Edit store' : 'Add store'}</h2>
				{/snippet}
				<form
					class="form"
					id="{uid}-store-form"
					onsubmit={(event) => {
						event.preventDefault()
						if (opened) onsavestore?.(opened.id)
						else onaddstore?.(place.name.trim())
						storeOpen = false
					}}
				>
					{#if opened}
						<div class="picture-row">
							<Thumbnail size="md" src={opened.picture} icon="store" />
							<FileButton
								label="Choose a picture"
								icon="image-plus"
								accept={['image/jpeg', 'image/png', 'image/webp']}
								multiple={false}
								tooltip
								onfiles={(files) => onstorepicture?.(opened.id, files)}
							/>
							{#if place.url.trim()}
								<IconButton
									icon="refresh-cw"
									size="sm"
									label="Fetch the picture from the website"
									tooltip
									onclick={() => onfetchpicture?.(opened.id)}
								/>
							{/if}
							{#if opened.picture}
								<IconButton
									icon="trash"
									size="sm"
									label="Remove the picture"
									danger
									tooltip
									onclick={() => onremovepicture?.(opened.id)}
								/>
							{/if}
						</div>
					{/if}
					<Field label="Name" bind:value={place.name} />
					<div class="group" role="group" aria-labelledby="{uid}-sells">
						<span class="group-label" id="{uid}-sells">Sells</span>
						<div class="chips">
							{#each SELLS as kind (kind)}
								<Chip
									label={title(kind)}
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
					<Field label="Address" bind:value={place.address} />
					<div class="pair">
						<Field label="Website" type="url" bind:value={place.url} />
						<Field label="Phone" type="tel" bind:value={place.phone} />
					</div>
					<Field label="Note" multiline bind:value={place.note} />
					<div class="pair">
						<Field label="Shop day" type="date" bind:value={place.date} />
						<Field label="Time" type="time" bind:value={place.time} disabled={!place.date} />
					</div>
					<div class="chips">
						<Chip label="Today" tone="outline" onclick={() => (place.date = TODAY)} />
						<Chip label="Tomorrow" tone="outline" onclick={() => (place.date = TOMORROW)} />
						{#if place.date}
							<Chip
								label="No shop day"
								tone="outline"
								onclick={() => {
									place.date = ''
									place.time = ''
								}}
							/>
						{/if}
					</div>
					<p class="help">Optional. With a shop day set, a reminder arrives that morning.</p>
				</form>
				{#snippet footer()}
					{#if opened}
						<Button label="Delete store" variant="danger" onclick={() => ondeletestore?.(opened.id)} />
					{/if}
					<Button label="Cancel" variant="quiet" onclick={() => (storeOpen = false)} />
					<Button
						label={opened ? 'Save' : 'Add'}
						variant="primary"
						type="submit"
						form="{uid}-store-form"
						disabled={!place.name.trim()}
					/>
				{/snippet}
			</Sheet>
		</div>
	{/snippet}
</AppFrame>

<style>
	.page {
		display: flex;
		flex-direction: column;
		padding-bottom: var(--space-8);
	}
	/* The lists on the left and the side on the right on a wide screen; one column otherwise */
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
	.body-wide .store-tools {
		padding-right: calc(1px + var(--space-2) + var(--space-1));
	}
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

	.none {
		padding: var(--space-3);
	}
	/* The side: Buy it again (D-92), and beneath it the stores (D-101) */
	.side {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	.form-title {
		margin: 0;
		font: var(--ed-t-title);
		letter-spacing: var(--ed-t-title-tracking);
		font-variation-settings: var(--ed-t-title-opsz);
	}
	/* the store's picture with the buttons that change it */
	.picture-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
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
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.group {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.group-label {
		font: var(--ed-t-label);
		letter-spacing: var(--ed-t-label-tracking);
		color: var(--text-primary);
	}
	.help {
		margin: 0;
		font: var(--ed-t-body-sm);
		letter-spacing: var(--ed-t-body-sm-tracking);
		color: var(--text-secondary);
	}
</style>
