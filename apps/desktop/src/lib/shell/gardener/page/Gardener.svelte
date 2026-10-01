<script lang="ts">
	// The Gardener's page (product/substrate/ai.md, "Surfaces"; D-113): the header with its tabs, then the tab's
	// view: what the Gardener came to, its conversations, the audit log, the tools. The conversation itself stays in
	// the panel docked beside whatever page is open; this is where everything about it is looked up. The tab lives in
	// the address, so the audit log and the tools keep the addresses they had as pages of their own.
	import { goto } from '$app/navigation'
	import { resolve } from '$app/paths'
	import { page } from '$app/state'
	import { PageHeader, Segmented, domainGlyph, type SegmentedItem } from '@eden/ui-kit'
	import { t } from '@eden/shared/i18n'
	import AuditTab from './AuditTab.svelte'
	import ConversationsTab from './ConversationsTab.svelte'
	import { GARDENER_TAB_ICONS, GARDENER_TABS, type GardenerTab } from './tabs'
	import ToolsTab from './ToolsTab.svelte'
	import UsageTab from './UsageTab.svelte'

	const tab = $derived.by<GardenerTab>(() => {
		const requested = page.params.tab ?? ''
		return (GARDENER_TABS as readonly string[]).includes(requested) ? (requested as GardenerTab) : 'usage'
	})
	const tabItems = $derived<SegmentedItem[]>(
		GARDENER_TABS.map((id) => ({ label: $t(`gardenerPage.tabs.${id}`), icon: GARDENER_TAB_ICONS[id] }))
	)
	function selectTab(index: number) {
		void goto(resolve('/gardener/[[tab]]', { tab: GARDENER_TABS[index] }), { replaceState: true, noScroll: true })
	}
</script>

<div class="page">
	<PageHeader name={$t('shell.gardener')} subtitle={$t('shell.gardenerSubtitle')} icon={domainGlyph('gardener')}>
		{#snippet filters()}
			<Segmented
				items={tabItems}
				selected={GARDENER_TABS.indexOf(tab)}
				label={$t('gardenerPage.tabsLabel')}
				onchange={selectTab}
			/>
		{/snippet}
	</PageHeader>

	{#if tab === 'usage'}
		<UsageTab />
	{:else if tab === 'conversations'}
		<ConversationsTab />
	{:else if tab === 'audit'}
		<AuditTab />
	{:else}
		<ToolsTab />
	{/if}
</div>

<style>
	.page {
		flex: 1 0 auto;
		display: flex;
		flex-direction: column;
		padding-bottom: var(--space-8);
	}
</style>
