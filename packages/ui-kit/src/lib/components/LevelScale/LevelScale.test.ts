import { describe, expect, it } from 'vitest'
import { bandOf, markerAt } from './scale.js'

/** The US air quality index's bands. */
const AQI = [50, 100, 150, 200, 300, 500]

describe('bandOf', () => {
	it('finds the band and the way along it', () => {
		expect(bandOf(0, AQI)).toEqual({ band: 0, along: 0 })
		expect(bandOf(25, AQI)).toEqual({ band: 0, along: 0.5 })
		expect(bandOf(50, AQI)).toEqual({ band: 0, along: 1 })
		expect(bandOf(75, AQI)).toEqual({ band: 1, along: 0.5 })
		expect(bandOf(400, AQI)).toEqual({ band: 5, along: 0.5 })
	})

	it('holds a value outside the scale at its ends', () => {
		expect(bandOf(-5, AQI)).toEqual({ band: 0, along: 0 })
		expect(bandOf(900, AQI)).toEqual({ band: 5, along: 1 })
	})
})

describe('markerAt', () => {
	it('places the marker across equally wide bands', () => {
		expect(markerAt(0, AQI)).toBe(0)
		expect(markerAt(25, AQI)).toBe(8.3)
		expect(markerAt(150, AQI)).toBe(50)
		expect(markerAt(500, AQI)).toBe(100)
	})

	it('is zero without bands', () => {
		expect(markerAt(40, [])).toBe(0)
	})
})
