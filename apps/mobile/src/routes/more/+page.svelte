<script lang="ts">
	// More: what the tab bar has no room for (product/substrate/shell.md, Mobile). Toolbench has no mobile surface
	// yet, the Gardener arrives with its substrate; Settings opens the Appearance sheet.
	import { EmptyState, Icon, PageHeader, domainGlyph } from '@eden/ui-kit'
	import { t } from '@eden/shared/i18n'
	import { settingsUi } from '$lib/settings/settings-ui.svelte'

	const rows = $derived([
		{ id: 'toolbench' as const, name: $t('domains.toolbench.name'), subtitle: $t('domains.toolbench.subtitle') },
		{ id: 'gardener' as const, name: $t('shell.gardener'), subtitle: $t('shell.gardenerSubtitle') },
		{ id: 'settings' as const, name: $t('shell.settings'), subtitle: $t('shell.settingsSubtitle') },
	])

	function open(id: (typeof rows)[number]['id']) {
		if (id === 'settings') settingsUi.show()
	}
</script>

<PageHeader name={$t('shell.more')} icon="menu" />
<ul class="more">
	{#each rows as row (row.id)}
		<li>
			<button type="button" class="more-row" onclick={() => open(row.id)}>
				<Icon name={domainGlyph(row.id)} size="md" />
				<span class="more-text">
					<span class="more-name">{row.name}</span>
					<span class="more-subtitle">{row.subtitle}</span>
				</span>
				<Icon name="chevron-right" size="sm" />
			</button>
		</li>
	{/each}
</ul>
<EmptyState title={$t('empty.more.title')} text={$t('empty.more.text')} motif={false} />

<style>
	.more {
		display: grid;
		gap: 2px;
		margin: 0 0 var(--space-4);
		padding: 0;
		list-style: none;
	}
	.more-row {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		min-height: var(--ed-row);
		border: 0;
		border-radius: var(--ed-radius-control);
		background: transparent;
		padding: 8px 12px;
		text-align: left;
		color: var(--text-primary);
		cursor: pointer;
	}
	.more-row:active {
		background: color-mix(in srgb, var(--text-primary) 8%, transparent);
	}
	.more-row:focus-visible {
		outline: 2px solid transparent;
		box-shadow: var(--focus-ring);
	}
	.more-text {
		display: grid;
		flex: 1;
		min-width: 0;
	}
	.more-name {
		font: var(--ed-t-body-lg);
	}
	.more-subtitle {
		font: var(--ed-t-caption);
		color: var(--text-secondary);
	}
</style>
