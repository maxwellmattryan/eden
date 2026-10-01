// Between what Sky holds and its rows (D-85): the forecast, the alerts, the air quality and the allergens are mirrors
// (D-32) in the data layer, each named by its source and an external id. A refresh puts the rows the store holds and
// drops every other row of Sky's types, so the rows are what the store holds, for one place at a time. Until the home
// is a Place row the place is named by its rounded coordinates, the same two decimals that leave the device (D-60).
import type { BatchOp, Entity } from '../data/types.js'
import type { EntityTypeId } from '../registry/index.js'
import type { HomePlace } from '../types/index.js'
import { rounded } from './coordinates.js'
import {
	emptySlot,
	type AirQuality,
	type Allergens,
	type Forecast,
	type ProviderId,
	type SupplementSlot,
} from './model.js'
import type { WeatherAlert } from './nws.js'

export interface WeatherData {
	/** When the forecast was fetched, as an ISO timestamp: the "last good" time. */
	fetchedAt: string
	place: HomePlace
	forecast: Forecast
	alerts: WeatherAlert[]
	/** When the alerts were last answered, as an ISO timestamp; a mirror from before they were fetched apart has none. */
	alertsAt?: string
	/** `false` once the alert service said it does not cover the place: it is not asked again until the place changes. */
	alertsCovered?: boolean
	airQuality: SupplementSlot<AirQuality>
	allergens: SupplementSlot<Allergens>
	/** The ids of the alerts the owner has dismissed; one is forgotten once its alert is no longer issued. */
	dismissed?: string[]
}

/** The registry ids of Sky's entity types (product/substrate/registry.md). No `ephemeris` row is written (D-85). */
export const SKY = {
	forecast: 'forecast',
	alert: 'alert',
	airQuality: 'air-quality',
	allergens: 'allergens',
} as const satisfies Record<string, EntityTypeId>

/** The source of every alert row: the one alert service there is. */
export const ALERT_SOURCE = 'nws'

/** What names a place in a row's key: its coordinates as they are sent. */
export const placeKey = (place: Pick<HomePlace, 'latitude' | 'longitude'>): string =>
	`${rounded(place.latitude)},${rounded(place.longitude)}`

/** The forecast's row: the forecast, and what Sky knows of the place that has no row of its own. */
export interface ForecastPayload {
	place: HomePlace
	fetchedAt: string
	forecast: Forecast
	alertsAt?: string
	alertsCovered?: boolean
	/** When a slot no source covers was last asked for: it has no source, so no row, and is not asked again too soon. */
	asked?: { airQuality?: string; allergens?: string }
}

/** A supplementary slot's row (D-59); its source is the row's. */
export interface SlotPayload<T> {
	fetchedAt: string
	status: 'ok' | 'failed'
	data: T | null
}

/** An alert's row: the alert, the place it was answered for, and whether the owner put it away on this device. */
export type AlertPayload = WeatherAlert & { place: string; dismissed?: boolean }

export interface SkyRows {
	forecasts: Entity<ForecastPayload>[]
	alerts: Entity<AlertPayload>[]
	airQuality: Entity<SlotPayload<AirQuality>>[]
	allergens: Entity<SlotPayload<Allergens>>[]
}

const put = (type: string, source: string, externalId: string, payload: object): BatchOp => ({
	op: 'putMirror',
	input: { type, source, externalId, payload },
})

const keyOf = (type: string, source: string | null, externalId: string | null) => `${type}|${source}|${externalId}`

/** The write of one alert's row. */
export function alertOp(alert: WeatherAlert, place: string, dismissed: boolean): BatchOp {
	const payload: AlertPayload = { ...alert, place, ...(dismissed ? { dismissed } : {}) }
	return put(SKY.alert, ALERT_SOURCE, alert.id, payload)
}

function slotOp<T>(type: string, slot: SupplementSlot<T>, place: string): BatchOp | null {
	if (!slot.source || !slot.fetchedAt || slot.status === 'unavailable') return null
	return put(type, slot.source, place, {
		fetchedAt: slot.fetchedAt,
		status: slot.status,
		data: slot.data,
	} satisfies SlotPayload<T>)
}

/** When a slot nothing covers was asked for; a slot with a row, or one never asked for, has none. */
const askedAt = <T>(slot: SupplementSlot<T>) => (slot.source ? undefined : (slot.fetchedAt ?? undefined))

/**
 * The writes that store what Sky holds: a put for each row, then a drop for every row held that is no longer wanted
 * (another place's, another provider's, an alert no longer issued).
 */
