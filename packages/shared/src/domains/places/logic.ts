// Meadow's logic (product/domains/places.md): its store, its tool handlers and its weekly search. What Meadow
// declares is in `./manifest.json`; its page, its Garden tiles and its import sheet are bound by each app
// (`src/lib/domains/places/manifest.ts`). The store knows nothing of the shell: what it needs of one is given to it
// here, once, for both apps.
import { get } from 'svelte/store'
import { photon } from '../../geo/index.js'
import { t } from '../../i18n/index.js'
import { settings } from '../../settings/index.js'
import { feed } from '../../shell/index.js'
import type { DomainLogic } from '../define.js'
import { meadowExtras } from './formats.js'
import { seedData } from './seed.js'
import { bindPlacesSignals } from './signals.js'
import { meadow } from './store.svelte.js'
import { gardenerDiscovery, gardenerListings, placesTools, weeklyListings } from './tools.js'
import { vibeNamer } from './words.js'

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

export const placesLogic: DomainLogic<'places'> = {
	id: 'places',
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
}
