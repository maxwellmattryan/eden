// Sky's surface on the phone (product/domains/weather.md, "Mobile"): the one view. What Sky declares is in
// `@eden/shared/domains/weather/manifest.json`; what it does (its store, the glyph that follows the conditions) is
// its `logic.ts` there, which `defineDomain` joins to this. The view and its two built Garden tiles are the ones the
// desktop mounts.
import { goto } from '$app/navigation'
import { resolve } from '$app/paths'
import { defineDomain } from '@eden/shared/domains'
import { weather } from '@eden/shared/weather'
import SunAndMoon from '@eden/shared/domains/weather/widgets/SunAndMoon.svelte'
import WeatherNow from '@eden/shared/domains/weather/widgets/WeatherNow.svelte'

export const weatherManifest = defineDomain('weather', {
	routes: { path: '/weather', href: resolve('/weather'), open: () => void goto(resolve('/weather')) },
	widgets: {
		'weather-now': { body: WeatherNow, hasData: () => weather.now !== undefined },
		'sun-and-moon': { body: SunAndMoon, hasData: () => weather.sun !== undefined },
	},
})
