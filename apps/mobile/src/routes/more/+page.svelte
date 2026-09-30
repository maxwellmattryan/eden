<script lang="ts">
	// More: what the tab bar has no room for (product/substrate/shell.md, Mobile), composed from the manifests: the
	// domains that are not pinned, then the Gardener and Settings. Toolbench has no mobile surface yet, the Gardener
	// arrives with its substrate; Settings opens the Appearance sheet.
	import { EmptyState, Icon, PageHeader, domainGlyph, type GlyphId } from '@eden/ui-kit'
	import { t } from '@eden/shared/i18n'
	import { shell, tabBar } from '@eden/shared/manifest'
	import { declarations, manifestFor } from '$lib/domains'
	import { settingsUi } from '$lib/settings/settings-ui.svelte'

	const rows = $derived(
		tabBar(declarations, shell).more.map((item) => ({
			id: item.id,
			name: $t(item.name),
			subtitle: $t(item.subtitle),
			// the registry builder checked each id against the kit's glyphs
			icon: domainGlyph(item.id as GlyphId),
		}))
	)

	function open(id: string) {
		if (id === 'settings') return settingsUi.show()
		manifestFor(id)?.routes?.open()
	}
</script>

<PageHeader name={$t('shell.more')} icon="menu" />
<ul class="more">
	{#each rows as row (row.id)}
		<li>
			<button type="button" class="more-row" onclick={() => open(row.id)}>
				<Icon name={row.icon} size="md" />
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
