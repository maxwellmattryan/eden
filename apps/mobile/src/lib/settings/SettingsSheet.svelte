<script lang="ts">
	// The mobile settings sheet: a bottom sheet (placement auto follows data-platform) with the Appearance tab only.
	// The other tabs arrive with their substrate; extracting the tabs into @eden/shared is a later issue.
	import { Sheet } from '@eden/ui-kit'
	import { t } from '@eden/shared/i18n'
	import { settingsUi } from '@eden/shared/shell/settings'
	import AppearanceTab from './tabs/AppearanceTab.svelte'

	const uid = $props.id()
	const titleId = `${uid}-title`
</script>

<Sheet bind:open={settingsUi.open} placement="auto" size="md" labelledby={titleId}>
	{#snippet header()}
		<h2 id={titleId} class="title">{$t('settings.tabs.appearance')}</h2>
	{/snippet}
	<div class="panel">
		<AppearanceTab />
	</div>
</Sheet>

<style>
	.title {
		margin: 0;
		font: var(--ed-t-title-lg);
		color: var(--text-primary);
	}
	.panel {
		display: grid;
		gap: 20px;
	}
</style>
