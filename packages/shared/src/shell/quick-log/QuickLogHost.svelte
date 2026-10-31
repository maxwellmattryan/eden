<script lang="ts">
	// The Quick Log sheet (D-12), mounted once by the shell: the enabled domains' quick actions as tabs, a save
	// written through `saveQuickLog` with its undo toast.
	import { QuickLogSheet } from '@eden/ui-kit'
	import { t } from '../../i18n/index.js'
	import { quickLogEntries, saveQuickLog } from './quick-log.js'
	import { quickLogUi } from './ui.svelte.js'

	const logs = $derived(quickLogEntries($t))
</script>

<QuickLogSheet
	bind:open={quickLogUi.opened}
	bind:selected={quickLogUi.selected}
	{logs}
	onsave={(log, value) => void saveQuickLog(log.id, value)}
/>
