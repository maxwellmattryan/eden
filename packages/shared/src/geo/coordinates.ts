// Coordinates as the substrate handles them: a point, the distance between two, a box around one, and the rule
// for what leaves the device. Sky and Meadow share this; nothing here reaches out to anything.

/** A place on the ground, in degrees. */
export interface LngLat {
	lng: number
	lat: number
}

/** A box on the ground, in degrees. */
export interface Bounds {
	west: number
	south: number
	east: number
	north: number
}

/** A coordinate as it is sent: two decimals, about one kilometre (D-60), for every provider. */
export function rounded(value: number): string {
	return (Math.round(value * 100) / 100).toFixed(2)
}

/** A point as it is sent: each coordinate rounded to two decimals (D-60). */
export function roundedPoint(point: LngLat): LngLat {
	return { lng: Number(rounded(point.lng)), lat: Number(rounded(point.lat)) }
}

const EARTH_KM = 6371.0088
const radians = (degrees: number) => (degrees * Math.PI) / 180

/** The distance between two points over the ground, in kilometres. */
export function haversineKm(a: LngLat, b: LngLat): number {
	const dLat = radians(b.lat - a.lat)
	const dLng = radians(b.lng - a.lng)
	const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2
	return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** The box that reaches `km` from a point in each direction; its sides narrow towards the poles as the ground does. */
export function boundsAround(center: LngLat, km: number): Bounds {
	const dLat = (km / EARTH_KM) * (180 / Math.PI)
	const dLng = dLat / Math.max(0.01, Math.cos(radians(center.lat)))
	return {
		west: Math.max(-180, center.lng - dLng),
		south: Math.max(-90, center.lat - dLat),
		east: Math.min(180, center.lng + dLng),
		north: Math.min(90, center.lat + dLat),
	}
}

export function withinBounds(point: LngLat, bounds: Bounds): boolean {
	return point.lng >= bounds.west && point.lng <= bounds.east && point.lat >= bounds.south && point.lat <= bounds.north
}

/** The box that holds every point; nothing for no points. */
export function boundsOf(points: readonly LngLat[]): Bounds | undefined {
	if (!points.length) return undefined
	return {
		west: Math.min(...points.map((point) => point.lng)),
		south: Math.min(...points.map((point) => point.lat)),
		east: Math.max(...points.map((point) => point.lng)),
		north: Math.max(...points.map((point) => point.lat)),
	}
}

/** Whether a value is a point on the ground. */
export function isLngLat(value: unknown): value is LngLat {
	if (!value || typeof value !== 'object') return false
	const { lng, lat } = value as Record<string, unknown>
	return (
		typeof lng === 'number' &&
		typeof lat === 'number' &&
		Math.abs(lng) <= 180 &&
		Math.abs(lat) <= 90 &&
		!(lng === 0 && lat === 0)
	)
}
