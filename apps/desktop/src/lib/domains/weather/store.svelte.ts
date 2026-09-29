// Sky's store (product/domains/weather.md): the forecast for the home place, a mirror of Open-Meteo kept as the
// `weather` document so the last good forecast survives a relaunch and reads while offline (D-32: mirrors are per
// device, never synced), the NWS alerts beside it, and the light and the moon computed here. Temperatures are fetched
// in Celsius and converted for display, so a units change never needs the network.
import type { SkyCondition } from '@eden/ui-kit'
import { load, save } from '@eden/shared/persistence'
import { settings } from '@eden/shared/settings'
import type { HomePlace } from '@eden/shared/types'
import { nowIso } from '@eden/shared/dates'
import { clockOf, goldenHourOf, moonAt, type Moon } from './ephemeris.js'
import { fetchAlerts, type WeatherAlert } from './nws.js'
import { OfflineError, conditionFor, fetchForecast, type OpenMeteoForecast } from './open-meteo.js'

export interface WeatherData {
	/** When the forecast was fetched, as an ISO timestamp: the "last good" time. */
	fetchedAt: string
	place: HomePlace
	forecast: OpenMeteoForecast
	alerts: WeatherAlert[]
}

export interface Reading {
	temp: number
	condition: SkyCondition
	night: boolean
}
export interface HourReading extends Reading {
	id: string
	/** `HH:MM`, local to the place. */
	time: string
	/** Chance of precipitation, in percent. */
	precip: number
}
export interface DayReading {
	id: string
	/** The local date, `YYYY-MM-DD`. */
	date: string
	condition: SkyCondition
	hi: number
	lo: number
	precipMax: number
}
export interface Sun {
	sunrise: string
	sunset: string
	goldenHour: string
	moon: Moon
}

const DOCUMENT = 'weather'
const VERSION = 1
/** Refresh when the forecast is older than this (weather.md: every three hours on the scheduler; sooner on open). */
const STALE_MS = 30 * 60 * 1000
const HOURS_SHOWN = 12

function samePlace(a: HomePlace, b: HomePlace): boolean {
	return a.latitude === b.latitude && a.longitude === b.longitude
}

export class WeatherStore {
	ready = $state(false)
	loading = $state(false)
	/** The last fetch failed; whatever is shown is the last good forecast. */
	offline = $state(false)
	data = $state<WeatherData | null>(null)

	readonly lastGood = $derived(this.data?.fetchedAt)
	readonly alerts = $derived(this.data?.alerts ?? [])

	/** The index of the hourly row the current reading falls in. */
	readonly nowIndex = $derived.by(() => {
		const forecast = this.data?.forecast
		if (!forecast) return 0
		const hour = forecast.current.time.slice(0, 13)
		const index = forecast.hourly.time.findIndex((time) => time.slice(0, 13) === hour)
		return index < 0 ? 0 : index
	})

	/** The current reading: Open-Meteo's `current` block, the same number the Sky page and the Garden tile show. */
	readonly now = $derived.by<(Reading & { hi: number; lo: number }) | undefined>(() => {
		const forecast = this.data?.forecast
		if (!forecast) return undefined
		return {
			temp: forecast.current.temperature_2m,
			condition: conditionFor(forecast.current.weather_code, forecast.current.wind_speed_10m),
			night: forecast.current.is_day === 0,
			hi: forecast.daily.temperature_2m_max[0] ?? forecast.current.temperature_2m,
			lo: forecast.daily.temperature_2m_min[0] ?? forecast.current.temperature_2m,
		}
	})

	/** Twelve hours from the current one. */
	readonly hours = $derived.by<HourReading[]>(() => {
		const forecast = this.data?.forecast
		if (!forecast) return []
		return forecast.hourly.time.slice(this.nowIndex, this.nowIndex + HOURS_SHOWN).map((time, offset) => {
			const i = this.nowIndex + offset
			return {
				id: time,
				time: clockOf(time),
				temp: forecast.hourly.temperature_2m[i] ?? 0,
				condition: conditionFor(forecast.hourly.weather_code[i] ?? 3),
				night: forecast.hourly.is_day[i] === 0,
				precip: forecast.hourly.precipitation_probability[i] ?? 0,
			}
		})
	})

	/** The week from today. */
	readonly week = $derived.by<DayReading[]>(() => {
		const forecast = this.data?.forecast
		if (!forecast) return []
		return forecast.daily.time.map((date, i) => ({
			id: date,
			date,
			condition: conditionFor(forecast.daily.weather_code[i] ?? 3),
			hi: forecast.daily.temperature_2m_max[i] ?? 0,
			lo: forecast.daily.temperature_2m_min[i] ?? 0,
			precipMax: forecast.daily.precipitation_probability_max[i] ?? 0,
		}))
	})

	/** Today's light, and the moon now. */
	readonly sun = $derived.by<Sun | undefined>(() => {
		const forecast = this.data?.forecast
		const sunrise = forecast?.daily.sunrise[0]
		const sunset = forecast?.daily.sunset[0]
		if (!sunrise || !sunset) return undefined
		return { sunrise: clockOf(sunrise), sunset: clockOf(sunset), goldenHour: goldenHourOf(sunset), moon: moonAt() }
	})

	/** A temperature in the owner's units, rounded, from the Celsius the mirror holds. */
	temperature(celsius: number): number {
		return Math.round(settings.measurement === 'imperial' ? (celsius * 9) / 5 + 32 : celsius)
	}

	#reading: Promise<void> | null = null

	/** The mirror is missing, older than the refresh interval, or for another place. */
	get stale(): boolean {
		const data = this.data
		return !data || Date.now() - Date.parse(data.fetchedAt) > STALE_MS || !samePlace(data.place, settings.home)
	}

	/** Reads the mirror once, then refreshes whenever it is stale; every page that shows the sky calls this on mount. */
	async load(): Promise<void> {
		this.#reading ??= load<WeatherData>(DOCUMENT).then((document) => {
			if (document?.data?.forecast) this.data = document.data
			this.ready = true
		})
		await this.#reading
		if (this.stale) await this.refresh()
	}

	/** Fetches the forecast and the alerts for the home place; a failure keeps the last good forecast and flags offline. */
	async refresh(): Promise<void> {
		if (this.loading) return
		this.loading = true
		const place = $state.snapshot(settings.home)
		try {
			const [forecast, alerts] = await Promise.all([
				fetchForecast(place.latitude, place.longitude, 'celsius'),
				fetchAlerts(place.latitude, place.longitude),
			])
			this.data = { fetchedAt: nowIso(), place, forecast, alerts }
			this.offline = false
			await save<WeatherData>(DOCUMENT, { version: VERSION, data: $state.snapshot(this.data) }).catch(() => null)
		} catch (error) {
			if (!(error instanceof OfflineError)) throw error
			this.offline = true
		} finally {
			this.loading = false
		}
	}
}

export const weather = new WeatherStore()
