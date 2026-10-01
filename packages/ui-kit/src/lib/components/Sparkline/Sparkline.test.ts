import { describe, expect, it } from 'vitest'
import { sparkline } from './sparkline.js'

// width 100 and height 40 with the default pad of 4: x runs 4 to 96, y runs 4 to 36, the axis sits at y 36.
const box = { width: 100, height: 40 }

describe('sparkline', () => {
	it('draws three values as one move and two lines, closed to the axis for the area', () => {
		const g = sparkline([1, 3, 2], box)
		expect(g.line).toMatch(/^M[\d.]+ [\d.]+ L[\d.]+ [\d.]+ L[\d.]+ [\d.]+$/)
		expect(g.line.startsWith('M4.0 ')).toBe(true)
		expect(g.area).toBe(`${g.line} L96.0 36.0 L4.0 36.0 Z`)
		expect(g.last).toEqual({ x: 96, y: 20 })
		expect(g.latest).toBe(2)
		// a point for every value, where a pointer reads it
		expect(g.points).toEqual([
			{ x: 4, y: 36, value: 1 },
			{ x: 50, y: 4, value: 3 },
			{ x: 96, y: 20, value: 2 },
		])
		expect(JSON.stringify(g)).not.toContain('NaN')
	})

	it('draws nothing but the axis for an empty series, and never a NaN', () => {
		const g = sparkline([], { ...box, reference: 80 })
		expect(g.line).toBe('')
		expect(g.area).toBe('')
		expect(g.last).toBeNull()
		expect(g.latest).toBeNull()
		expect(g.axis).toEqual({ x1: 4, x2: 96, y: 36 })
		expect(g.referenceY).toBe(20)
		expect(JSON.stringify(g)).not.toContain('NaN')
		expect(JSON.stringify(sparkline([], box))).not.toContain('NaN')
	})

	it('draws a single value as a flat line across the width', () => {
		const g = sparkline([82.4], box)
		expect(g.line).toBe('M4.0 20.0 L96.0 20.0')
		expect(g.last).toEqual({ x: 96, y: 20 })
	})

	it('draws a flat series as a flat line', () => {
		const g = sparkline([82.6, 82.6, 82.6], box)
		expect(g.line).toBe('M4.0 20.0 L50.0 20.0 L96.0 20.0')
	})

	it('skips non-finite values and an unusable reference', () => {
		const g = sparkline([1, NaN, 2, Infinity], { ...box, reference: NaN })
		expect(g.values).toEqual([1, 2])
		expect(g.referenceY).toBeNull()
		expect(JSON.stringify(g)).not.toContain('NaN')
	})

	it('keeps the reference inside the scale', () => {
		const g = sparkline([82, 83], { ...box, reference: 80 })
		expect(g.referenceY).toBe(36)
		expect(g.last?.y).toBe(4)
	})
})
