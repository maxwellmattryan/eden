import { describe, expect, it } from 'vitest'
import { createEngine, type EngineStorage } from '../data/engine.js'
import type { Entity } from '../data/types.js'
import raw from './fixtures/open-meteo.json'
import { emptySlot, type AirQuality, type Allergens } from './model.js'
import type { WeatherAlert } from './nws.js'
import { forecastForPack, PACK_DAYS } from './pack.js'
import { normalizeOpenMeteo, type OpenMeteoResponse } from './providers/open-meteo.js'
import {
	legacyOps,
	placeKey,
	SKY,
	skyFromRows,
	skyOps,
	type AlertPayload,
	type ForecastPayload,
	type SkyRows,
	type SlotPayload,
	type WeatherData,
} from './rows.js'

function memory(): EngineStorage {
	const map = new Map<string, string>()
	return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => void map.set(key, value) }
}

const home = { label: 'Hyde Park', latitude: 30.305, longitude: -97.735 }
const forecast = normalizeOpenMeteo(raw as OpenMeteoResponse)
const flood: WeatherAlert = {
	id: 'urn:oid:1',
	event: 'Flood Watch',
	headline: 'Flood Watch until 7 PM',
	severity: 'severe',
}
const heat: WeatherAlert = { id: 'urn:oid:2', event: 'Heat Advisory', headline: 'Heat Advisory', severity: 'moderate' }
const air: AirQuality = { usAqi: 42, europeanAqi: 30, pm25: 8, pm10: 14, ozone: 60, no2: 9 }

const data: WeatherData = {
	fetchedAt: '2026-09-30T14:00:00.000Z',
	place: home,
	forecast,
	alerts: [flood, heat],
	alertsAt: '2026-09-30T14:01:00.000Z',
	alertsCovered: true,
	airQuality: { source: 'Open-Meteo', fetchedAt: '2026-09-30T14:00:00.000Z', status: 'ok', data: air },
	// nothing covers the place: asked, and no source to name a row by
	allergens: { source: null, fetchedAt: '2026-09-30T14:00:00.000Z', status: 'unavailable', data: null },
	dismissed: [heat.id],
}

function setup() {
	const engine = createEngine(memory())
	const read = (): SkyRows => ({
		forecasts: engine.queryEntities<ForecastPayload>({ type: SKY.forecast }),
		alerts: engine.queryEntities<AlertPayload>({ type: SKY.alert }),
		airQuality: engine.queryEntities<SlotPayload<AirQuality>>({ type: SKY.airQuality }),
		allergens: engine.queryEntities<SlotPayload<Allergens>>({ type: SKY.allergens }),
	})
	const held = (): Entity[] => Object.values(read()).flat() as Entity[]
	const save = (next: WeatherData) => engine.applyBatch(skyOps(next, held()))
	return { engine, read, held, save }
}

