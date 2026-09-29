<script lang="ts">
	// Hearth's Grocery view, ported from Domains/Hearth/Grocery: a quick-add line, then the active list grouped by
	// store with the shop-day Event beside each store's name. Every row carries an origin badge (manual, recipe, low
	// stock); a checked row is struck through and stays until Clear checked.
	import { Chip, EmptyState, List, QuickAdd, type ListRowData, type MenuItem } from '@eden/ui-kit'
	import { locale, t } from '@eden/shared/i18n'
	import { settings } from '@eden/shared/settings'
	import { undoToast } from '$lib/shell/undo'
	import { formatEventTime } from '@eden/shared/dates'
	import { kitchen, type GroceryItem } from '../store.svelte'

	type Props = {
		/** The id the page's Add action focuses. */
		quickAddId: string
		/** The empty state's primary action: focus the quick-add line. */
		onadd: () => void
	}
	let { quickAddId, onadd }: Props = $props()

	const uid = $props.id()
	const lang = $derived($locale ?? 'en')
	const format = $derived({ lang, clock: settings.clock })

	const originLabel = (item: GroceryItem) => {
		const origin = $t(`domains.kitchen.grocery.origin.${item.origin === 'low-stock' ? 'lowStock' : item.origin}`)
		return item.note ? `${origin}: ${item.note}` : origin
	}
	const actionsFor = (item: GroceryItem): MenuItem[] => [
		{
			id: 'check',
			label: $t(item.done ? 'domains.kitchen.grocery.actions.uncheck' : 'domains.kitchen.grocery.actions.check'),
			icon: 'check',
		},
		{ id: 'delete', label: $t('domains.kitchen.grocery.actions.delete'), icon: 'trash', destructive: true },
	]
	const toRow = (item: GroceryItem): ListRowData => ({
		id: item.id,
		primary: item.name,
		chips: item.qty ? [{ label: item.qty, mono: true }] : [],
		badges: [{ kind: 'origin' as const, label: originLabel(item) }],
		done: item.done,
		actions: actionsFor(item),
	})

	/** One group per store, the list's own store for the items that name none. */
	const groups = $derived.by(() => {
		const stores: { store: string; items: GroceryItem[] }[] = []
		for (const item of kitchen.grocery.items) {
			const store = item.store ?? kitchen.grocery.store
			const group = stores.find((entry) => entry.store === store)
			if (group) group.items.push(item)
			else stores.push({ store, items: [item] })
		}
		return stores.map((group) => ({ ...group, checked: group.items.filter((item) => item.done).length }))
	})

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
	function onaction(menuItem: MenuItem, row: ListRowData) {
		if (menuItem.id === 'check') toggle(row.id)
		else if (menuItem.id === 'delete') remove(row.id)
	}
	function add(text: string) {
		const { item, undo } = kitchen.addGrocery(text)
		undoToast($t('domains.kitchen.grocery.toast.added', { values: { name: item.name } }), undo)
	}
</script>

<div class="body">
	<QuickAdd id={quickAddId} placeholder={$t('domains.kitchen.grocery.addPlaceholder')} onadd={add} />
	{#if kitchen.grocery.items.length === 0}
		<EmptyState
			title={$t('domains.kitchen.grocery.empty.title')}
			text={$t('domains.kitchen.grocery.empty.text')}
			action={{ label: $t('domains.kitchen.grocery.empty.action'), icon: 'plus', onclick: onadd }}
		/>
	{:else}
		{#each groups as group (group.store)}
			<section class="store" aria-labelledby="{uid}-{group.store}">
				<header class="store-head">
					<h2 class="store-title" id="{uid}-{group.store}">{group.store}</h2>
					{#if kitchen.grocery.shopDay}
						<Chip label={formatEventTime(kitchen.grocery.shopDay, format)} icon="calendar" tone="outline" />
					{/if}
					<span class="store-count">
						{$t('domains.kitchen.grocery.checked', { values: { checked: group.checked, total: group.items.length } })}
					</span>
				</header>
				{#if group.checked === group.items.length}
					<p class="voice">{$t('domains.kitchen.grocery.allChecked')}</p>
				{/if}
				<List
					header={kitchen.grocery.name || group.store}
					count={group.items.length}
					rows={group.items.map(toRow)}
					selectable
					onopen={(row) => toggle(row.id)}
					{onaction}
				/>
			</section>
		{/each}
	{/if}
</div>

<style>
	.body {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding: 0 var(--ed-gutter);
		max-width: calc(var(--sheet-max) * 0.8);
	}
	/* One group per store: its name, the shop-day Event beside it, and the count of what is checked */
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
	.store-count {
		margin-left: auto;
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
