// Meadow's surface on the desktop (product/domains/places.md): the page and its four tabs, its two Garden tiles and
// the import sheet. What Meadow declares is in `@eden/shared/domains/places/manifest.json`; what it does, and what
// its store is given of the shell, is its `logic.ts` there, which `defineDomain` joins to this.
import { goto } from '$app/navigation'
import { resolve } from '$app/paths'
import { defineDomain } from '@eden/shared/domains'
import { meadow } from '@eden/shared/domains/places'
import { declarationOf, type TabId } from '@eden/shared/manifest'
import ImportSheet from './views/ImportSheet.svelte'
import NearbyFavorites from '@eden/shared/domains/places/widgets/NearbyFavorites.svelte'
import UpcomingListings from '@eden/shared/domains/places/widgets/UpcomingListings.svelte'

export type PlacesTab = TabId<'places'>
export const PLACES_TABS: readonly PlacesTab[] = declarationOf('places').tabs.map((tab) => tab.id)

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
	// the import sheet stands over whatever page is open: a list may be handed over in a conversation
	overlay: ImportSheet,
})
