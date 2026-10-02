// Sky's surface on the phone (product/domains/weather.md, "Mobile"): the one view. What Sky declares is in
// `@eden/shared/domains/weather/manifest.json`; what it does (its store, the glyph that follows the conditions) is
// its `logic.ts` there, which `defineDomain` joins to this. The bodies of its Garden tiles are bound when the
// phone's Garden is built (#19).
import { goto } from '$app/navigation'
import { resolve } from '$app/paths'
import { defineDomain, widgetsPending } from '@eden/shared/domains'

export const weatherManifest = defineDomain('weather', {
	routes: { path: '/weather', href: resolve('/weather'), open: () => void goto(resolve('/weather')) },
	widgets: widgetsPending('weather'),
})
