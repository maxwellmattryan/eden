import { describe, expect, it } from 'vitest'
import { measurementFrom } from './migrate.js'

describe('measurementFrom', () => {
	it('is metric when nothing is stored', () => {
		expect(measurementFrom(null, null)).toBe('metric')
	})

	it('carries Fahrenheit over as imperial', () => {
		expect(measurementFrom(null, 'fahrenheit')).toBe('imperial')
	})

	it('carries Celsius over as metric', () => {
		expect(measurementFrom(null, 'celsius')).toBe('metric')
	})

	it('prefers the stored choice to the setting it replaced', () => {
		expect(measurementFrom('metric', 'fahrenheit')).toBe('metric')
		expect(measurementFrom('imperial', 'celsius')).toBe('imperial')
	})

	it('ignores a value it does not know', () => {
		expect(measurementFrom('kelvin', null)).toBe('metric')
	})
})
