// Sky's bindings (product/domains/weather.md): the one view, the bodies of its two built Garden tiles, the glyph that
// follows the conditions. What Sky declares is in `@eden/shared/domains/weather/manifest.json`; its store is shared.
import { goto } from '$app/navigation'
import { resolve } from '$app/paths'
import { iconFor } from '@eden/ui-kit'
import { defineDomain } from '../manifest.js'
import { weather } from '@eden/shared/weather'
import SunAndMoon from './widgets/SunAndMoon.svelte'
import WeatherNow from './widgets/WeatherNow.svelte'

export const weatherManifest = defineDomain('weather', {
	routes: { path: '/weather', href: resolve('/weather'), open: () => void goto(resolve('/weather')) },
	widgets: {
		'weather-now': { body: WeatherNow, hasData: () => weather.now !== undefined },
		'sun-and-moon': { body: SunAndMoon, hasData: () => weather.sun !== undefined },
	},
	liveGlyph: () => (weather.now ? iconFor(weather.now.condition, weather.now.night) : undefined),
	load: () => weather.load(),
	subscribe: () => weather.bind(),
})
