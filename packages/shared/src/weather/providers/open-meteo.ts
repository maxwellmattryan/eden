// The Open-Meteo forecast provider (product/domains/weather.md, "Integrations"; D-56): keyless, one GET for the
// current conditions, the hours, and the days on both sides of today, so the calendar week is whole. Times are asked
// for as instants (`timeformat=unixtime`) and the place's timezone comes back with them. Open-Meteo is the default on
// every platform, and what it supplies is what the model holds.
import type { SkyCondition } from '@eden/ui-kit'
import { rounded } from '../coordinates.js'
import type { DayReading, Forecast, HourReading } from '../model.js'
import { getJson, type ForecastProvider, type ForecastRequest } from '../provider.js'
import { dateIn } from '../week.js'

export const OPEN_METEO = 'Open-Meteo'

export interface OpenMeteoResponse {
	timezone: string
	current: {
		time: number
		temperature_2m: number
		apparent_temperature: number | null
		relative_humidity_2m: number | null
		dew_point_2m: number | null
		weather_code: number
		is_day: number
		wind_speed_10m: number | null
		wind_gusts_10m: number | null
		wind_direction_10m: number | null
		pressure_msl: number | null
		visibility: number | null
		cloud_cover: number | null
		precipitation: number | null
		uv_index: number | null
	}
	hourly: {
		time: number[]
		temperature_2m: (number | null)[]
		weather_code: (number | null)[]
		precipitation_probability: (number | null)[]
		is_day: (number | null)[]
	}
	daily: {
		time: number[]
		weather_code: (number | null)[]
		temperature_2m_max: (number | null)[]
		temperature_2m_min: (number | null)[]
		sunrise: (number | null)[]
		sunset: (number | null)[]
		precipitation_probability_max: (number | null)[]
		precipitation_sum: (number | null)[]
		uv_index_max: (number | null)[]
		wind_speed_10m_max?: (number | null)[]
	}
}

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast'
const LEGAL = 'https://open-meteo.com/'
/** The hours kept: the mirror holds what the strip can show, not the thirteen days the request spans. */
const HOURS_KEPT = 36

export function forecastUrl({ place, pastDays, forecastDays }: ForecastRequest): string {
	const query = new URLSearchParams({
		latitude: rounded(place.latitude),
		longitude: rounded(place.longitude),
		current: [
			'temperature_2m',
			'apparent_temperature',
			'relative_humidity_2m',
			'dew_point_2m',
			'weather_code',
			'is_day',
			'wind_speed_10m',
			'wind_gusts_10m',
			'wind_direction_10m',
			'pressure_msl',
			'visibility',
			'cloud_cover',
			'precipitation',
			'uv_index',
		].join(','),
		hourly: 'temperature_2m,weather_code,precipitation_probability,is_day',
		daily: [
			'weather_code',
			'temperature_2m_max',
			'temperature_2m_min',
			'sunrise',
			'sunset',
			'precipitation_probability_max',
			'precipitation_sum',
			'uv_index_max',
			'wind_speed_10m_max',
		].join(','),
		timezone: 'auto',
		timeformat: 'unixtime',
		past_days: String(pastDays),
		forecast_days: String(forecastDays),
	})
	return `${ENDPOINT}?${query}`
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

const ms = (seconds: number | null | undefined) => (seconds == null ? null : seconds * 1000)

/** Open-Meteo's response as the model. */
export function normalizeOpenMeteo(raw: OpenMeteoResponse): Forecast {
	const timeZone = raw.timezone
	const now = raw.current.time * 1000
	const today = dateIn(timeZone, now)
	const temp = raw.current.temperature_2m
	const windSpeed = raw.current.wind_speed_10m ?? 0

	const from = now - 60 * 60 * 1000
	const hours: HourReading[] = raw.hourly.time
		.map((time, i) => ({
			time: time * 1000,
			temp: raw.hourly.temperature_2m[i] ?? temp,
			condition: conditionFor(raw.hourly.weather_code[i] ?? 3),
			night: raw.hourly.is_day[i] === 0,
			precipChance: raw.hourly.precipitation_probability[i] ?? 0,
		}))
		.filter((hour) => hour.time > from)
		.slice(0, HOURS_KEPT)

	const days: DayReading[] = raw.daily.time.map((time, i) => {
		const date = dateIn(timeZone, time * 1000)
		const observed = date < today
		return {
			date,
			condition: conditionFor(raw.daily.weather_code[i] ?? 3),
			hi: raw.daily.temperature_2m_max[i] ?? temp,
			lo: raw.daily.temperature_2m_min[i] ?? temp,
			precipChance: observed ? null : (raw.daily.precipitation_probability_max[i] ?? null),
			precipAmount: raw.daily.precipitation_sum[i] ?? 0,
			uvMax: raw.daily.uv_index_max[i] ?? null,
			windMax: raw.daily.wind_speed_10m_max?.[i] ?? null,
			sunrise: ms(raw.daily.sunrise[i]),
			sunset: ms(raw.daily.sunset[i]),
			observed,
		}
	})

	return {
		provider: 'open-meteo',
		timeZone,
		current: {
			time: now,
			temp,
			feelsLike: raw.current.apparent_temperature ?? temp,
			condition: conditionFor(raw.current.weather_code, windSpeed),
			night: raw.current.is_day === 0,
			humidity: raw.current.relative_humidity_2m ?? 0,
			dewPoint: raw.current.dew_point_2m ?? temp,
			windSpeed,
			windGust: raw.current.wind_gusts_10m ?? windSpeed,
			windDirection: raw.current.wind_direction_10m ?? 0,
			pressure: raw.current.pressure_msl ?? 0,
			visibility: (raw.current.visibility ?? 0) / 1000,
			cloudCover: raw.current.cloud_cover ?? 0,
			precipitation: raw.current.precipitation ?? 0,
			uv: raw.current.uv_index ?? 0,
		},
		hours,
		days,
		attribution: { provider: 'open-meteo', name: OPEN_METEO, legalUrl: LEGAL },
	}
}

export const openMeteo: ForecastProvider = {
	id: 'open-meteo',
	name: OPEN_METEO,
	available: () => Promise.resolve(true),
	fetch: async (request) =>
		normalizeOpenMeteo(await getJson<OpenMeteoResponse>(OPEN_METEO, 'open-meteo', forecastUrl(request))),
}