describe('skyOps and skyFromRows', () => {
	it('reads back from the rows what it wrote', () => {
		const { read, save } = setup()
		save(data)
		const rows = read()
		expect(rows.forecasts).toHaveLength(1)
		expect(rows.alerts).toHaveLength(2)
		expect(rows.airQuality).toHaveLength(1)
		expect(rows.allergens).toHaveLength(0)
		expect(
			Object.values(rows)
				.flat()
				.every((row) => row.mirror)
		).toBe(true)
		expect(rows.forecasts[0]).toMatchObject({ source: 'open-meteo', externalId: '30.31,-97.73' })
		expect(skyFromRows(rows, home, 'open-meteo')).toEqual(data)
	})

	it('replaces the rows of a refresh and keeps their ids', () => {
		const { read, save } = setup()
		save(data)
		const before = read()
		save({ ...data, fetchedAt: '2026-09-30T14:15:00.000Z' })
		const after = read()
		expect(after.forecasts.map((row) => row.id)).toEqual(before.forecasts.map((row) => row.id))
		expect(after.forecasts[0]?.payload.fetchedAt).toBe('2026-09-30T14:15:00.000Z')
		expect(after.alerts.map((row) => row.id)).toEqual(before.alerts.map((row) => row.id))
	})

	it('drops an alert that is no longer issued, and keeps a dismissal while it is', () => {
		const { engine, read, save } = setup()
		save(data)
		save({ ...data, alerts: [heat] })
		const rows = read()
		expect(rows.alerts.map((row) => row.externalId)).toEqual([heat.id])
		expect(rows.alerts[0]?.payload.dismissed).toBe(true)
		expect(engine.queryEntities({ type: SKY.alert, includeDeleted: true })).toHaveLength(1)
		expect(skyFromRows(rows, home, 'open-meteo')?.dismissed).toEqual([heat.id])
	})

	it('leaves no rows for the place the home moved from', () => {
		const { engine, read, save } = setup()
		save(data)
		const moved = { label: 'Kyoto', latitude: 35.0116, longitude: 135.7681 }
		save({ ...data, place: moved, alerts: [], dismissed: [], airQuality: emptySlot(), allergens: emptySlot() })
		const rows = read()
		expect(rows.forecasts.map((row) => row.externalId)).toEqual([placeKey(moved)])
		expect(rows.alerts).toEqual([])
		expect(rows.airQuality).toEqual([])
		expect(engine.queryEntities({ type: SKY.forecast, includeDeleted: true })).toHaveLength(1)
	})

	it('holds one forecast when the provider changes', () => {
		const { read, save } = setup()
		save(data)
		save({ ...data, forecast: { ...forecast, provider: 'weatherkit' } })
		const rows = read()
		expect(rows.forecasts.map((row) => row.source)).toEqual(['weatherkit'])
		expect(skyFromRows(rows, home, 'weatherkit')?.forecast.provider).toBe('weatherkit')
	})

	it('keeps a slot whose source failed, and one never asked for as empty', () => {
		const { read, save } = setup()
		const failed = { source: 'Open-Meteo', fetchedAt: data.fetchedAt, status: 'failed' as const, data: null }
		save({ ...data, airQuality: failed, allergens: emptySlot() })
		const back = skyFromRows(read(), home, 'open-meteo')
		expect(back?.airQuality).toEqual(failed)
		expect(back?.allergens).toEqual(emptySlot())
	})

	it('answers nothing without a forecast', () => {
		expect(skyFromRows(setup().read(), home, 'open-meteo')).toBeNull()
	})
})

describe('legacyOps', () => {
	it('brings over the document the store kept', () => {
		const { engine, read } = setup()
		// the document as JSON gave it back: no `undefined`, and fields a later version added may be missing
		const { dismissed: _dismissed, alertsAt: _alertsAt, ...older } = JSON.parse(JSON.stringify(data)) as WeatherData
		engine.applyBatch(legacyOps(older), 'legacy-import:weather')
		const back = skyFromRows(read(), home, 'open-meteo')
		expect(back?.forecast).toEqual(forecast)
		expect(back?.alerts).toEqual([flood, heat])
		expect(back?.dismissed).toEqual([])
		expect(back?.alertsAt).toBeUndefined()
	})

	it('brings over nothing of a document from before the provider-neutral model', () => {
		for (const old of [null, {}, { forecast: { daily: [] }, place: home, fetchedAt: data.fetchedAt }, 'text']) {
			expect(legacyOps(old)).toEqual([])
		}
	})
})

describe('forecastForPack', () => {
	it('carries the current reading and seven days from today, and no hours', () => {
		const { read, save } = setup()
		save(data)
		const row = read().forecasts[0]!
		const now = forecast.current.time
		const packed = forecastForPack(row, now)
		const payload = packed.payload as { days: { date: string }[]; hours?: unknown; current: object; place: string }
		expect(packed.mirror).toBe(true)
		expect(payload.place).toBe('Hyde Park')
		expect(payload.hours).toBeUndefined()
		expect(payload.days.length).toBeGreaterThan(0)
		expect(payload.days.length).toBeLessThanOrEqual(PACK_DAYS)
		expect(payload.days[0]?.date).toBe(row.payload.forecast.days.find((day) => !day.observed)?.date)
		expect(JSON.stringify(packed).length).toBeLessThan(JSON.stringify(row).length / 4)
	})
})
