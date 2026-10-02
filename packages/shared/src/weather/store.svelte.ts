// Sky's store (product/domains/weather.md), shared by both apps: the forecast for the home place from the provider the
// owner chose (D-56), kept as mirror rows in the data layer so the last good forecast survives a relaunch and reads
// while offline (D-32: mirrors are per device, never synced; D-85; `rows.ts` is between this and the rows), the NWS
// alerts beside it, the air quality and the allergens as supplementary slots that fail on their own (D-59), and the
// light and the moon computed here. The mirror is metric and the page converts, so a change of units never needs
// the network; the week and every time are the place's (D-58).
//
// A mirror is not the owner's data: a write has no undo and no queue, and one that fails is logged and made again by
// the next refresh.
//
// When it is fetched again is the refresh coordinator's (D-73): the forecast while something reads it and it is a
// quarter of an hour old, and whenever the owner asks; the alerts every five minutes on the scheduler, read or not,
// because a severe one is told even while the window is hidden. Each alert is emitted as `weather.alert`, once.
import { logError } from '../api/diagnostics.js'
import { applyBatch, queryEntities } from '../data/client.js'
import { importLegacyDocument } from '../data/legacy.js'
import type { BatchOp, Entity } from '../data/types.js'
import { nowIso } from '../dates/index.js'
import { forecastPlace } from '../home/rows.js'
import { home } from '../home/store.svelte.js'
import { coordinator } from '../refresh/index.js'
import { settings } from '../settings/settings.svelte.js'
import { emit, withdraw } from '../signals/runtime.js'
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
import { fetchAlerts } from './nws.js'
import { OfflineError } from './provider.js'
import { DEFAULT_PROVIDER, airQualitySources, allergenSources, providerFor } from './registry.js'
import {
	alertOp,
	legacyOps,
	placeKey,
	SKY,
	skyFromRows,
	skyOps,
	type AlertPayload,
	type ForecastPayload,
	type SlotPayload,
	type WeatherData,
} from './rows.js'
import { fillSlot, slotStale } from './supplement.js'
import { temperature } from './units.js'
import { hoursFrom, mergeDays, todayOf, weekHasGap, weekOf, type WeekDay } from './view.js'
import { addDays, placeToday } from './week.js'

export type { WeatherData }

export interface Sun {
	sunrise: number
	sunset: number
	goldenHour: number
	moon: Moon
}

