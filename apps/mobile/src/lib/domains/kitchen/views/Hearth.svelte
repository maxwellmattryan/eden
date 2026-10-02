<script lang="ts">
	// Hearth's page on the phone (product/domains/kitchen.md, "Surfaces" and "Mobile"): the header with the domain's
	// tabs and the tab's filters beneath it, then the tab's view: the phone's own Stock and Grocery, and the shared
	// Recipes. The tab lives in the URL, as on the desktop, so a tile or the Gardener's draft can open one; with none
	// the page opens on Grocery, the phone's primary surface (D-TBD(phone-hearth)). Capture a haul and Take stock open
	// the capture sheet (D-13, D-86, D-89), which the phone's shell mounts over any page; the floating + reaches it too.
	import {
		Chip,
		InlineError,
		Menu,
		PageHeader,
		Segmented,
		Sketch,
		domainGlyph,
		hearthEmbers,
		type HearthEmbersParams,
		type IconName,
		type MenuItem,
		type PageHeaderAction,
		type SegmentedItem,
	} from '@eden/ui-kit'
	import { capture, kitchen, recipeDrafts, recipeImport, type StockSort } from '@eden/shared/domains/kitchen'
	import RecipeImportSheet from '@eden/shared/domains/kitchen/views/RecipeImportSheet.svelte'
	import Recipes from '@eden/shared/domains/kitchen/views/Recipes.svelte'
	import { t } from '@eden/shared/i18n'
	import { declarationOf, type TabId } from '@eden/shared/manifest'
	import { navigation } from '@eden/shared/navigation'
	import Grocery from './Grocery.svelte'
	import Stock from './Stock.svelte'

	type KitchenTab = TabId<'kitchen'>
	const KITCHEN_TABS: readonly KitchenTab[] = declarationOf('kitchen').tabs.map((entry) => entry.id)

	/** The Stock view, whose Add to stock sheet the header's Add opens (D-109). */
	let stock = $state<Stock>()
	/** The Grocery view, whose sheets the header's Add menu opens. */
	let grocery = $state<Grocery>()

	const tab = $derived.by<KitchenTab>(() => {
		const requested = navigation.tab ?? ''
		return (KITCHEN_TABS as readonly string[]).includes(requested) ? (requested as KitchenTab) : 'grocery'
	})
	const TAB_ICONS: Record<KitchenTab, IconName> = { stock: 'refrigerator', recipes: 'book-open', grocery: 'list' }
	const tabItems = $derived<SegmentedItem[]>(
		KITCHEN_TABS.map((id) => ({ label: $t(`domains.kitchen.tabs.${id}`), icon: TAB_ICONS[id] }))
	)
	function selectTab(index: number) {
		void navigation.open({ place: 'kitchen', tab: KITCHEN_TABS[index] }, { replace: true, noScroll: true })
	}

	// The header's motif (D-123): what is in stock and how much of it is expiring, the same on every tab.
	const embers = $derived.by<HearthEmbersParams | undefined>(() => {
		if (!kitchen.ready) return undefined
		const held = kitchen.stock.filter((item) => !kitchen.out(item))
		return { items: held.length, expiring: held.filter((item) => kitchen.soon(item)).length }
	})

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

	const actions = $derived.by<PageHeaderAction[]>(() => {
		if (tab === 'stock') {
			return [
				{ label: $t('domains.kitchen.capture.action'), icon: 'camera', onclick: () => capture.start() },
				{
					label: $t('domains.kitchen.capture.takeStock'),
					icon: 'refrigerator',
					onclick: () => capture.start([], 'stock'),
				},
				{ label: $t('domains.kitchen.stock.add'), icon: 'plus', onclick: () => stock?.addItem() },
			]
		}
		if (tab === 'recipes') {
			return [{ label: $t('domains.kitchen.recipes.add'), icon: 'plus', onclick: () => recipeImport.start() }]
		}
		// one Add, whose menu offers what can be added (D-102)
		return [
			{
				label: $t('domains.kitchen.grocery.add'),
				icon: 'plus',
				variant: kitchen.grocery.items.length ? undefined : 'secondary',
				menu: [
					{
						id: 'item',
						label: $t('domains.kitchen.grocery.addItem'),
						icon: 'list',
						onselect: () => grocery?.addItem(),
					},
					{
						id: 'store',
						label: $t('domains.kitchen.grocery.addStore'),
						icon: 'map-pin',
						onselect: () => grocery?.addStore(),
					},
				],
			},
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
		<!-- the page's one live thing: the stock as sparks off a fire -->
		{#snippet motif()}
			{#if embers}<Sketch sketch={hearthEmbers} params={embers} />{/if}
		{/snippet}
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
			{/if}
		{/snippet}
	</PageHeader>

	{#if kitchen.saveFailed}
		<div class="notice">
			<InlineError message={$t('domains.kitchen.saveFailed')} onretry={() => kitchen.flush()} live />
		</div>
	{/if}

	{#if tab === 'stock'}
		<Stock bind:this={stock} {expiring} {lowStock} {sort} ontakestock={() => capture.start([], 'stock')} />
	{:else if tab === 'recipes'}
		<Recipes />
	{:else}
		<Grocery bind:this={grocery} />
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
