// Meadow's surface on the phone (product/domains/places.md, "Mobile"): the page and its tabs, with the map, what is
// nearby and the listings over the store it shares with the desktop. What Meadow declares is in
// `@eden/shared/domains/places/manifest.json`; what it does, and what its store is given of the shell (the feed, the
// sources that find new places), is its `logic.ts` there, which `defineDomain` joins to this. Its two Garden tiles
// are the bodies the desktop mounts; its import sheet is bound when the phone's Meadow is built (#19).
import { goto } from '$app/navigation'
import { resolve } from '$app/paths'
import { defineDomain } from '@eden/shared/domains'
import { meadow } from '@eden/shared/domains/places'
import NearbyFavorites from '@eden/shared/domains/places/widgets/NearbyFavorites.svelte'
import UpcomingListings from '@eden/shared/domains/places/widgets/UpcomingListings.svelte'

export const placesManifest = defineDomain('places', {
	routes: {
		path: '/places/[[tab]]',
		href: resolve('/places/[[tab]]', {}),
		open: () => void goto(resolve('/places/[[tab]]', {})),
		openTab: (tab) => void goto(resolve('/places/[[tab]]', { tab })),
	},
	widgets: {
		'nearby-favorites': {
			body: NearbyFavorites,
			hasData: () => meadow.favourites.length > 0,
			action: { label: 'garden.actions.nearbyFavorites', open: () => void goto(resolve('/places/[[tab]]', {})) },
		},
		'upcoming-listings': {
			body: UpcomingListings,
			hasData: () => meadow.upcoming.length > 0,
			action: {
				label: 'garden.actions.upcomingListings',
				open: () => void goto(resolve('/places/[[tab]]', { tab: 'listings' })),
			},
		},
	},
})
