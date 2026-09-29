import { describe, expect, it } from 'vitest'
import raw from '../fixtures/open-meteo.json'
import { conditionFor, forecastUrl, normalizeOpenMeteo, type OpenMeteoResponse } from './open-meteo.js'

const response = raw as OpenMeteoResponse
const forecast = normalizeOpenMeteo(response)
const place = { label: 'Hyde Park', latitude: 30.305, longitude: -97.735 }

describe('forecastUrl', () => {
	const url = new URL(forecastUrl({ place, pastDays: 6, forecastDays: 7 }))

	it('sends coordinates rounded to two decimals (D-60)', () => {
		expect(url.searchParams.get('latitude')).toBe('30.31')
		expect(url.searchParams.get('longitude')).toBe('-97.73')
	})

	it('asks for instants, the place timezone and the days on both sides of today', () => {
		expect(url.searchParams.get('timeformat')).toBe('unixtime')
		expect(url.searchParams.get('timezone')).toBe('auto')
		expect(url.searchParams.get('past_days')).toBe('6')
		expect(url.searchParams.get('forecast_days')).toBe('7')
	})
})

describe('normalizeOpenMeteo', () => {
	it('carries the provider, the timezone and the attribution', () => {
		expect(forecast.provider).toBe('open-meteo')
		expect(forecast.timeZone).toBe('America/Chicago')
		expect(forecast.attribution.name).toBe('Open-Meteo')
	})

	it('reads the current conditions in metric, the visibility in kilometres', () => {
		expect(forecast.current.time).toBe(response.current.time * 1000)
		expect(forecast.current.temp).toBe(30.1)
		expect(forecast.current.feelsLike).toBe(33.4)
		expect(forecast.current.humidity).toBe(63)
		expect(forecast.current.windDirection).toBe(180)
		expect(forecast.current.visibility).toBeCloseTo(25.3)
		expect(forecast.current.uv).toBe(4.6)
	})

	it('dates the days in the place timezone, thirteen of them in order', () => {
		expect(forecast.days).toHaveLength(13)
		expect(forecast.days.map((day) => day.date)).toEqual([...forecast.days.map((day) => day.date)].sort())
		expect(forecast.days[6]?.date).toBe('2026-09-29')
	})

	it('marks the days before today observed, with no chance of rain to give', () => {
		expect(forecast.days.slice(0, 6).every((day) => day.observed && day.precipChance === null)).toBe(true)
		expect(forecast.days.slice(6).every((day) => !day.observed)).toBe(true)
	})

	it('keeps sunrise and sunset as instants', () => {
		const today = forecast.days[6]!
		expect(today.sunrise).toBe(response.daily.sunrise[6]! * 1000)
		expect(today.sunset! > today.sunrise!).toBe(true)
	})

	it('keeps the hours from the current one on', () => {
		expect(forecast.hours[0]!.time).toBeLessThanOrEqual(forecast.current.time)
		expect(forecast.current.time - forecast.hours[0]!.time).toBeLessThan(60 * 60 * 1000)
	})
})

describe('conditionFor', () => {
	it('maps the WMO codes', () => {
		expect(conditionFor(0)).toBe('sunny')
		expect(conditionFor(2)).toBe('partly-cloudy')
		expect(conditionFor(63)).toBe('rain')
		expect(conditionFor(95)).toBe('thunderstorm')
		expect(conditionFor(1234)).toBe('cloudy')
	})

	it('reads a clear sky as windy from 40 km/h', () => {
		expect(conditionFor(1, 45)).toBe('wind')
		expect(conditionFor(63, 45)).toBe('rain')
	})
})
