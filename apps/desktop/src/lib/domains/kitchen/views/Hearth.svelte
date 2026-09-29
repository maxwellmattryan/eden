<script lang="ts">
	// Hearth's page (product/domains/kitchen.md, "Surfaces"): the header with the domain's tabs and the tab's filters
	// beneath it, then the tab's view. Stock and Grocery are ported from their approved mockups; Recipes and Tips show
	// their empty states until their surfaces are built. The tab lives in the URL so a widget can open one directly.
	import { goto } from '$app/navigation'
	import { resolve } from '$app/paths'
	import { page } from '$app/state'
	import {
		Chip,
		EmptyState,
		InlineError,
		PageHeader,
		Segmented,
		domainGlyph,
		toast,
		type PageHeaderAction,
	} from '@eden/ui-kit'
	import { t } from '@eden/shared/i18n'
	import { undoToast } from '$lib/shell/undo'
	import { KITCHEN_TABS, type KitchenTab } from '../manifest'
	import { kitchen } from '../store.svelte'
	import Grocery from './Grocery.svelte'
	import Stock from './Stock.svelte'

	const uid = $props.id()
	const quickAddId = `${uid}-quick-add`

	const tab = $derived.by<KitchenTab>(() => {
		const requested = page.params.tab ?? ''
		return (KITCHEN_TABS as readonly string[]).includes(requested) ? (requested as KitchenTab) : 'stock'
	})
	const tabItems = $derived(KITCHEN_TABS.map((id) => $t(`domains.kitchen.tabs.${id}`)))
	function selectTab(index: number) {
		void goto(resolve('/kitchen/[[tab]]', { tab: KITCHEN_TABS[index] }), { replaceState: true, noScroll: true })
	}

	// The Stock filters (kitchen.md: sort by expiry, low-stock filter); the sort chip is the mockup's, expiry only.
	let expiring = $state(false)
	let lowStock = $state(false)

	function focusQuickAdd() {
		document.getElementById(quickAddId)?.focus()
	}
	// Capture a haul is Stock's primary action (D-13); the verification sheet arrives with the Gardener.
	function capture() {
		toast({ message: $t('domains.kitchen.capture.notYet') })
	}
	function clearChecked() {
		const { count, undo } = kitchen.clearChecked()
		undoToast($t('domains.kitchen.grocery.toast.cleared', { values: { count } }), undo)
	}

	const actions = $derived.by<PageHeaderAction[]>(() => {
		if (tab === 'stock') {
			return [
				{
					label: $t('domains.kitchen.capture.action'),
					icon: 'camera',
					variant: kitchen.stock.length ? undefined : 'secondary',
					onclick: capture,
				},
				{ label: $t('domains.kitchen.stock.add'), onclick: focusQuickAdd },
			]
		}
		if (tab === 'grocery') {
			return [
				{
					label: $t('domains.kitchen.grocery.add'),
					icon: 'plus',
					variant: kitchen.grocery.items.length ? undefined : 'secondary',
					onclick: focusQuickAdd,
				},
				{ label: $t('domains.kitchen.grocery.clearChecked'), disabled: kitchen.checked === 0, onclick: clearChecked },
			]
		}
		return []
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
				<Chip label={$t('domains.kitchen.stock.sortExpiry')} tone="outline" icon="chevron-down" onclick={() => {}} />
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
		<Stock {quickAddId} {expiring} {lowStock} oncapture={capture} />
	{:else if tab === 'grocery'}
		<Grocery {quickAddId} onadd={focusQuickAdd} />
	{:else}
		<EmptyState title={$t(`domains.kitchen.${tab}.empty.title`)} text={$t(`domains.kitchen.${tab}.empty.text`)} />
	{/if}
</div>

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
</style>
