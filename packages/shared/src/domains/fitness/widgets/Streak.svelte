<script lang="ts">
	// The streak tile (Domains/Vigor/Widgets): the workout logs in the unbroken run of weeks ending this one (D-177).
	import { Stat } from '@eden/ui-kit'
	import { t } from '../../../i18n/index.js'
	import { fitness } from '../store.svelte.js'
</script>

<Stat
	value={String(fitness.streak)}
	unit={$t('domains.fitness.widgets.sessions', { values: { count: fitness.streak } })}
/>
