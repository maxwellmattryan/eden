<script lang="ts">
	// The eight tabs that arrive with their substrate: the tab's name and one sentence, no motif.
	import { EmptyState } from '@eden/ui-kit'
	import { t } from '@eden/shared/i18n'
	import type { SettingsTabId } from '../settings-ui.svelte'

	type Props = { tab: SettingsTabId }
	let { tab }: Props = $props()
</script>

<EmptyState title={$t(`settings.tabs.${tab}`)} text={$t('settings.placeholder.text')} motif={false} />
