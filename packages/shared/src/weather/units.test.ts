import { describe, expect, it } from 'vitest'
import { compass, distance, pressure, rainfall, speed, temperature, uvCategory } from './units.js'

describe('units', () => {
	it('leaves metric as it is held, rounded', () => {
		expect(temperature(21.6, 'metric')).toBe(22)
		expect(speed(14.4, 'metric')).toEqual({ value: 14, unit: 'kmh' })
		expect(pressure(1011.8, 'metric')).toEqual({ value: 1012, unit: 'hpa' })
		expect(distance(25.3, 'metric')).toEqual({ value: 25, unit: 'km' })
		expect(rainfall(4.23, 'metric')).toEqual({ value: 4.2, unit: 'mm' })
	})

	it('converts to imperial', () => {
		expect(temperature(30, 'imperial')).toBe(86)
		expect(speed(16.09344, 'imperial')).toEqual({ value: 10, unit: 'mph' })
		expect(pressure(1013.25, 'imperial')).toEqual({ value: 29.92, unit: 'inhg' })
		expect(distance(16.09344, 'imperial')).toEqual({ value: 10, unit: 'mi' })
		expect(rainfall(25.4, 'imperial')).toEqual({ value: 1, unit: 'in' })
	})
})

describe('compass', () => {
	it('names a bearing on sixteen points', () => {
		expect(compass(0)).toBe('N')
		expect(compass(157)).toBe('SSE')
		expect(compass(180)).toBe('S')
		expect(compass(349)).toBe('N')
		expect(compass(-90)).toBe('W')
	})
})

describe('uvCategory', () => {
	it('follows the WHO bands', () => {
		expect(uvCategory(2.4)).toBe('low')
		expect(uvCategory(4.6)).toBe('moderate')
		expect(uvCategory(7)).toBe('high')
		expect(uvCategory(10)).toBe('very-high')
		expect(uvCategory(11)).toBe('extreme')
	})
})
