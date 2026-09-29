// Sky's manifest (product/domains/weather.md): the one view, the two default Garden tiles, no quick actions.
import { goto } from '$app/navigation'
import { resolve } from '$app/paths'
import { domainGlyph } from '@eden/ui-kit'
import type { DomainManifest } from '../manifest.js'
import { weather } from './store.svelte.js'
import SunAndMoon from './widgets/SunAndMoon.svelte'
import WeatherNow from './widgets/WeatherNow.svelte'

export const weatherManifest: DomainManifest = {
	id: 'weather',
	name: 'domains.weather.name',
	subtitle: 'domains.weather.subtitle',
	glyph: domainGlyph('weather'),
	routes: { path: '/weather', href: resolve('/weather'), open: () => void goto(resolve('/weather')) },
	widgets: [
		{
			id: 'weather-now',
			size: 's',
			title: 'garden.widgets.weatherNow',
			empty: 'garden.empty.weatherNow',
			body: WeatherNow,
			hasData: () => weather.now !== undefined,
		},
		{
			id: 'sun-and-moon',
			size: 's',
			title: 'garden.widgets.sunAndMoon',
			empty: 'garden.empty.sunAndMoon',
			body: SunAndMoon,
			hasData: () => weather.sun !== undefined,
		},
	],
	quickActions: [],
	load: () => weather.load(),
}
