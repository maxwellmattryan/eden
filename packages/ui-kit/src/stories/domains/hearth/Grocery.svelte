<script lang="ts">
	// Hearth's Grocery view (product/domains/kitchen.md, "Surfaces"): the same header as Stock with the Grocery tab
	// selected and Add as the primary action, a quick-add line that files an item where it was last bought, then one
	// list per store (D-96), all of them on the page at once. A store's list carries its name, its shop day when it has
	// one, the count of what is checked, Complete and Edit store as quiet icon buttons, its rows and an add line of its
	// own. What names no store yet sits in "Miscellaneous" beneath them. Every row carries an origin badge (manual, recipe,
	// low stock); a checked row is struck through and stays until its list is completed. On desktop the pane on the
	// right is the stores; a store's form (its name, what it sells, its shop day) and an item's open in a sheet (D-95). On
	// mobile there is no pane: a swipe to the right checks a row off and a swipe to the left deletes it.
	import {
		Button,
		Chip,
		EmptyState,
		Field,
		IconButton,
		List,
		PageHeader,
		QuickAdd,
		Segmented,
		Sheet,
		domainGlyph,
		type ListRowData,
		type MenuItem,
	} from '$lib/index.js'
	import AppFrame from '../_frame/AppFrame.svelte'
	import SwipeList from '../_frame/SwipeList.svelte'
	import { grocery, ranOut, sidebar, type SampleGroceryItem, type SampleGroceryStore } from '../../sample-data.js'

	type Item = SampleGroceryItem
	type Store = SampleGroceryStore

	type Props = {
		/** Every row checked off: each list is done for its trip. */
		allChecked?: boolean
		/** No items on any list. */
		empty?: boolean
		/** No list has a shop day: the chip is gone from every store. */
		noShopDay?: boolean
		/** Buy it again (D-92): what ran out, beneath the lists, each a row that opens onto a list. */
		buyAgain?: boolean
		onagain?: (row: ListRowData) => void
		/** The item whose form is open in its sheet, by id. */
		editing?: string
		/** The store whose form is open in its sheet, by id. */
		store?: string
		/** A line added: from the page's own field with no store, from a list's field with that store's id. */
		onadd?: (text: string, store?: string) => void
		/** Complete a store's list: what is checked leaves it. Without an id, the unfiled list. */
		oncomplete?: (store?: string) => void
		oncheck?: (row: ListRowData) => void
		ondelete?: (row: ListRowData) => void
		onopen?: (row: ListRowData) => void
		onaction?: (item: MenuItem, row: ListRowData) => void
		/** Save in the item's form, with the item's id. */
		onsave?: (id: string) => void
		/** A store named in the stores pane. */
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
		onadd,
		oncomplete,
		oncheck,
		ondelete,
		onopen,
		onaction,
		onsave,
		onaddstore,
		onsavestore,
		ondeletestore,
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
		chips: item.qty ? [{ label: item.qty, mono: true }] : [],
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
				const rows = empty ? [] : grocery.items.filter((item) => item.listId === list?.id).map(rowOf)
				return {
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
	const headerActions = $derived([
		{
			label: 'Add',
			icon: 'plus' as const,
			variant: empty ? ('secondary' as const) : undefined,
			onclick: () => onadd?.(''),
		},
		{ label: 'Add a store', icon: 'map-pin' as const, onclick: () => onaddstore?.('') },
	])

	// The item's form: the fields of the row being edited. A recipe's name after the origin is the item's note.
	const formOf = (item?: Item) => ({
		name: item?.name ?? '',
		qty: item?.qty ?? '',
		store: storeOf(item),
		note: item?.origin.split(':')[1]?.trim() ?? '',
	})
	// svelte-ignore state_referenced_locally
	let current = $state(editing)
	// svelte-ignore state_referenced_locally
	let itemOpen = $state(!!editing)
	let form = $state(formOf(grocery.items.find((item) => item.id === editing)))
	const edited = $derived(empty ? undefined : grocery.items.find((item) => item.id === current))
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
		return { name: entry?.name ?? '', sells: [...(entry?.sells ?? [])], date: date && `2026-${date}`, time }
	}
	// svelte-ignore state_referenced_locally
	let shown = $state(store)
	// svelte-ignore state_referenced_locally
	let storeOpen = $state(!!store)
	let place = $state(storeForm(grocery.stores.find((entry) => entry.id === store)))
	const opened = $derived(grocery.stores.find((entry) => entry.id === shown))
	function openStore(id?: string) {
		if (!id) return
		place = storeForm(grocery.stores.find((entry) => entry.id === id))
		shown = id
		storeOpen = true
	}
	const storeRows = $derived<ListRowData[]>(
		grocery.stores.map((entry) => ({
			id: entry.id,
			primary: entry.name,
			chips: entry.sells.map((label) => ({ label: title(label) })),
			actions: [
				{ id: 'edit-store', label: 'Edit', icon: 'pencil' as const },
				{ id: 'delete-store', label: 'Delete', icon: 'trash' as const, destructive: true },
			],
		}))
	)
	function actStore(item: MenuItem, row: ListRowData) {
		if (item.id === 'edit-store') openStore(row.id)
		if (item.id === 'delete-store') ondeletestore?.(row.id)
	}
	const againTo: MenuItem[] = [
		...grocery.stores.map((entry) => ({ id: `again:${entry.id}`, label: entry.name })),
		{ id: 'again:', label: ANY },
	]
</script>

<AppFrame current="kitchen" {onnavigate}>
	{#snippet children(platform)}
		<div class="page">
			<PageHeader name={hearth.name} subtitle={hearth.subtitle} icon={domainGlyph('kitchen')} actions={headerActions}>
				{#snippet filters()}
					<Segmented items={TABS} selected={2} label="Hearth sections" />
				{/snippet}
			</PageHeader>

			<div class={['body', { 'body-wide': platform === 'desktop' }]}>
				<div class="lists">
					<QuickAdd placeholder="Add an item" onadd={(text) => onadd?.(text)} />
					{#if total === 0}
						<EmptyState
							title="Nothing to buy"
							text="Add an item in one line, mark what ran out in Stock, or send a recipe's missing ingredients here."
							action={{ label: 'Add an item', icon: 'plus', onclick: () => onadd?.('') }}
						/>
					{/if}
					{#each blocks as block (block.id)}
						<section class="store" aria-labelledby="{uid}-{block.id}">
							<header class="store-head">
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
										<span class="store-count">{block.checked} of {block.rows.length} checked</span>
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
							{/if}
							{#if block.storeId}
								<QuickAdd placeholder="Add to {block.name}" onadd={(text) => onadd?.(text, block.storeId)} />
							{/if}
						</section>
					{/each}
					{#if buyAgain && platform === 'desktop'}
						<List
							header="Buy it again"
							count={ranOut.length}
							rows={ranOut.map((item) => ({
								id: item.id,
								primary: item.name,
								icon: 'package' as const,
								tile: true,
								actions: [
									{ id: 'again', label: 'Add to', icon: 'plus' as const, children: againTo },
									{ id: 'delete', label: 'Delete', icon: 'trash' as const, destructive: true },
								],
							}))}
							onpick={onagain}
							onaction={act}
						/>
					{/if}
				</div>

				{#if platform === 'desktop'}
					<aside class="pane" aria-labelledby="{uid}-pane">
						<h2 class="pane-title" id="{uid}-pane">Stores</h2>
						<List rows={storeRows} onpick={(row) => openStore(row.id)} onaction={actStore} />
						<QuickAdd placeholder="Add a store" parse={() => []} onadd={(text) => onaddstore?.(text)} />
						<p class="help">Each store keeps a list of its own. A new item goes where it was last bought.</p>
					</aside>
				{/if}
			</div>

			{#if platform === 'desktop' && edited}
				<Sheet bind:open={itemOpen} size="sm" labelledby="{uid}-item-title">
					{#snippet header()}
						<h2 class="form-title" id="{uid}-item-title">Edit item</h2>
					{/snippet}
					<form
						class="form"
						id="{uid}-item-form"
						onsubmit={(event) => {
							event.preventDefault()
							onsave?.(edited.id)
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
										bind:selected={() => form.store === entry.id, () => (form.store = entry.id)}
									/>
								{/each}
							</div>
						</div>
						<Field label="Note" bind:value={form.note} />
					</form>
					{#snippet footer()}
						<Button label="Cancel" variant="quiet" onclick={() => (itemOpen = false)} />
						<Button label="Save" variant="primary" type="submit" form="{uid}-item-form" disabled={!form.name.trim()} />
					{/snippet}
				</Sheet>
			{/if}
			{#if platform === 'desktop' && opened}
				<Sheet bind:open={storeOpen} size="sm" labelledby="{uid}-store-title">
					{#snippet header()}
						<h2 class="form-title" id="{uid}-store-title">Edit store</h2>
					{/snippet}
					<form
						class="form"
						id="{uid}-store-form"
						onsubmit={(event) => {
							event.preventDefault()
							onsavestore?.(opened.id)
							storeOpen = false
						}}
					>
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
											(on) =>
												(place.sells = on ? [...place.sells, kind] : place.sells.filter((entry) => entry !== kind))
										}
									/>
								{/each}
							</div>
						</div>
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
						<Button label="Delete store" variant="quiet" icon="trash" onclick={() => ondeletestore?.(opened.id)} />
						<Button label="Cancel" variant="quiet" onclick={() => (storeOpen = false)} />
						<Button
							label="Save"
							variant="primary"
							type="submit"
							form="{uid}-store-form"
							disabled={!place.name.trim()}
						/>
					{/snippet}
				</Sheet>
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
	/* The list on the left and its pane on the right on a wide screen; one column otherwise */
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

	/* The pane: the stores */
	.pane {
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
	.form-title {
		margin: 0;
		font: var(--ed-t-title);
		letter-spacing: var(--ed-t-title-tracking);
		font-variation-settings: var(--ed-t-title-opsz);
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
