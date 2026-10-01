<script lang="ts">
	// Hearth's page (product/domains/kitchen.md, "Surfaces"): the header with the domain's tabs and the tab's filters
	// beneath it, then the tab's view: Stock, Recipes, Grocery. The tab lives in the URL so a widget can open one
	// directly. Capture a haul is Stock's primary action (D-13) and opens the capture sheet at once (D-86); Take stock
	// opens the same sheet on photos of the shelves as they stand (D-89).
	import { goto } from '$app/navigation'
	import { resolve } from '$app/paths'
	import { page } from '$app/state'
	import {
		Chip,
		InlineError,
		Menu,
		PageHeader,
		Segmented,
		domainGlyph,
		type IconName,
		type MenuItem,
		type PageHeaderAction,
		type SegmentedItem,
	} from '@eden/ui-kit'
	import { t } from '@eden/shared/i18n'
	import { undoToast } from '$lib/shell/undo'
	import { capture } from '../capture.svelte'
	import { KITCHEN_TABS, type KitchenTab } from '../manifest'
	import { recipeDrafts, recipeImport } from '../recipe-draft.svelte'
	import { kitchen, type StockSort } from '../store.svelte'
	import Grocery from './Grocery.svelte'
	import RecipeImportSheet from './RecipeImportSheet.svelte'
	import Recipes from './Recipes.svelte'
	import Stock from './Stock.svelte'

	const uid = $props.id()
	const quickAddId = `${uid}-quick-add`

	const tab = $derived.by<KitchenTab>(() => {
		const requested = page.params.tab ?? ''
		return (KITCHEN_TABS as readonly string[]).includes(requested) ? (requested as KitchenTab) : 'stock'
	})
	const TAB_ICONS: Record<KitchenTab, IconName> = { stock: 'refrigerator', recipes: 'book-open', grocery: 'list' }
	const tabItems = $derived<SegmentedItem[]>(
		KITCHEN_TABS.map((id) => ({ label: $t(`domains.kitchen.tabs.${id}`), icon: TAB_ICONS[id] }))
	)
	function selectTab(index: number) {
		void goto(resolve('/kitchen/[[tab]]', { tab: KITCHEN_TABS[index] }), { replaceState: true, noScroll: true })
	}

	// The Stock filters (kitchen.md: sort by expiry, low-stock filter), and how each location is ordered.
	let expiring = $state(false)
	let lowStock = $state(false)
	let sort = $state<StockSort>('expiry')
	const SORTS: readonly StockSort[] = ['expiry', 'name', 'added']
	const sortItems = $derived<MenuItem[]>(
		SORTS.map((id) => ({ id, label: $t(`domains.kitchen.stock.sort.${id}`), checked: sort === id }))
	)
	let sortAnchor = $state<HTMLElement>()
	let sortOpen = $state(false)

	function focusQuickAdd() {
		document.getElementById(quickAddId)?.focus()
	}
	function clearChecked() {
		const { count, undo } = kitchen.clearChecked()
		undoToast($t('domains.kitchen.grocery.toast.cleared', { values: { count } }), undo)
	}

	const actions = $derived.by<PageHeaderAction[]>(() => {
		if (tab === 'stock') {
			return [
				{ label: $t('domains.kitchen.capture.action'), icon: 'camera', onclick: () => capture.start() },
				{
					label: $t('domains.kitchen.capture.takeStock'),
					icon: 'refrigerator',
					onclick: () => capture.start([], 'stock'),
				},
				{ label: $t('domains.kitchen.stock.add'), onclick: focusQuickAdd },
			]
		}
		if (tab === 'recipes') {
			return [{ label: $t('domains.kitchen.recipes.add'), icon: 'plus', onclick: () => recipeImport.start() }]
		}
		return [
			{
				label: $t('domains.kitchen.grocery.add'),
				icon: 'plus',
				variant: kitchen.grocery.items.length ? undefined : 'secondary',
				onclick: focusQuickAdd,
			},
			{ label: $t('domains.kitchen.grocery.clearChecked'), disabled: kitchen.checked === 0, onclick: clearChecked },
		]
	})
</script>

<div class="page">
	<PageHeader
		name={$t('domains.kitchen.name')}
		subtitle={$t('domains.kitchen.subtitle')}
		icon={domainGlyph('kitchen')}
		{actions}
	>
		{#snippet filters()}
			<Segmented
				items={tabItems}
				selected={KITCHEN_TABS.indexOf(tab)}
				label={$t('domains.kitchen.tabsLabel')}
				onchange={selectTab}
			/>
			{#if tab === 'stock'}
				<Chip
					label={$t('domains.kitchen.stock.expiring')}
					tone="outline"
					icon="clock"
					selectable
					bind:selected={expiring}
				/>
				<Chip label={$t('domains.kitchen.stock.lowStock')} tone="outline" selectable bind:selected={lowStock} />
				<span class="anchor" bind:this={sortAnchor}>
					<Chip
						label={$t('domains.kitchen.stock.sortBy', { values: { sort: $t(`domains.kitchen.stock.sort.${sort}`) } })}
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
					label={$t('domains.kitchen.stock.sortLabel')}
					items={sortItems}
					onselect={(item) => (sort = (item.id as StockSort | undefined) ?? 'expiry')}
				/>
			{:else if tab === 'grocery' && kitchen.grocery.name}
				<Chip label={kitchen.grocery.name} tone="accent" icon="list" />
			{/if}
		{/snippet}
	</PageHeader>

	{#if kitchen.saveFailed}
		<div class="notice">
			<InlineError message={$t('domains.kitchen.saveFailed')} onretry={() => kitchen.flush()} live />
		</div>
	{/if}

	{#if tab === 'stock'}
		<Stock {quickAddId} {expiring} {lowStock} {sort} ontakestock={() => capture.start([], 'stock')} />
	{:else if tab === 'recipes'}
		<Recipes />
	{:else}
		<Grocery {quickAddId} onadd={focusQuickAdd} />
	{/if}
</div>

<RecipeImportSheet
	ondraft={() => {
		if (tab !== 'recipes' && recipeDrafts.current) selectTab(KITCHEN_TABS.indexOf('recipes'))
	}}
/>

<style>
	.page {
		flex: 1 0 auto;
		display: flex;
		flex-direction: column;
		padding-bottom: var(--space-8);
	}
	.notice {
		padding: 0 var(--ed-gutter) var(--space-4);
	}
	.anchor {
		display: inline-flex;
	}
</style>
