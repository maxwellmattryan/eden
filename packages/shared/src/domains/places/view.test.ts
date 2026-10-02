import { describe, expect, it } from 'vitest'
import { CELL, DECLUTTER_ABOVE, drawnPins, flatFit, flatInverse, flatProjection, type Pin } from './view.js'

/** A flat ground: a degree is a thousand pixels, from the top left. */
const project = (point: { lng: number; lat: number }) => ({ x: point.lng * 1000, y: point.lat * 1000 })
const groupLabel = (count: number) => `${count} places`
const pin = (id: string, x: number, y: number, kind: Pin['kind'] = 'saved'): Pin => ({
	id,
	kind,
	label: id,
	point: { lng: x / 1000, lat: y / 1000 },
})

describe('drawnPins', () => {
	it('draws every pin while they are few, and leaves out what is off the ground shown', () => {
		const pins = [pin('a', 10, 10), pin('b', 12, 12), pin('far', 5000, 10)]
		expect(drawnPins(pins, project, { groupLabel, size: { width: 800, height: 600 } }).map((p) => p.id)).toEqual([
			'a',
			'b',
		])
		expect(drawnPins(pins, () => null, { groupLabel })).toEqual([])
	})

	it('draws the saved places of one cell as a group once they are many', () => {
		const crowd = Array.from({ length: DECLUTTER_ABOVE + 1 }, (_, i) => pin(`c${i}`, 4 + (i % 5), 4 + (i % 7)))
		const pins = [
			...crowd,
			pin('alone', CELL * 5 + 3, CELL * 5 + 3),
			pin('home', 6, 6, 'home'),
			pin('found', 7, 7, 'suggested'),
		]
		const drawn = drawnPins(pins, project, { groupLabel, selected: 'c3' })
		const group = drawn.find((p) => p.kind === 'group')!
		expect(group).toMatchObject({ label: `${DECLUTTER_ABOVE} places`, count: DECLUTTER_ABOVE })
		expect(group.members).not.toContain('c3')
		// the selected pin, home, what the Gardener found and a place on its own all stand alone
		expect(drawn.map((p) => p.id).sort()).toEqual(['alone', 'c3', 'found', group.id, 'home'].sort())
		// the group stands at the middle of its members
		expect(project(group.point).x).toBeGreaterThan(4)
		expect(project(group.point).x).toBeLessThan(9)
	})
})

describe('flatProjection', () => {
	const size = { width: 800, height: 600 }
	const zilker = { lng: -97.7669, lat: 30.2677 }

	it('puts the centre in the middle, east to the right and north up', () => {
		const at = flatProjection({ center: zilker, zoom: 12 }, size)
		expect(at(zilker)).toEqual({ x: 400, y: 300 })
		expect(at({ lng: zilker.lng + 0.01, lat: zilker.lat })!.x).toBeGreaterThan(400)
		expect(at({ lng: zilker.lng, lat: zilker.lat + 0.01 })!.y).toBeLessThan(300)
		// a zoom level doubles every distance from the middle
		const near = flatProjection({ center: zilker, zoom: 12 }, size)({ lng: -97.75, lat: 30.26 })!
		const far = flatProjection({ center: zilker, zoom: 13 }, size)({ lng: -97.75, lat: 30.26 })!
		expect(far.x - 400).toBeCloseTo((near.x - 400) * 2, 6)
		expect(far.y - 300).toBeCloseTo((near.y - 300) * 2, 6)
	})

	it('centres in the room an inset leaves, and answers nothing for a surface with no size', () => {
		expect(flatProjection({ center: zilker, zoom: 12 }, size, { right: 300 })(zilker)).toEqual({ x: 250, y: 300 })
		expect(flatProjection({ center: zilker, zoom: 12 }, { width: 0, height: 0 })(zilker)).toBeNull()
	})

	it('reads a place on the surface back as the point under it', () => {
		const view = { center: zilker, zoom: 13 }
		const cosmic = { lng: -97.7626, lat: 30.2269 }
		const at = flatProjection(view, size, { right: 300 })(cosmic)!
		const back = flatInverse(view, size, { right: 300 })(at)
		expect(back.lng).toBeCloseTo(cosmic.lng, 9)
		expect(back.lat).toBeCloseTo(cosmic.lat, 9)
	})

	it('fits every point on the surface', () => {
		const points = [zilker, { lng: -97.7626, lat: 30.2269 }, { lng: -97.7281, lat: 30.2686 }]
		const view = flatFit(points, size)!
		const at = flatProjection(view, size)
		for (const point of points) {
			const { x, y } = at(point)!
			expect(x).toBeGreaterThan(0)
			expect(x).toBeLessThan(800)
			expect(y).toBeGreaterThan(0)
			expect(y).toBeLessThan(600)
		}
		expect(flatFit([zilker], size)).toEqual({ center: zilker, zoom: 14 })
		expect(flatFit([], size)).toBeUndefined()
	})
})
