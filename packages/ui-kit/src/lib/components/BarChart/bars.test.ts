import { describe, expect, it } from 'vitest'
import { bars, MAX_SERIES } from './bars.js'

const box = { width: 400, height: 160, left: 40, bottom: 22 }

describe('bars', () => {
	it('stacks each bucket from the floor, and the stack is as tall as its total', () => {
		const geo = bars(
			[
				[1, 2, 0],
				[3, 0, 0],
			],
			{ ...box, labels: ['a', 'b', 'c'] }
		)
		const floor = geo.plot.y + geo.plot.height
		expect(geo.bars.map((bar) => bar.total)).toEqual([4, 2, 0])
		const [first, second, third] = geo.bars
		expect(first!.segments.map((segment) => segment.series)).toEqual([0, 1])
		// the first series stands on the floor, the second on the first
		expect(first!.segments[0]!.y + first!.segments[0]!.height).toBeCloseTo(floor)
		expect(first!.segments[1]!.y + first!.segments[1]!.height).toBeCloseTo(first!.segments[0]!.y)
		const tall = first!.segments.reduce((sum, segment) => sum + segment.height, 0)
		expect(tall).toBeCloseTo(floor - first!.segments[1]!.y)
		// a series with nothing in a bucket draws nothing there
		expect(second!.segments).toHaveLength(1)
		expect(third!.segments).toEqual([])
	})

	it('scales from nothing to a round figure at or above the tallest bar', () => {
		const geo = bars([[0.4, 2.6, 1]], box)
		expect(geo.ticks[0]!.value).toBe(0)
		expect(geo.ticks[0]!.y).toBeCloseTo(geo.plot.y + geo.plot.height)
		const top = geo.ticks.at(-1)!
		expect(top.value).toBeGreaterThanOrEqual(2.6)
		expect(top.y).toBeCloseTo(geo.plot.y)
		expect(geo.ticks.every((tick) => tick.value >= 0)).toBe(true)
	})

	it('keeps its floor when there is nothing to draw', () => {
		expect(bars([], box)).toMatchObject({ bars: [], ticks: [{ value: 0 }] })
		const empty = bars([[0, 0]], { ...box, labels: ['a', 'b'] })
		expect(empty.bars.every((bar) => bar.segments.length === 0)).toBe(true)
		expect(empty.ticks).toHaveLength(1)
		// a value that is no amount is nothing
		expect(bars([[Number.NaN, -3, 2]], box).bars.map((bar) => bar.total)).toEqual([0, 0, 2])
	})

	it('draws three series at most, and a bar no wider than its band allows', () => {
		const geo = bars([[1], [1], [1], [1]], box)
		expect(geo.bars[0]!.segments).toHaveLength(MAX_SERIES)
		expect(geo.bars[0]!.total).toBe(3)
		expect(geo.bars[0]!.width).toBe(28)
		const many = bars([Array.from({ length: 90 }, () => 1)], box)
		const band = many.plot.width / 90
		expect(many.bars[0]!.width).toBeLessThan(band)
		expect(many.bars.at(-1)!.x + many.bars.at(-1)!.width).toBeLessThanOrEqual(many.plot.x + many.plot.width)
	})

	it('writes the labels that have room and never two that touch', () => {
		const labels = Array.from({ length: 30 }, (_, i) => `09-${String(i + 1).padStart(2, '0')}`)
		const geo = bars([labels.map(() => 1)], { ...box, labels })
		const written = geo.bars.filter((bar) => bar.labelAt !== null)
		expect(written.length).toBeGreaterThan(1)
		expect(written.length).toBeLessThan(30)
		for (let i = 1; i < written.length; i += 1) {
			expect(written[i]!.labelAt!).toBeGreaterThanOrEqual(written[i - 1]!.labelAt! + 5 * 8)
		}
	})
})
