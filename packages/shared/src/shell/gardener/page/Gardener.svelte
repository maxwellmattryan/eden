<script lang="ts">
	// The Gardener's page (product/substrate/ai.md, "Surfaces"; D-113): the header with its tabs, then the tab's
	// view: what the Gardener came to, its conversations, the audit log, the tools. The conversation itself stays in
	// the panel docked beside whatever page is open (the chat sheet on the phone); this is where everything about it
	// is looked up. The tab lives in the address, so the audit log and the tools keep the addresses they had as pages
	// of their own: each app's route hands its `tab` parameter in, and a pick goes back through the navigation seam.
	// On the phone the four tabs are named without their icons, so they fit the width (D-TBD(gardener-page-phone)).
	import { PageHeader, Segmented, domainGlyph, type SegmentedItem } from '@eden/ui-kit'
	import { t } from '../../../i18n/index.js'
	import { navigation } from '../../../navigation/index.js'
	import AuditTab from './AuditTab.svelte'
	import { compactPage } from './compact.js'
	import ConversationsTab from './ConversationsTab.svelte'
	import { GARDENER_TAB_ICONS, GARDENER_TABS, type GardenerTab } from './tabs.js'
	import ToolsTab from './ToolsTab.svelte'
	import UsageTab from './UsageTab.svelte'

	type Props = {
		/** The route's `tab` parameter as the address has it; anything that is not a tab is Usage. */
		tab?: string
	}
	let { tab: requested = '' }: Props = $props()

	const compact = compactPage()
	const tab = $derived<GardenerTab>(
		(GARDENER_TABS as readonly string[]).includes(requested) ? (requested as GardenerTab) : 'usage'
	)
	const tabItems = $derived<SegmentedItem[]>(
		GARDENER_TABS.map((id) => ({
			label: $t(`gardenerPage.tabs.${id}`),
			icon: compact ? undefined : GARDENER_TAB_ICONS[id],
		}))
	)
	function selectTab(index: number) {
		void navigation.open({ place: 'gardener', tab: GARDENER_TABS[index] }, { replace: true, noScroll: true })
	}
</script>

<div class={['page', compact && 'page-compact']}>
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
	/* the phone: four named tabs in one row, each with less room beside its word */
	.page-compact :global(.ed-seg-tab) {
		padding: 0 var(--space-2);
	}
</style>
