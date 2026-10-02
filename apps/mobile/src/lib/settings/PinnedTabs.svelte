<script lang="ts">
	// Settings → Domains on the phone: the two domains in the tab bar beside Garden and Today
	// (product/substrate/shell.md, "Mobile"; D-TBD(pinned-tabs)). Two selects, the third tab and the fourth; choosing
	// what the other holds swaps them, so the pair is always two different domains. The choice is this device's:
	// `settings.pinnedTabs`, which no bundle carries. Enabling, disabling and reordering domains arrive with the
	// rest of this tab.
	import { Select } from '@eden/ui-kit'
	import { t } from '@eden/shared/i18n'
	import { pinnedPair, shell, withPinned } from '@eden/shared/manifest'
	import { settings } from '@eden/shared/settings'
	import SettingsRow from '@eden/shared/shell/settings/SettingsRow.svelte'
	import { declarations, manifestFor } from '$lib/domains'

	/** A domain can hold a tab when the phone has a page for it. */
	const routable = (id: string) => !!manifestFor(id)?.routes.open
	const options = $derived(
		declarations
			.filter((declaration) => routable(declaration.id))
			.map((declaration) => ({ value: declaration.id as string, label: $t(declaration.name) }))
	)
	const pair = $derived(pinnedPair(settings.pinnedTabs, declarations, shell, routable))
	const slots = ['first', 'second'] as const

	function choose(slot: number, id: string) {
		if (id) settings.setPinnedTabs(withPinned(pair, slot, id))
	}
</script>

<SettingsRow label={$t('settings.domains.pinned.label')} help={$t('settings.domains.pinned.help')}>
	{#each slots as slot, index (slot)}
		<Select
			label={$t(`settings.domains.pinned.${slot}`)}
			{options}
			value={pair[index]}
			onchange={(id) => choose(index, id)}
		/>
	{/each}
</SettingsRow>
