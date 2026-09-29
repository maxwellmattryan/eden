// From the metric the mirror holds to the owner's measurement system (D-58). Each returns the figure and the key of
// its unit, which the page names through i18n (`domains.weather.units.<key>`).
import type { MeasurementSystem } from '../types/index.js'

export type UnitKey = 'kmh' | 'mph' | 'hpa' | 'inhg' | 'km' | 'mi' | 'mm' | 'in'
export interface Measure {
	value: number
	unit: UnitKey
}

const round = (value: number, places: number) => {
	const factor = 10 ** places
	return Math.round(value * factor) / factor
}

/** A temperature in whole degrees: Celsius, or Fahrenheit. */
export function temperature(celsius: number, system: MeasurementSystem): number {
	return Math.round(system === 'imperial' ? (celsius * 9) / 5 + 32 : celsius)
}

export function speed(kmh: number, system: MeasurementSystem): Measure {
	return system === 'imperial'
		? { value: Math.round(kmh / 1.609344), unit: 'mph' }
		: { value: Math.round(kmh), unit: 'kmh' }
}

export function pressure(hpa: number, system: MeasurementSystem): Measure {
	return system === 'imperial'
		? { value: round(hpa * 0.0295299831, 2), unit: 'inhg' }
		: { value: Math.round(hpa), unit: 'hpa' }
}

export function distance(km: number, system: MeasurementSystem): Measure {
	return system === 'imperial'
		? { value: Math.round(km / 1.609344), unit: 'mi' }
		: { value: Math.round(km), unit: 'km' }
}

export function rainfall(mm: number, system: MeasurementSystem): Measure {
	return system === 'imperial' ? { value: round(mm / 25.4, 2), unit: 'in' } : { value: round(mm, 1), unit: 'mm' }
}

export type Compass =
	'N' | 'NNE' | 'NE' | 'ENE' | 'E' | 'ESE' | 'SE' | 'SSE' | 'S' | 'SSW' | 'SW' | 'WSW' | 'W' | 'WNW' | 'NW' | 'NNW'
const COMPASS: readonly Compass[] = [
	'N',
	'NNE',
	'NE',
	'ENE',
	'E',
	'ESE',
	'SE',
	'SSE',
	'S',
	'SSW',
	'SW',
	'WSW',
	'W',
	'WNW',
	'NW',
	'NNW',
]

/** The sixteen-point compass name of a bearing in degrees. */
export function compass(degrees: number): Compass {
	const turn = (((degrees % 360) + 360) % 360) / 22.5
	return COMPASS[Math.round(turn) % 16] ?? 'N'
}

export type UvCategory = 'low' | 'moderate' | 'high' | 'very-high' | 'extreme'

/** The World Health Organization's exposure category for a UV index. */
export function uvCategory(index: number): UvCategory {
	const uv = Math.round(index)
	if (uv <= 2) return 'low'
	if (uv <= 5) return 'moderate'
	if (uv <= 7) return 'high'
	if (uv <= 10) return 'very-high'
	return 'extreme'
}
