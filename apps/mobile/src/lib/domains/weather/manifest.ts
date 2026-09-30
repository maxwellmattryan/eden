// Sky on the phone (product/domains/weather.md, "Mobile"): its page, and the glyph that follows the conditions. Its
// store is shared with the desktop.
import { goto } from '$app/navigation'
import { resolve } from '$app/paths'
import { weather } from '@eden/shared/weather'
import { iconFor } from '@eden/ui-kit'
import { defineDomain } from '../manifest.js'

export const weatherManifest = defineDomain('weather', {
	routes: { href: resolve('/weather'), open: () => void goto(resolve('/weather')) },
	liveGlyph: () => (weather.now ? iconFor(weather.now.condition, weather.now.night) : undefined),
	load: () => weather.load(),
	subscribe: () => weather.bind(),
})
