<script lang="ts">
	// The nearby-favorites tile: the favourite places nearest the search area, each with how far it is.
	import { WidgetRows } from '@eden/ui-kit'
	import { distanceLabel } from '../formats.js'
	import { meadow } from '../store.svelte.js'
	import { settings } from '../../../settings/index.js'

	const unit = $derived(settings.measurement === 'imperial' ? ('mi' as const) : ('km' as const))
	const rows = $derived(
		meadow.favourites
			.map((place) => ({ place, km: meadow.distanceTo(place) }))
			.sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity))
			.slice(0, 4)
			.map(({ place, km }) => ({
				id: place.id,
				text: place.name,
				note: place.locality,
				meta: distanceLabel(km, unit),
			}))
	)
</script>

<WidgetRows {rows} />
