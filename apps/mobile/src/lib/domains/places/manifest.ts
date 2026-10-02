// Meadow on the phone (product/domains/places.md, "Mobile"): its page, with the map, what is nearby and the
// listings as read surfaces over the store it shares with the desktop, plus favourite and log a visit. The phone has
// no Gardener runtime yet (#19), so the store is given no source that finds new places, and the pages say nothing of
// one. There is no Garden feed on the phone either, so a write records no line.
import { goto } from '$app/navigation'
import { resolve } from '$app/paths'
import { meadow } from '@eden/shared/domains/places'
import { defineDomain } from '../manifest.js'

export const placesManifest = defineDomain('places', {
	routes: { href: resolve('/places'), open: () => void goto(resolve('/places')) },
	load: () => meadow.load(),
})
