// Every source Sky can draw on (D-56, D-59). A new provider or a keyed source (AccuWeather, for pollen and mold) is
// one more entry here, behind the same interfaces; nothing else changes.
import type { ProviderId } from './model.js'
import type { AirQualitySource, AllergenSource, ForecastProvider } from './provider.js'
import { openMeteo } from './providers/open-meteo.js'
import { openMeteoAirQuality, openMeteoPollen } from './sources/open-meteo-air-quality.js'

/** The default on every platform, and the one that stands in when the chosen provider cannot answer (D-57). */
export const DEFAULT_PROVIDER: ProviderId = 'open-meteo'

export const forecastProviders: Partial<Record<ProviderId, ForecastProvider>> = {
	'open-meteo': openMeteo,
}

/** The provider for a choice; the default when the choice is not one this build carries. */
export function providerFor(id: ProviderId): ForecastProvider {
	return forecastProviders[id] ?? openMeteo
}

/** The providers that can run here, the default first: what the settings offer. */
export async function availableProviders(): Promise<ForecastProvider[]> {
	const all = Object.values(forecastProviders)
	const able = await Promise.all(all.map((provider) => provider.available().catch(() => false)))
	return all.filter((_, i) => able[i])
}

/** Tried in order; the first that covers the place fills the slot. */
export const airQualitySources: readonly AirQualitySource[] = [openMeteoAirQuality]
export const allergenSources: readonly AllergenSource[] = [openMeteoPollen]
