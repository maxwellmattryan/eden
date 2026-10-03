<script lang="ts">
	// The neutral daily line the Garden shows until Sanctuary provides one (product/substrate/shell.md, "The Garden").
	import { DailyLine } from '@eden/ui-kit'
	import { t } from '../../../i18n/index.js'
</script>

<DailyLine line={$t('garden.dailyLine.line')} source={$t('garden.dailyLine.source')} />
