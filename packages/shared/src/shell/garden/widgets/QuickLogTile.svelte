<script lang="ts">
	// The Garden's quick-log tile (D-12): the latest value of the first numeric log with its recent line; a press on
	// the tile's action opens the sheet on it. No domain logs a number until Vigor does, and the tile keeps its prompt.
	import { Sparkline, Stat } from '@eden/ui-kit'
	import { t } from '../../../i18n/index.js'
	import { numericLog } from './quick-log-tile.js'

	const log = $derived(numericLog($t))
</script>

{#if log?.series?.length}
	<Stat value={String(log.series.at(-1))} unit={log.unit} />
	<Sparkline values={log.series} reference={log.reference} width={220} height={40} />
{/if}
