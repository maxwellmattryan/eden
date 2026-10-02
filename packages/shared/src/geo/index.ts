// Coordinates and geocoding for the substrate (D-128, D-131): Sky rounds what it sends through here and Meadow finds
// places through it. A domain never imports another's code, so what two of them need of the ground lives here.
export {
	boundsAround,
	boundsOf,
	haversineKm,
	isLngLat,
	rounded,
	roundedPoint,
	withinBounds,
	type Bounds,
	type LngLat,
} from './coordinates.js'
export { createPhoton, photon, photonHit, photonUrl } from './photon.js'
export { throttle, type ThrottleClock } from './throttle.js'
export type { GeocodeHit, GeocodeQuery, Geocoder } from './types.js'
