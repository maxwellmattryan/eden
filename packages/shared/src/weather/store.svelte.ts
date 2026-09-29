// Sky's store (product/domains/weather.md), shared by both apps: the forecast for the home place from the provider the
// owner chose (D-56), kept as the `weather` document so the last good forecast survives a relaunch and reads while
// offline (D-32: mirrors are per device, never synced), the NWS alerts beside it, the air quality and the allergens
// as supplementary slots that fail on their own (D-59), and the light and the moon computed here. The mirror is
// metric and the page converts, so a change of units never needs the network; the week and every time are the
// place's (D-58).
import { nowIso } from '../dates/index.js'
import { load, save } from '../persistence/index.js'
import { settings } from '../settings/settings.svelte.js'
import type { HomePlace } from '../types/index.js'
import { goldenHourOf, moonAt, type Moon } from './ephemeris.js'
import {
	emptySlot,
	type AirQuality,
	type Allergens,
	type Attribution,
	type CurrentReading,
	type DayReading,
	type Forecast,
	type HourReading,
	type ProviderId,
	type SupplementSlot,
} from './model.js'
import { fetchAlerts, type WeatherAlert } from './nws.js'
import { OfflineError } from './provider.js'
import { DEFAULT_PROVIDER, airQualitySources, allergenSources, providerFor } from './registry.js'
import { fillSlot, slotStale } from './supplement.js'
import { temperature } from './units.js'
import { hoursFrom, mergeDays, todayOf, weekHasGap, weekOf, type WeekDay } from './view.js'
import { addDays, placeToday } from './week.js'

export interface WeatherData {
	/** When the forecast was fetched, as an ISO timestamp: the "last good" time. */
	fetchedAt: string
	place: HomePlace
	forecast: Forecast
	alerts: WeatherAlert[]
	airQuality: SupplementSlot<AirQuality>
	allergens: SupplementSlot<Allergens>
}

export interface Sun {
	sunrise: number
	sunset: number
	goldenHour: number
	moon: Moon
}

const DOCUMENT = 'weather'
/** 2: the provider-neutral model. A mirror is never migrated: an older document is dropped and fetched again. */
const VERSION = 2
/** Refresh when the forecast is older than this (weather.md: every three hours on the scheduler; sooner on open). */
const STALE_MS = 30 * 60 * 1000
const AIR_STALE_MS = 60 * 60 * 1000
const ALLERGENS_STALE_MS = 3 * 60 * 60 * 1000
const HOURS_SHOWN = 12
/** Six days back and seven on reach every day of the calendar week, whichever day it starts on. */
const PAST_DAYS = 6
const FORECAST_DAYS = 7

function samePlace(a: HomePlace, b: HomePlace): boolean {
	return a.latitude === b.latitude && a.longitude === b.longitude
}

export class WeatherStore {
	ready = $state(false)
	loading = $state(false)
	/** The last fetch failed; whatever is shown is the last good forecast. */
	offline = $state(false)
	data = $state<WeatherData | null>(null)
	/** The instant the page reads the forecast at, moved on by every load and refresh. */
	at = $state(Date.now())

	readonly lastGood = $derived(this.data?.fetchedAt)
	readonly alerts = $derived(this.data?.alerts ?? [])
	readonly forecast = $derived<Forecast | undefined>(this.data?.forecast)
	/** The place's timezone: every time on the page is written in it. */
	readonly timeZone = $derived(this.data?.forecast.timeZone)
	readonly airQuality = $derived<SupplementSlot<AirQuality>>(this.data?.airQuality ?? emptySlot())
	readonly allergens = $derived<SupplementSlot<Allergens>>(this.data?.allergens ?? emptySlot())

	/** The day the forecast holds for today where the place is. */
	readonly today = $derived<DayReading | undefined>(this.forecast ? todayOf(this.forecast, this.at) : undefined)

	/** The current reading with the day's range, the same numbers the Sky page and the Garden tile show. */
	readonly now = $derived.by<(CurrentReading & { hi: number; lo: number }) | undefined>(() => {
		const current = this.forecast?.current
		if (!current) return undefined
		return { ...current, hi: this.today?.hi ?? current.temp, lo: this.today?.lo ?? current.temp }
	})

	/** Twelve hours from the current one. */
	readonly hours = $derived<HourReading[]>(this.forecast ? hoursFrom(this.forecast, this.at, HOURS_SHOWN) : [])

	/** The calendar week from the owner's week start: seven rows, today marked wherever it falls (D-58). */
	readonly week = $derived<WeekDay[]>(this.forecast ? weekOf(this.forecast, settings.weekStart, this.at) : [])

