<script lang="ts">
	// The phone's settings drawer (product/substrate/settings-utilities.md; D-159): one full-height
	// bottom sheet with two levels held by `settingsUi`. The first lists the tabs desktop's rail lists, in its order;
	// a row opens its tab in place, and Back returns to the list. A deep link (`settingsUi.show('gardener')`) opens
	// at the tab, and Back from it still leads to the list. The tab bodies are the shared ones desktop mounts
	// (`@eden/shared/shell/settings/tabs`); a tab that is not built says so with the same placeholder. What differs
	// here: Appearance has no density and no sidebar subtitles, About has no update check (the store updates the
	// app), Domains is the tab bar's picker, and archives travel through the phone's own file port. The panel is a
	// `page` container, so the tabs' narrow-page rules (D-112) apply inside the drawer.
	import { tick } from 'svelte'
	import { BackButton, List, Sheet, type ListRowData } from '@eden/ui-kit'
	import { t } from '@eden/shared/i18n'
	import { settingsTabIcons, settingsTabs, settingsUi, type SettingsTabId } from '@eden/shared/shell/settings'
	import AboutTab from '@eden/shared/shell/settings/tabs/AboutTab.svelte'
	import AppearanceTab from '@eden/shared/shell/settings/tabs/AppearanceTab.svelte'
	import GardenerTab from '@eden/shared/shell/settings/tabs/GardenerTab.svelte'
	import GeneralTab from '@eden/shared/shell/settings/tabs/GeneralTab.svelte'
	import IntegrationsTab from '@eden/shared/shell/settings/tabs/IntegrationsTab.svelte'
	import PlaceholderTab from '@eden/shared/shell/settings/tabs/PlaceholderTab.svelte'
	import PrivacyTab from '@eden/shared/shell/settings/tabs/PrivacyTab.svelte'
	import SyncTab from '@eden/shared/shell/settings/tabs/SyncTab.svelte'
	import { archiveFiles } from './archive-files'
	import PinnedTabs from './PinnedTabs.svelte'

	const uid = $props.id()
	const titleId = `${uid}-title`
	let title = $state<HTMLElement>()

	const rows = $derived<ListRowData[]>(
		settingsTabs.map((tab) => ({ id: tab, icon: settingsTabIcons[tab], primary: $t(`settings.tabs.${tab}`) }))
	)
	const onTab = $derived(settingsUi.level === 'tab')

	/** The level changed under the focus (the pressed row or the back arrow is gone): the new title takes it. */
	async function settle() {
		await tick()
		title?.focus()
	}
	function openTab(row: ListRowData) {
		settingsUi.tab = row.id as SettingsTabId
		settingsUi.level = 'tab'
		void settle()
	}
	function back() {
		settingsUi.back()
		void settle()
	}
</script>

<Sheet bind:open={settingsUi.open} placement="bottom" size="full" labelledby={titleId} initialFocus="container">
	{#snippet header()}
		<div class="head">
			{#if onTab}
				<BackButton onback={back} breadcrumb={$t('settings.title')} />
			{/if}
			<h2 id={titleId} class="title" tabindex="-1" bind:this={title}>
				{onTab ? $t(`settings.tabs.${settingsUi.tab}`) : $t('settings.title')}
			</h2>
		</div>
	{/snippet}
	{#if onTab}
		<div class="panel">
			{#if settingsUi.tab === 'general'}
				<GeneralTab />
			{:else if settingsUi.tab === 'appearance'}
				<AppearanceTab sidebar={false} />
			{:else if settingsUi.tab === 'domains'}
				<PinnedTabs />
			{:else if settingsUi.tab === 'gardener'}
				<GardenerTab />
			{:else if settingsUi.tab === 'privacy'}
				<PrivacyTab />
			{:else if settingsUi.tab === 'integrations'}
				<IntegrationsTab />
			{:else if settingsUi.tab === 'sync'}
				<SyncTab files={archiveFiles} />
			{:else if settingsUi.tab === 'about'}
				<AboutTab />
			{:else}
				<PlaceholderTab tab={settingsUi.tab} />
			{/if}
		</div>
	{:else}
		<List {rows} headless labelledby={titleId} onopen={openTab} />
	{/if}
</Sheet>

<style>
	.head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
	}
	.title {
		margin: 0;
		font: var(--ed-t-title-lg);
		color: var(--text-primary);
	}
	/* the title takes the focus when the level changes, and is not a control: it wears no ring */
	.title:focus {
		outline: none;
	}
	.panel {
		display: grid;
		align-content: start;
		gap: 20px;
		min-width: 0;
		/* the shared tabs ask `@container page` how much room they have (D-112); in the drawer this is the page */
		container: page / inline-size;
	}
</style>
