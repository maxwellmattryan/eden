<script lang="ts">
	// The expiring-soon tile: what is dated within the next two days, soonest first.
	import WidgetRows from '$lib/shell/WidgetRows.svelte'
	import { formatDay } from '@eden/shared/dates'
	import { kitchen } from '../store.svelte'

	const rows = $derived(
		kitchen.expiring.map((item) => ({ id: item.id, text: item.name, meta: item.expiry ? formatDay(item.expiry) : '' }))
	)
</script>

<WidgetRows {rows} />