	/** Today's light, and the moon now. */
	readonly sun = $derived.by<Sun | undefined>(() => {
		const sunrise = this.today?.sunrise
		const sunset = this.today?.sunset
		if (sunrise == null || sunset == null) return undefined
		return { sunrise, sunset, goldenHour: goldenHourOf(sunset), moon: moonAt(this.at) }
	})

	/** The provider the forecast on the page is from. */
	readonly attribution = $derived<Attribution | undefined>(this.forecast?.attribution)
	/** The provider the owner chose, when it could not answer and the default stood in (D-57). */
	readonly fallbackFrom = $derived<ProviderId | undefined>(this.forecast?.fallbackFrom)
	/** The name of the provider the owner chose: what an offline message says could not be reached. */
	readonly providerName = $derived(providerFor(settings.weatherProvider).name)

	/** A temperature in the owner's units, rounded, from the Celsius the mirror holds. */
	temperature(celsius: number): number {
		return temperature(celsius, settings.measurement)
	}

	#reading: Promise<void> | null = null

	/** The mirror is missing, older than the refresh interval, for another place, or from another provider's choice. */
	get stale(): boolean {
		const data = this.data
		if (!data) return true
		const chosen = settings.weatherProvider
		const from = data.forecast.fallbackFrom ?? data.forecast.provider
		return (
			Date.now() - Date.parse(data.fetchedAt) > STALE_MS ||
			!samePlace(data.place, settings.home) ||
			from !== chosen ||
			!todayOf(data.forecast, Date.now())
		)
	}

	/** Reads the mirror once, then refreshes whenever it is stale; every page that shows the sky calls this on mount. */
	async load(): Promise<void> {
		this.#reading ??= load<WeatherData>(DOCUMENT).then((document) => {
			if (document?.version === VERSION && document.data?.forecast) this.data = document.data
			this.ready = true
		})
		await this.#reading
		this.at = Date.now()
		if (this.stale) await this.refresh()
	}

	/** The forecast from the chosen provider, or from the default with a note when the chosen one cannot answer. */
	async #forecast(place: HomePlace): Promise<Forecast> {
		const request = { place, pastDays: PAST_DAYS, forecastDays: FORECAST_DAYS }
		const chosen = providerFor(settings.weatherProvider)
		try {
			const forecast = await chosen.fetch(request)
			if (chosen.id === DEFAULT_PROVIDER || !weekHasGap(forecast, settings.weekStart, Date.now())) return forecast
			// a provider that could not give the week's past borrows it from the default one; without it the rows read
			// "no data" and the forecast still stands
			const past = await providerFor(DEFAULT_PROVIDER)
				.fetch(request)
				.then((fill) => fill.days.filter((day) => day.observed))
				.catch(() => [])
			const from = addDays(placeToday(forecast.timeZone), -PAST_DAYS)
			return { ...forecast, days: mergeDays(past, forecast.days, from) }
		} catch (error) {
			if (!(error instanceof OfflineError) || chosen.id === DEFAULT_PROVIDER) throw error
			const forecast = await providerFor(DEFAULT_PROVIDER).fetch(request)
			return { ...forecast, fallbackFrom: chosen.id }
		}
	}

	/**
	 * Fetches the forecast and the alerts for the home place, then the supplementary slots that are due. A failure of
	 * the forecast keeps the last good one and flags offline; a failure of a supplement marks its slot alone.
	 */
	async refresh(): Promise<void> {
		if (this.loading) return
		this.loading = true
		const place = $state.snapshot(settings.home)
		const previous = this.data && samePlace(this.data.place, place) ? $state.snapshot(this.data) : null
		try {
			const [forecast, alerts] = await Promise.all([
				this.#forecast(place),
				fetchAlerts(place.latitude, place.longitude),
			])
			const fetchedAt = nowIso()
			const now = Date.now()
			const [airQuality, allergens] = await Promise.all([
				previous && !slotStale(previous.airQuality, AIR_STALE_MS, now)
					? previous.airQuality
					: fillSlot(airQualitySources, place, fetchedAt),
				previous && !slotStale(previous.allergens, ALLERGENS_STALE_MS, now)
					? previous.allergens
					: fillSlot(allergenSources, place, fetchedAt),
			])
			const from = addDays(placeToday(forecast.timeZone, now), -PAST_DAYS)
			const days = mergeDays(previous?.forecast.days ?? [], forecast.days, from)
			this.data = { fetchedAt, place, forecast: { ...forecast, days }, alerts, airQuality, allergens }
			this.at = now
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
