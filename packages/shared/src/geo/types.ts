// What finds a place by its name (D-128): a geocoder is a seam, so another source can replace or join the first.
import type { Destination } from '../egress/types.js'
import type { Bounds, LngLat } from './coordinates.js'

export interface GeocodeQuery {
	/** The name as the owner or a search wrote it. */
	text: string
	/** Where to look first; sent rounded (D-60). */
	near?: LngLat
	/** Only what lies inside. */
	within?: Bounds
	lang?: string
	limit?: number
}

/** One answer: a named thing at a point, with what its source says of it. */
export interface GeocodeHit {
	name: string
	point: LngLat
	/** The source's own id for it, stable across requests: `osm:N123`. */
	source: string
	externalId: string
	/** What kind of thing the source says it is: `amenity:cafe`. */
	kind?: string
	/** A public address line, and the town. */
	addressLine?: string
	locality?: string
	region?: string
	country?: string
}

export interface Geocoder {
	id: string
	name: string
	destination: Destination
	/** Rejects with `OfflineError` when the source cannot answer; answers nothing found as an empty list. */
	search(query: GeocodeQuery): Promise<GeocodeHit[]>
}
