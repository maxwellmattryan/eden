// Meadow's bindings (product/domains/places.md): the page and its four tabs, its two Garden tiles, its store. What
// Meadow declares is in `@eden/shared/domains/places/manifest.json`. The store is shared with the phone, so it
// cannot import this app's shell: what it needs of one is given to it here, once.
import { get } from 'svelte/store'
import { goto } from '$app/navigation'
import { resolve } from '$app/paths'
import { bindPlacesSignals, meadow, meadowExtras } from '@eden/shared/domains/places'
import { photon } from '@eden/shared/geo'
import { t } from '@eden/shared/i18n'
import { declarationOf, type TabId } from '@eden/shared/manifest'
import { feed } from '../../shell/feed.svelte.js'
import { defineDomain } from '../manifest.js'
import ImportSheet from './views/ImportSheet.svelte'
import NearbyFavorites from './widgets/NearbyFavorites.svelte'
import UpcomingListings from './widgets/UpcomingListings.svelte'
import { seedData } from './seed.js'
import { settings } from '@eden/shared/settings'
import { gardenerDiscovery, gardenerListings, placesTools, weeklyListings } from './tools.js'
import { vibeNamer } from './words.js'

export type PlacesTab = TabId<'places'>
export const PLACES_TABS: readonly PlacesTab[] = declarationOf('places').tabs.map((tab) => tab.id)

meadow.bind({
	record: (key, values) => {
		const entry = feed.record('places', key, values)
		return () => feed.forget(entry.id)
	},
	// the sources that reach outside (D-128): the Gardener with a web search, and Photon for a name
	discovery: gardenerDiscovery,
	listings: gardenerListings,
	geocoder: photon,
})

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
	load: () => meadow.load(),
	reload: () => meadow.reload(),
	extras: async () => {
		await meadow.load()
		return meadowExtras(meadow.data(), vibeNamer(get(t), meadow.vibes))
	},
	seed: () => meadow.seed(seedData(), get(t)('domains.places.name')),
	tools: placesTools,
	// the weekly listings search, on by default and the owner's to turn off (D-134)
	subscribe: () => bindPlacesSignals(weeklyListings, () => settings.placesWeekly),
	// the import sheet stands over whatever page is open: a list may be handed over in a conversation
	overlay: ImportSheet,
})
