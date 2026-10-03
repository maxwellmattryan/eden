// Sky's logic (product/domains/weather.md): the glyph that follows the conditions, its store (shared, in
// `../../weather`), its tool handlers and what the Gardener's pack carries of a forecast. What Sky declares is in
// `./manifest.json`; its page and its Garden tiles are bound by each app (`src/lib/domains/weather/manifest.ts`).
import { iconFor } from '@eden/ui-kit'
import type { Entity } from '../../data/index.js'
import { forecastForPack, SKY, weather, type ForecastPayload } from '../../weather/index.js'
import type { DomainLogic } from '../define.js'
import { weatherTools } from './tools.js'

export const weatherLogic: DomainLogic<'weather'> = {
	id: 'weather',
	liveGlyph: () => (weather.now ? iconFor(weather.now.condition, weather.now.night) : undefined),
	load: () => weather.load(),
	reload: () => weather.reload(),
	subscribe: () => weather.bind(),
	tools: weatherTools,
	// the tools answer the hours and the details; the pack carries the week at a glance
	pack: { [SKY.forecast]: (row) => forecastForPack(row as Entity<ForecastPayload>) },
}
