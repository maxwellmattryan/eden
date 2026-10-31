<script lang="ts">
	// The upcoming-listings tile: what is on in the days ahead, the soonest first; one the owner is going to or
	// interested in stands out.
	import { WidgetRows } from '@eden/ui-kit'
	import { formatDateOf, formatEventTime } from '../../../dates/index.js'
	import { markOf } from '../outings.js'
	import { meadow } from '../store.svelte.js'
	import { locale } from '../../../i18n/index.js'
	import { settings } from '../../../settings/index.js'

	const format = $derived({ lang: $locale ?? 'en', clock: settings.clock })
	const rows = $derived(
		meadow.upcoming.slice(0, 4).map((listing) => ({
			id: listing.id,
			text: listing.title,
			note: listing.venueName,
			meta: listing.allDay
				? formatDateOf(listing.startAt.slice(0, 10), format.lang)
				: formatEventTime(listing.startAt, format),
			warn: markOf(listing, meadow.outings) !== undefined,
		}))
	)
</script>

<WidgetRows {rows} />
