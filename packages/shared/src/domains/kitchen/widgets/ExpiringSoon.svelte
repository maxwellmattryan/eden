<script lang="ts">
	// The expiring-soon tile: what is dated within the next two days, soonest first.
	import { WidgetRows } from '@eden/ui-kit'
	import { formatDay } from '../../../dates/index.js'
	import { kitchen } from '../store.svelte.js'

	const rows = $derived(
		kitchen.expiring.map((item) => ({ id: item.id, text: item.name, meta: item.expiry ? formatDay(item.expiry) : '' }))
	)
</script>

<WidgetRows {rows} />
