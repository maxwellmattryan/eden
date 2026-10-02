// What the map shows of what Meadow holds: the pins, and how they give way to one another. A pin is a place with a
// point; pins that would stand on top of each other at the map's present scale are drawn as one `group` pin with a
// count, worked out on a grid in screen pixels so it needs no map to test. Home is never grouped, and neither is the
// pin the page is showing.
import type { IconName } from '@eden/ui-kit'
import type { LngLat } from '../../geo/index.js'

export type PinKind = 'saved' | 'suggested' | 'listing' | 'home' | 'group'

export interface Pin {
	id: string
	point: LngLat
	kind: PinKind
	label: string
	/** A saved place's own glyph: its category's. */
	icon?: IconName
	/** How many a group stands for, and whose they are. */
	count?: number
	members?: string[]
}

/** Above this many pins on screen, pins that share a cell of the grid are drawn as one. */
export const DECLUTTER_ABOVE = 60
/** The side of a cell, in pixels: about a pin and a half. */
export const CELL = 48

export type Projection = (point: LngLat) => { x: number; y: number } | null

/**
 * The pins as they are drawn: those off the ground shown are left out, and when more than `DECLUTTER_ABOVE` are on
 * it, pins that share a cell become one group at the middle of its members. A group of saved places only: what the
 * Gardener found, a listing, home and the selected pin always stand alone, since each is there to be seen.
 */
export function drawnPins(
	pins: readonly Pin[],
	project: Projection,
	options: { selected?: string; groupLabel: (count: number) => string; size?: { width: number; height: number } }
): Pin[] {
	const margin = CELL
	const placed = pins.flatMap((pin) => {
		const at = project(pin.point)
		if (!at) return []
		const { size } = options
		if (size && (at.x < -margin || at.y < -margin || at.x > size.width + margin || at.y > size.height + margin))
			return []
		return [{ pin, at }]
	})
	if (placed.length <= DECLUTTER_ABOVE) return placed.map((entry) => entry.pin)

	const alone: Pin[] = []
	const cells = new Map<string, { pin: Pin }[]>()
	for (const entry of placed) {
		if (entry.pin.kind !== 'saved' || entry.pin.id === options.selected) {
			alone.push(entry.pin)
			continue
		}
		const key = `${Math.floor(entry.at.x / CELL)}:${Math.floor(entry.at.y / CELL)}`
		cells.set(key, [...(cells.get(key) ?? []), entry])
	}
	const grouped: Pin[] = []
	for (const [key, members] of cells) {
		if (members.length === 1) {
			grouped.push(members[0]!.pin)
			continue
		}
		const lng = members.reduce((sum, entry) => sum + entry.pin.point.lng, 0) / members.length
		const lat = members.reduce((sum, entry) => sum + entry.pin.point.lat, 0) / members.length
		grouped.push({
			id: `group:${key}`,
			point: { lng, lat },
			kind: 'group',
			label: options.groupLabel(members.length),
			count: members.length,
			members: members.map((entry) => entry.pin.id),
		})
	}
	return [...grouped, ...alone]
}

/** A point on the Web Mercator square, each side from 0 to 1, north at the top. */
function mercator(point: LngLat): { x: number; y: number } {
	const lat = Math.max(-85.0511, Math.min(85.0511, point.lat))
	const sin = Math.sin((lat * Math.PI) / 180)
	return { x: (point.lng + 180) / 360, y: 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI) }
}

/** The side of the world at zoom 0, in pixels, as the map library draws it. */
const WORLD = 512

/**
 * Where points fall on a surface with no map under it: the same Web Mercator the map draws in, around a centre at a
 * zoom. What places the saved pins on plain ground when no tiles could be loaded (offline), so the page still works.
 */
export function flatProjection(
	view: { center: LngLat; zoom: number },
	size: { width: number; height: number },
	inset: { right?: number; bottom?: number } = {}
): Projection {
	const scale = WORLD * 2 ** view.zoom
	const middle = mercator(view.center)
	return (point) => {
		if (!size.width || !size.height) return null
		const at = mercator(point)
		return {
			x: (at.x - middle.x) * scale + (size.width - (inset.right ?? 0)) / 2,
			y: (at.y - middle.y) * scale + (size.height - (inset.bottom ?? 0)) / 2,
		}
	}
}

/** The point under a place on a surface with no map under it: `flatProjection`, read the other way. */
export function flatInverse(
	view: { center: LngLat; zoom: number },
	size: { width: number; height: number },
	inset: { right?: number; bottom?: number } = {}
): (at: { x: number; y: number }) => LngLat {
	const scale = WORLD * 2 ** view.zoom
	const middle = mercator(view.center)
	return ({ x, y }) => {
		const mx = middle.x + (x - (size.width - (inset.right ?? 0)) / 2) / scale
		const my = middle.y + (y - (size.height - (inset.bottom ?? 0)) / 2) / scale
		return {
			lng: mx * 360 - 180,
			lat: (Math.atan(Math.sinh(Math.PI * (1 - 2 * my))) * 180) / Math.PI,
		}
	}
}

/** The zoom at which every point fits a surface around their middle, and that middle; a town's width for one point. */
export function flatFit(
	points: readonly LngLat[],
	size: { width: number; height: number },
	maxZoom = 14
): { center: LngLat; zoom: number } | undefined {
	if (!points.length || !size.width || !size.height) return undefined
	const at = points.map(mercator)
	const [minX, maxX] = [Math.min(...at.map((p) => p.x)), Math.max(...at.map((p) => p.x))]
	const [minY, maxY] = [Math.min(...at.map((p) => p.y)), Math.max(...at.map((p) => p.y))]
	const lngs = points.map((point) => point.lng)
	const lats = points.map((point) => point.lat)
	const center = {
		lng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
		lat: (Math.min(...lats) + Math.max(...lats)) / 2,
	}
	const room = 0.8
	const span = Math.max((maxX - minX) / (size.width * room), (maxY - minY) / (size.height * room))
	const zoom = span > 0 ? Math.log2(1 / (span * WORLD)) : maxZoom
	return { center, zoom: Math.max(1, Math.min(maxZoom, zoom)) }
}
