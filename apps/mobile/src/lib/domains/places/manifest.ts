// Meadow's surface on the phone (product/domains/places.md, "Mobile"): the page and its tabs, with the map, what is
// nearby and the listings over the store it shares with the desktop. What Meadow declares is in
// `@eden/shared/domains/places/manifest.json`; what it does, and what its store is given of the shell (the feed, the
// sources that find new places), is its `logic.ts` there, which `defineDomain` joins to this. The bodies of its
// Garden tiles and its import sheet are bound when the phone's Garden and Meadow are built (#19).
import { goto } from '$app/navigation'
import { resolve } from '$app/paths'
import { defineDomain, widgetsPending } from '@eden/shared/domains'

export const placesManifest = defineDomain('places', {
	routes: {
		path: '/places/[[tab]]',
		href: resolve('/places/[[tab]]', {}),
		open: () => void goto(resolve('/places/[[tab]]', {})),
		openTab: (tab) => void goto(resolve('/places/[[tab]]', { tab })),
	},
	widgets: widgetsPending('places'),
})
