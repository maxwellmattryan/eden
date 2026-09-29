// Apple's WeatherKit as a forecast provider (D-57): the native framework on macOS and iOS, reached through the crate's
// Swift bridge (`weatherkit_forecast`), under the app's own entitlement, with nothing for the owner to enter. Where the
// bridge is not in the build the provider is unavailable and the settings never offer it (D-56). It fills the same
// model Open-Meteo fills; only the attribution differs, and Apple's terms ask for its mark and its legal link.
import { invoke } from '@tauri-apps/api/core'
import type { SkyCondition } from '@eden/ui-kit'
import { isTauri } from '../../api/tauri.js'
import type { DayReading, Forecast } from '../model.js'
import { OfflineError, type ForecastProvider } from '../provider.js'
import { dateIn } from '../week.js'

export const APPLE_WEATHER = 'Apple Weather'

/** What the bridge returns (`src-tauri/src/domains/weather/mod.rs`): metric, times in milliseconds. */
export interface WeatherKitResponse {
	timeZone: string
	current: {
		time: number
		temp: number
		feelsLike: number
		condition: string
		daylight: boolean
		humidity: number
		dewPoint: number
		windSpeed: number
		windGust: number | null
		windDirection: number
		pressure: number
		visibility: number
		cloudCover: number
		precipitation: number
		uv: number
	}
	hours: { time: number; temp: number; condition: string; daylight: boolean; precipChance: number }[]
	days: {
		time: number
		condition: string
		hi: number
		lo: number
		precipChance: number
		precipAmount: number
		uvMax: number
		sunrise: number | null
		sunset: number | null
	}[]
	attribution: { name: string; markLight: string | null; markDark: string | null; legalUrl: string }
}

export interface WeatherKitStatus {
	/** The bridge is in this build: macOS and iOS only. */
	compiled: boolean
	/** Whether WeatherKit has answered in this run; only a real request can tell. */
	verified: 'unknown' | 'ok' | 'failed'
}

const HOUR_MS = 60 * 60 * 1000
const HOURS_KEPT = 36

/** WeatherKit's `WeatherCondition` names as the kit's conditions; a name it adds later reads as cloudy. */
const CONDITIONS: Record<string, SkyCondition> = {
	clear: 'sunny',
	mostlyClear: 'sunny',
	hot: 'sunny',
	frigid: 'sunny',
	partlyCloudy: 'partly-cloudy',
	mostlyCloudy: 'cloudy',
	cloudy: 'cloudy',
	foggy: 'fog',
	haze: 'fog',
	smoky: 'fog',
	blowingDust: 'wind',
	breezy: 'wind',
	windy: 'wind',
	drizzle: 'drizzle',
	freezingDrizzle: 'drizzle',
	sunShowers: 'drizzle',
	rain: 'rain',
	heavyRain: 'rain',
	freezingRain: 'rain',
	tropicalStorm: 'rain',
	hurricane: 'rain',
	snow: 'snow',
	heavySnow: 'snow',
	flurries: 'snow',
	sunFlurries: 'snow',
	sleet: 'snow',
	wintryMix: 'snow',
	blizzard: 'snow',
	blowingSnow: 'snow',
	hail: 'hail',
	thunderstorms: 'thunderstorm',
	isolatedThunderstorms: 'thunderstorm',
	scatteredThunderstorms: 'thunderstorm',
	strongStorms: 'thunderstorm',
}

export function conditionOf(name: string): SkyCondition {
	return CONDITIONS[name] ?? 'cloudy'
}

/** The bridge's answer as the model. */
export function normalizeWeatherKit(raw: WeatherKitResponse): Forecast {
	const timeZone = raw.timeZone
	const now = raw.current.time
	const today = dateIn(timeZone, now)
	const { attribution } = raw

	const days: DayReading[] = raw.days.map((day) => {
		// noon of the day, so the date holds whether the day's instant is the place's midnight or UTC's
		const date = dateIn(timeZone, day.time + 12 * HOUR_MS)
		const observed = date < today
		return {
			date,
			condition: conditionOf(day.condition),
			hi: day.hi,
			lo: day.lo,
			precipChance: observed ? null : Math.round(day.precipChance),
			precipAmount: day.precipAmount,
			uvMax: day.uvMax,
			sunrise: day.sunrise,
			sunset: day.sunset,
			observed,
		}
	})

	return {
		provider: 'weatherkit',
		timeZone,
		current: {
			time: now,
			temp: raw.current.temp,
			feelsLike: raw.current.feelsLike,
			condition: conditionOf(raw.current.condition),
			night: !raw.current.daylight,
			humidity: raw.current.humidity,
			dewPoint: raw.current.dewPoint,
			windSpeed: raw.current.windSpeed,
			windGust: raw.current.windGust ?? raw.current.windSpeed,
			windDirection: raw.current.windDirection,
			pressure: raw.current.pressure,
			visibility: raw.current.visibility,
			cloudCover: raw.current.cloudCover,
			precipitation: raw.current.precipitation,
			uv: raw.current.uv,
		},
		hours: raw.hours
			.filter((hour) => hour.time > now - HOUR_MS)
			.slice(0, HOURS_KEPT)
			.map((hour) => ({
				time: hour.time,
				temp: hour.temp,
				condition: conditionOf(hour.condition),
				night: !hour.daylight,
				precipChance: Math.round(hour.precipChance),
			})),
		days: days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
		attribution: {
			provider: 'weatherkit',
			name: attribution.name || APPLE_WEATHER,
			mark:
				attribution.markLight && attribution.markDark
					? { light: attribution.markLight, dark: attribution.markDark }
					: undefined,
			legalUrl: attribution.legalUrl,
		},
	}
}

/** Whether the bridge is in this build, and whether WeatherKit has answered yet. */
export async function weatherKitStatus(): Promise<WeatherKitStatus> {
	if (!isTauri()) return { compiled: false, verified: 'unknown' }
	try {
		return await invoke<WeatherKitStatus>('weatherkit_status')
	} catch {
		return { compiled: false, verified: 'unknown' }
	}
}

export const weatherKit: ForecastProvider = {
	id: 'weatherkit',
	name: APPLE_WEATHER,
	available: async () => (await weatherKitStatus()).compiled,
	fetch: async ({ place, pastDays, forecastDays }) => {
		if (!isTauri()) throw new OfflineError(APPLE_WEATHER)
		try {
			const raw = await invoke<WeatherKitResponse>('weatherkit_forecast', {
				latitude: place.latitude,
				longitude: place.longitude,
				pastDays,
				forecastDays,
			})
			return normalizeWeatherKit(raw)
		} catch (error) {
			throw new OfflineError(APPLE_WEATHER, String(error))
		}
	},
}
