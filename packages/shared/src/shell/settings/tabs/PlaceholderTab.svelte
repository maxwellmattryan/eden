<script lang="ts">
	// The tabs that arrive with their substrate: the tab's name and one sentence, no motif.
	import { EmptyState } from '@eden/ui-kit'
	import { t } from '../../../i18n/index.js'
	import type { SettingsTabId } from '../settings-ui.svelte.js'

	type Props = { tab: SettingsTabId }
	let { tab }: Props = $props()
</script>

<EmptyState title={$t(`settings.tabs.${tab}`)} text={$t('settings.placeholder.text')} motif={false} />
