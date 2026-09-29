import { describe, expect, it } from 'vitest'
import openMeteoRaw from '../fixtures/open-meteo.json'
import weatherKitRaw from '../fixtures/weatherkit.json'
import { weekOf } from '../view.js'
import { normalizeOpenMeteo, type OpenMeteoResponse } from './open-meteo.js'
import { conditionOf, normalizeWeatherKit, type WeatherKitResponse } from './weatherkit.js'

const apple = normalizeWeatherKit(weatherKitRaw as WeatherKitResponse)
const open = normalizeOpenMeteo(openMeteoRaw as OpenMeteoResponse)

/** Every path in a value that holds something, arrays read by their first item. */
function filled(value: unknown, path = ''): string[] {
	if (value === null || value === undefined) return []
	if (Array.isArray(value)) return filled(value[0], `${path}[]`)
	if (typeof value === 'object') {
		return Object.entries(value).flatMap(([key, inner]) => filled(inner, path ? `${path}.${key}` : key))
	}
	return [path]
}

describe('normalizeWeatherKit', () => {
	it('carries the provider, the timezone and the attribution of Apple with its mark and legal link', () => {
		expect(apple.provider).toBe('weatherkit')
		expect(apple.timeZone).toBe('America/Chicago')
		expect(apple.attribution.name).toBe('Apple Weather')
		expect(apple.attribution.mark?.light).toMatch(/^data:image\//)
		expect(apple.attribution.legalUrl).toMatch(/^https:\/\//)
	})

	it('dates the days where the place is and marks the past observed', () => {
		expect(apple.days.map((day) => day.date)).toEqual(open.days.map((day) => day.date))
		expect(apple.days.map((day) => day.observed)).toEqual(open.days.map((day) => day.observed))
	})

	it('reads night from daylight', () => {
		expect(apple.current.night).toBe(false)
	})

	it('falls back to the wind speed when there is no gust', () => {
		const raw = weatherKitRaw as WeatherKitResponse
		const calm = normalizeWeatherKit({ ...raw, current: { ...raw.current, windGust: null } })
		expect(calm.current.windGust).toBe(raw.current.windSpeed)
	})

	it('maps the conditions of WeatherKit, an unknown one to cloudy', () => {
		expect(conditionOf('mostlyClear')).toBe('sunny')
		expect(conditionOf('scatteredThunderstorms')).toBe('thunderstorm')
		expect(conditionOf('wintryMix')).toBe('snow')
		expect(conditionOf('somethingNew')).toBe('cloudy')
	})
})

describe('parity (D-56)', () => {
	it('fills the same fields of the model as Open-Meteo, the mark of the attribution apart', () => {
		const appleFields = filled({ ...apple, attribution: { ...apple.attribution, mark: undefined } }).sort()
		expect(appleFields).toEqual(filled(open).sort())
	})

	it('shows the same calendar week', () => {
		const now = open.current.time
		const dates = (forecast: typeof open) =>
			weekOf(forecast, 'monday', now).map((row) => [row.date, row.today, !!row.day])
		expect(dates(apple)).toEqual(dates(open))
	})
})