export function skyOps(
	data: WeatherData,
	held: readonly Pick<Entity, 'uri' | 'type' | 'source' | 'externalId'>[]
): BatchOp[] {
	const place = placeKey(data.place)
	const airQuality = askedAt(data.airQuality)
	const allergens = askedAt(data.allergens)
	const forecast: ForecastPayload = {
		place: data.place,
		fetchedAt: data.fetchedAt,
		forecast: data.forecast,
		...(data.alertsAt !== undefined ? { alertsAt: data.alertsAt } : {}),
		...(data.alertsCovered !== undefined ? { alertsCovered: data.alertsCovered } : {}),
		...(airQuality || allergens
			? { asked: { ...(airQuality ? { airQuality } : {}), ...(allergens ? { allergens } : {}) } }
			: {}),
	}
	const dismissed = data.dismissed ?? []
	const puts = [
		put(SKY.forecast, data.forecast.provider, place, forecast),
		slotOp(SKY.airQuality, data.airQuality, place),
		slotOp(SKY.allergens, data.allergens, place),
		...data.alerts.map((alert) => alertOp(alert, place, dismissed.includes(alert.id))),
	].filter((op): op is BatchOp => op !== null)

	const wanted = new Set(
		puts.map((op) => (op.op === 'putMirror' ? keyOf(op.input.type, op.input.source, op.input.externalId) : ''))
	)
	const drops = held
		.filter((row) => !wanted.has(keyOf(row.type, row.source, row.externalId)))
		.map((row): BatchOp => ({ op: 'dropMirror', uri: row.uri }))
	return [...puts, ...drops]
}

function slotOf<T>(rows: Entity<SlotPayload<T>>[], place: string, asked: string | undefined): SupplementSlot<T> {
	const row = rows.find((entry) => entry.externalId === place)
	if (row)
		return { source: row.source, fetchedAt: row.payload.fetchedAt, status: row.payload.status, data: row.payload.data }
	return asked ? { source: null, fetchedAt: asked, status: 'unavailable', data: null } : emptySlot()
}

/**
 * The rows as the store holds them, or `null` when there is no forecast. Of several forecasts (a write that did not
 * finish its drops) the one for the home from the provider the owner chose comes first, then the latest.
 */
export function skyFromRows(rows: SkyRows, home: HomePlace, chosen: ProviderId): WeatherData | null {
	const here = placeKey(home)
	const rank = (row: Entity<ForecastPayload>) =>
		(row.externalId === here ? 2 : 0) +
		((row.payload.forecast.fallbackFrom ?? row.payload.forecast.provider) === chosen ? 1 : 0)
	const [row] = [...rows.forecasts].sort(
		(a, b) => rank(b) - rank(a) || (a.payload.fetchedAt < b.payload.fetchedAt ? 1 : -1)
	)
	if (!row) return null
	const { place, fetchedAt, forecast, alertsAt, alertsCovered, asked } = row.payload
	const key = placeKey(place)
	const alerts = rows.alerts.filter((entry) => entry.payload.place === key)
	return {
		fetchedAt,
		place,
		forecast,
		alerts: alerts.map(({ payload: { place: _place, dismissed: _dismissed, ...alert } }) => alert),
		...(alertsAt !== undefined ? { alertsAt } : {}),
		...(alertsCovered !== undefined ? { alertsCovered } : {}),
		airQuality: slotOf(rows.airQuality, key, asked?.airQuality),
		allergens: slotOf(rows.allergens, key, asked?.allergens),
		dismissed: alerts.filter((entry) => entry.payload.dismissed).map((entry) => entry.payload.id),
	}
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/**
 * The document the store kept before the data layer, as the writes that store it. Only the provider-neutral shape is
 * brought over: an older mirror is dropped and fetched again, as it always was.
 */
export function legacyOps(data: unknown): BatchOp[] {
	if (!isObject(data) || !isObject(data.forecast) || !isObject(data.place)) return []
	const { forecast, place } = data
	const whole =
		typeof data.fetchedAt === 'string' &&
		typeof forecast.provider === 'string' &&
		Array.isArray(forecast.days) &&
		typeof place.latitude === 'number' &&
		typeof place.longitude === 'number'
	if (!whole) return []
	const held = data as unknown as WeatherData
	return skyOps(
		{
			...held,
			alerts: Array.isArray(held.alerts) ? held.alerts : [],
			airQuality: isObject(held.airQuality) ? held.airQuality : emptySlot(),
			allergens: isObject(held.allergens) ? held.allergens : emptySlot(),
		},
		[]
	)
}