/** The document the store kept before the data layer, brought over once (`legacyOps`). */
const DOCUMENT = 'weather'
/** The forecast is refreshed once it is this old, while something reads it (weather.md, "Refresh"). */
const STALE_MS = 15 * 60 * 1000
/** The alerts are the scheduler's, every five minutes; a forecast refresh brings them along only when they are older. */
const ALERTS_STALE_MS = 5 * 60 * 1000
/** The forecast as the refresh coordinator knows it: what a view watches to keep it fresh. */
export const FORECAST_RESOURCE = 'weather.forecast'
/** The schedule Sky declares for the alerts (`manifest.json`), and the resource bound to it. */
export const ALERTS_SCHEDULE = 'weather.alerts'
/** What each active alert is emitted as, keyed by its id. */
const ALERT_SIGNAL = 'weather.alert'
const AIR_STALE_MS = 60 * 60 * 1000
const ALLERGENS_STALE_MS = 3 * 60 * 60 * 1000
const HOURS_SHOWN = 12
const MINUTE_MS = 60 * 1000
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
	/** The minute, for what moves with the clock and not with the forecast: the sun's place, the reading's age. */
	clock = $state(Date.now())

	readonly lastGood = $derived(this.data?.fetchedAt)
	/** The active alerts the owner has not dismissed. */
	readonly alerts = $derived.by(() => {
		const dismissed = this.data?.dismissed ?? []
		return (this.data?.alerts ?? []).filter((alert) => !dismissed.includes(alert.id))
	})
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
	/** The rows Sky's types hold, as of the last read or write: what a write may have to drop. */
	#held: readonly Pick<Entity, 'uri' | 'type' | 'source' | 'externalId'>[] = []
	/** The writes, one at a time, so each knows the rows the one before it left. */
	#writing: Promise<void> = Promise.resolve()
	#ticker: ReturnType<typeof setInterval> | null = null
	#alerting: Promise<void> | null = null

	/**
	 * How old the forecast is, in milliseconds. One that is missing, for another place, from another provider's
	 * choice or without today in it is as old as can be.
	 */
	get forecastAge(): number {
		const data = this.data
		if (!data) return Infinity
		const chosen = settings.weatherProvider
		const from = data.forecast.fallbackFrom ?? data.forecast.provider
		if (!samePlace(data.place, home.current) || from !== chosen || !todayOf(data.forecast, Date.now())) return Infinity
		return Date.now() - Date.parse(data.fetchedAt)
	}

	/** How old the alerts are; never answered for this place is as old as can be. */
	get alertsAge(): number {
		const data = this.data
		if (!data?.alertsAt || !samePlace(data.place, home.current)) return Infinity
		return Date.now() - Date.parse(data.alertsAt)
	}

	/** The forecast is due a refresh. */
	get stale(): boolean {
		return this.forecastAge >= STALE_MS
	}

	async #rows() {
		const [forecasts, alerts, airQuality, allergens] = await Promise.all([
			queryEntities<ForecastPayload>({ type: SKY.forecast }),
			queryEntities<AlertPayload>({ type: SKY.alert }),
			queryEntities<SlotPayload<AirQuality>>({ type: SKY.airQuality }),
			queryEntities<SlotPayload<Allergens>>({ type: SKY.allergens }),
		])
		this.#held = [...forecasts, ...alerts, ...airQuality, ...allergens]
		return { forecasts, alerts, airQuality, allergens }
	}

	#read(): Promise<void> {
		const failed = (what: string) => (error: unknown) => logError('weather', what, String(error)).catch(() => null)
		return (this.#reading ??= home
			.load()
			.then(() => importLegacyDocument<unknown>(DOCUMENT, legacyOps))
			// an old document that could not be brought over is tried again at the next launch
			.catch(failed('Could not import the old document'))
			.then(() => this.#rows())
			.then((rows) => {
				this.data = skyFromRows(rows, forecastPlace($state.snapshot(home.current)), settings.weatherProvider)
			})
			// rows that cannot be read are a forecast not held: it is fetched, and the reason is in the log
			.catch(failed('Could not read the mirror'))
			.then(() => {
				this.ready = true
			}))
	}

	/** Reads the mirror again, after an import replaced the rows, and refreshes what is stale. */
	async reload(): Promise<void> {
		await this.#writing
		this.#reading = null
		await this.load()
	}

	/** Reads the mirror once, then refreshes whenever it is stale; every page that shows the sky calls this on mount. */
	async load(): Promise<void> {
		await this.#read()
		this.at = Date.now()
		this.#ticker ??= setInterval(() => (this.clock = Date.now()), MINUTE_MS)
		if (this.stale) await this.refresh()
	}

	/**
	 * Makes Sky known to the refresh coordinator: the forecast, fresh while something reads it, and the alerts, on
	 * their schedule. The shell binds it once when it starts (the manifest's `subscribe`); the answer unbinds.
	 */
	bind(): () => void {
		const stops = [
			coordinator.register({
				id: FORECAST_RESOURCE,
				foreground: STALE_MS,
				age: () => this.forecastAge,
				refresh: () => this.load(),
			}),
			coordinator.register({
				id: ALERTS_SCHEDULE,
				schedule: ALERTS_SCHEDULE,
				age: () => this.alertsAge,
				refresh: () => this.refreshAlerts(),
			}),
		]
		return () => stops.forEach((stop) => stop())
	}

	/** Stops the minute. */
	dispose() {
		if (this.#ticker) clearInterval(this.#ticker)
		this.#ticker = null
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
	 * Takes an alert off the page for as long as it is issued, and its card out of the inbox; the mirror remembers
	 * it across a relaunch.
	 */
	async dismissAlert(id: string): Promise<void> {
		if (!this.data || this.data.dismissed?.includes(id)) return
		this.data.dismissed = [...(this.data.dismissed ?? []), id]
		const alert = this.data.alerts.find((entry) => entry.id === id)
		const place = placeKey(this.data.place)
		if (alert) await this.#write(() => [alertOp($state.snapshot(alert), place, true)])
		await withdraw(ALERT_SIGNAL, id).catch(() => null)
	}

	/** Writes everything held as its rows, and drops the rows that are no longer held. */
	#save(): Promise<void> {
		return this.#write(() => (this.data ? skyOps($state.snapshot(this.data), this.#held) : []), true)
	}

	/**
	 * One batch, after the writes before it. Never rejects: a mirror that could not be written is fetched and written
	 * again. A batch of everything (`whole`) leaves the rows it put as the rows held; after a failure they are read
	 * again, since a batch that was refused may have named a row that is gone.
	 */
	#write(ops: () => BatchOp[], whole = false): Promise<void> {
		const run = async () => {
			try {
				const batch = ops()
				if (batch.length === 0) return
				const { rows } = await applyBatch(batch)
				if (whole) this.#held = rows
			} catch (error) {
				await logError('weather', 'Could not write the mirror', String(error)).catch(() => null)
				await this.#rows().catch(() => null)
			}
		}
		return (this.#writing = this.#writing.then(run))
	}

	/**
	 * Asks the alert service about the home place and emits each active alert as `weather.alert`, keyed by its id so
	 * it is a signal once however often it is answered. The alerts sit in the mirror beside the forecast, so there is
	 * nothing to do before a forecast for the place exists, nor for a place the service does not cover; a service that
	 * does not answer leaves the alerts as they were. A call while one is under way joins it.
	 */
	refreshAlerts({ force = false }: { force?: boolean } = {}): Promise<void> {
		return (this.#alerting ??= this.#alerts(force).finally(() => (this.#alerting = null)))
	}

	async #alerts(force: boolean): Promise<void> {
		await this.#read()
		const place = forecastPlace($state.snapshot(home.current))
		const held = (data: WeatherData | null): data is WeatherData => !!data && samePlace(data.place, place)
		if (!held(this.data) || (this.data.alertsCovered === false && !force)) return
		const answer = await fetchAlerts(place.latitude, place.longitude)
		// the forecast may have been replaced while the service answered; the alerts go into whatever is held now
		const data = this.data
		if (!answer || !held(data)) return
		data.alerts = answer.alerts
		data.alertsAt = nowIso()
		data.alertsCovered = answer.covered
		data.dismissed = (data.dismissed ?? []).filter((id) => answer.alerts.some((alert) => alert.id === id))
		await this.#save()
		for (const alert of answer.alerts) {
			const { id, severity, event, headline, ends } = alert
			await emit(
				ALERT_SIGNAL,
				{ alertId: id, severity, event, headline, ...(ends ? { ends } : {}) },
				{ dedupeKey: id }
			).catch(() => null)
		}
		// a dismissed alert has no card: one left by a withdrawal that failed, or from before there was one, goes now
		for (const id of data.dismissed) await withdraw(ALERT_SIGNAL, id).catch(() => null)
	}

	/**
	 * Fetches the forecast for the home place, then the supplementary slots that are due, or every slot when the owner
	 * asks for everything at once (`force`), and then the alerts when they are due too. A failure of the forecast
	 * keeps the last good one and flags offline; a failure of a supplement marks its slot alone.
	 */
	async refresh({ force = false }: { force?: boolean } = {}): Promise<void> {
		if (this.loading) return
		this.loading = true
		const place = forecastPlace($state.snapshot(home.current))
		const previous = this.data && samePlace(this.data.place, place) ? $state.snapshot(this.data) : null
		try {
			const forecast = await this.#forecast(place)
			const fetchedAt = nowIso()
			const now = Date.now()
			const [airQuality, allergens] = await Promise.all([
				previous && !force && !slotStale(previous.airQuality, AIR_STALE_MS, now)
					? previous.airQuality
					: fillSlot(airQualitySources, place, fetchedAt),
				previous && !force && !slotStale(previous.allergens, ALLERGENS_STALE_MS, now)
					? previous.allergens
					: fillSlot(allergenSources, place, fetchedAt),
			])
			const from = addDays(placeToday(forecast.timeZone, now), -PAST_DAYS)
			const days = mergeDays(previous?.forecast.days ?? [], forecast.days, from)
			// the alerts are their own fetch: what the mirror holds of them now, for this place, is carried over
			const kept = this.data && samePlace(this.data.place, place) ? $state.snapshot(this.data) : null
			this.data = {
				fetchedAt,
				place,
				forecast: { ...forecast, days },
				alerts: kept?.alerts ?? [],
				alertsAt: kept?.alertsAt,
				alertsCovered: kept?.alertsCovered,
				airQuality,
				allergens,
				dismissed: kept?.dismissed ?? [],
			}
			this.at = now
			this.clock = now
			this.offline = false
			await this.#save()
		} catch (error) {
			if (!(error instanceof OfflineError)) throw error
			this.offline = true
		} finally {
			this.loading = false
		}
		if (force || this.alertsAge >= ALERTS_STALE_MS) await this.refreshAlerts({ force })
	}
}

export const weather = new WeatherStore()
