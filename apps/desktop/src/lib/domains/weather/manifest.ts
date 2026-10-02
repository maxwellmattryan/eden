// Sky's surface on the desktop (product/domains/weather.md): the one view and the bodies of its two built Garden
// tiles. What Sky declares is in `@eden/shared/domains/weather/manifest.json`; what it does is its `logic.ts` there,
// which `defineDomain` joins to this. Its store is shared.
import { goto } from '$app/navigation'
import { resolve } from '$app/paths'
import { defineDomain } from '@eden/shared/domains'
import { weather } from '@eden/shared/weather'
import SunAndMoon from './widgets/SunAndMoon.svelte'
import WeatherNow from './widgets/WeatherNow.svelte'

export const weatherManifest = defineDomain('weather', {
	routes: { path: '/weather', href: resolve('/weather'), open: () => void goto(resolve('/weather')) },
	widgets: {
		'weather-now': { body: WeatherNow, hasData: () => weather.now !== undefined },
		'sun-and-moon': { body: SunAndMoon, hasData: () => weather.sun !== undefined },
	},
})
