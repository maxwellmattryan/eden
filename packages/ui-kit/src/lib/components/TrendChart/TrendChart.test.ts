import { describe, expect, it } from 'vitest'
import { niceTicks, placeLabels, stepTicks, trend } from './trend.js'

describe('niceTicks', () => {
	it('spans the range with round figures', () => {
		expect(niceTicks(21, 29)).toEqual([20, 22, 24, 26, 28, 30])
		expect(niceTicks(71, 93)).toEqual([70, 80, 90, 100])
		expect(niceTicks(-3, 4)).toEqual([-4, -2, 0, 2, 4])
		expect(niceTicks(76, 95, 2)).toEqual([70, 80, 90, 100])
		expect(niceTicks(22, 29, 2)).toEqual([20, 25, 30])
	})

	it('opens a flat series by a step on each side', () => {
		expect(niceTicks(20, 20)).toEqual([19, 19.5, 20, 20.5, 21])
	})

	it('is empty without a finite range', () => {
		expect(niceTicks(NaN, 3)).toEqual([])
	})
})

describe('stepTicks', () => {
	it('runs from the ten at or below the lowest to the ten at or above the highest', () => {
		expect(stepTicks(72, 95, 10)).toEqual([70, 80, 90, 100])
		expect(stepTicks(76, 95, 10)).toEqual([70, 80, 90, 100])
		expect(stepTicks(22, 29, 10)).toEqual([20, 30])
		expect(stepTicks(-4, 3, 10)).toEqual([-10, 0, 10])
	})

	it('keeps a value that sits on a ten as the end of the scale', () => {
		expect(stepTicks(70, 90, 10)).toEqual([70, 80, 90])
	})

	it('opens a flat series on a ten by one step', () => {
		expect(stepTicks(80, 80, 10)).toEqual([80, 90])
	})

	it('is empty without a step or a finite range', () => {
		expect(stepTicks(72, 95, 0)).toEqual([])
		expect(stepTicks(NaN, 95, 10)).toEqual([])
	})
})

describe('placeLabels', () => {
	const xs = [36, 76, 116, 156, 196, 236, 276]

	it('centres a label under its tick and keeps it inside the drawing', () => {
		expect(placeLabels([36, 160, 284], ['12:00', '18:00', '00:00'], 292, 14, 8)).toEqual([16, 140, 252])
	})

	it('drops a label that would touch the one before it', () => {
		const labels = xs.map(() => '12:00')
		expect(placeLabels(xs, labels, 292, 14, 8)).toEqual([16, null, 96, null, 176, null, 252])
	})

	it('writes nothing for a tick without words', () => {
		expect(placeLabels(xs, ['', '', '18:00', '', '', '', ''], 292, 14, 8)).toEqual([
			null,
			null,
			96,
			null,
			null,
			null,
			null,
		])
	})
})

describe('trend', () => {
	const options = { width: 400, height: 120, left: 32, bottom: 20, top: 8, right: 8 }

	it('draws a point for every value inside the plot', () => {
		const geo = trend([22, 23, 25, 29, 27], options)
		expect(geo.points).toHaveLength(5)
		expect(geo.points[0]!.x).toBe(32)
		expect(geo.points[4]!.x).toBe(392)
		for (const point of geo.points) {
			expect(point.y).toBeGreaterThanOrEqual(8)
			expect(point.y).toBeLessThanOrEqual(100)
		}
		expect(geo.line.startsWith('M32.0 ')).toBe(true)
		expect(geo.area.endsWith('Z')).toBe(true)
	})

	it('puts the lowest figure on the floor and the highest at the top', () => {
		const geo = trend([22, 29], options)
		expect(geo.ticks[0]).toEqual({ value: 20, y: 100 })
		expect(geo.ticks.at(-1)).toEqual({ value: 30, y: 8 })
	})

	it('scales in whole steps when it is given one', () => {
		const geo = trend([76, 95], { ...options, step: 10 })
		expect(geo.ticks.map((tick) => tick.value)).toEqual([70, 80, 90, 100])
		expect(geo.ticks[0]!.y).toBe(100)
		expect(geo.ticks.at(-1)!.y).toBe(8)
		expect(geo.high!.y).toBeGreaterThan(8)
		expect(geo.low!.y).toBeLessThan(100)
	})

	it('skips what is not a number and draws nothing from nothing', () => {
		expect(trend([22, NaN, 24], options).points).toHaveLength(2)
		expect(trend([], options)).toMatchObject({ line: '', area: '', points: [], ticks: [], high: null, low: null })
	})

	it('finds the highest and the lowest points, and neither in a flat series', () => {
		const geo = trend([22, 23, 29, 27, 21], options)
		expect(geo.high).toMatchObject({ value: 29, x: geo.points[2]!.x })
		expect(geo.low).toMatchObject({ value: 21, x: geo.points[4]!.x })
		expect(trend([20, 20, 20], options).high).toBeNull()
	})
})
