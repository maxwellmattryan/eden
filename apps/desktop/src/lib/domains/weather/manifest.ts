// Sky's bindings (product/domains/weather.md): the one view, the bodies of its two built Garden tiles, the glyph that
// follows the conditions. What Sky declares is in `@eden/shared/domains/weather/manifest.json`; its store is shared.
import { goto } from '$app/navigation'
import { resolve } from '$app/paths'
import { iconFor } from '@eden/ui-kit'
import type { Entity } from '@eden/shared/data'
import { defineDomain } from '../manifest.js'
import { forecastForPack, SKY, weather, type ForecastPayload } from '@eden/shared/weather'
import SunAndMoon from './widgets/SunAndMoon.svelte'
import WeatherNow from './widgets/WeatherNow.svelte'
import { weatherTools } from './tools.js'

export const weatherManifest = defineDomain('weather', {
	routes: { path: '/weather', href: resolve('/weather'), open: () => void goto(resolve('/weather')) },
	widgets: {
		'weather-now': { body: WeatherNow, hasData: () => weather.now !== undefined },
		'sun-and-moon': { body: SunAndMoon, hasData: () => weather.sun !== undefined },
	},
	liveGlyph: () => (weather.now ? iconFor(weather.now.condition, weather.now.night) : undefined),
	load: () => weather.load(),
	reload: () => weather.reload(),
	subscribe: () => weather.bind(),
	tools: weatherTools,
	// the tools answer the hours and the details; the pack carries the week at a glance
	pack: { [SKY.forecast]: (row) => forecastForPack(row as Entity<ForecastPayload>) },
})
