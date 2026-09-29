// The Open-Meteo forecast client (product/domains/weather.md, "Integrations"; OQ-15): keyless, one GET for the
// current conditions, the hourly strip and the week. Coordinates are rounded to three decimals before they leave the
// device (weather.md never-do list). Every failure surfaces as `OfflineError` so the page can show the last good
// forecast with the time it was fetched.
import type { SkyCondition } from '@eden/ui-kit'

export type TemperatureUnit = 'celsius' | 'fahrenheit'

export interface OpenMeteoForecast {
	timezone: string
	current: {
		time: string
		temperature_2m: number
		weather_code: number
		is_day: number
		wind_speed_10m: number
	}
	hourly: {
		time: string[]
		temperature_2m: number[]
		weather_code: number[]
		precipitation_probability: (number | null)[]
		is_day: number[]
	}
	daily: {
		time: string[]
		weather_code: number[]
		temperature_2m_max: number[]
		temperature_2m_min: number[]
		sunrise: string[]
		sunset: string[]
		precipitation_probability_max: (number | null)[]
	}
}

export class OfflineError extends Error {
	constructor(message = 'Open-Meteo could not be reached') {
		super(message)
		this.name = 'OfflineError'
	}
}

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast'
const TIMEOUT_MS = 10_000

function rounded(value: number): string {
	return (Math.round(value * 1000) / 1000).toFixed(3)
}

export function forecastUrl(latitude: number, longitude: number, unit: TemperatureUnit): string {
	const query = new URLSearchParams({
		latitude: rounded(latitude),
		longitude: rounded(longitude),
		current: 'temperature_2m,weather_code,is_day,wind_speed_10m',
		hourly: 'temperature_2m,weather_code,precipitation_probability,is_day',
		daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max',
		timezone: 'auto',
		forecast_days: '7',
		temperature_unit: unit,
	})
	return `${ENDPOINT}?${query}`
}

export async function fetchForecast(
	latitude: number,
	longitude: number,
	unit: TemperatureUnit
): Promise<OpenMeteoForecast> {
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
	try {
		const response = await fetch(forecastUrl(latitude, longitude, unit), { signal: controller.signal })
		if (!response.ok) throw new OfflineError(`Open-Meteo answered ${response.status}`)
		return (await response.json()) as OpenMeteoForecast
	} catch (error) {
		throw error instanceof OfflineError ? error : new OfflineError(String(error))
	} finally {
		clearTimeout(timer)
	}
}

/** Windy is not a WMO code: a clear-to-cloudy sky counts as windy from this speed, in km/h. */
const WINDY_KMH = 40

/**
 * The kit's condition for a WMO weather code (Open-Meteo's `weather_code` table). Unknown codes read as cloudy;
 * a tornado has no code and is never produced.
 */
export function conditionFor(code: number, windKmh = 0): SkyCondition {
	if (code <= 3 && windKmh >= WINDY_KMH) return 'wind'
	if (code === 0 || code === 1) return 'sunny'
	if (code === 2) return 'partly-cloudy'
	if (code === 3) return 'cloudy'
	if (code === 45 || code === 48) return 'fog'
	if (code >= 51 && code <= 57) return 'drizzle'
	if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain'
	if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
	if (code === 95) return 'thunderstorm'
	if (code === 96 || code === 99) return 'hail'
	return 'cloudy'
}
