// The map as a seam (D-129): a `MapSurface` draws ground and says where a point falls on it, and never owns a pin.
// Everything pressable is DOM over it, the same pins in the app and in a mock. A `MapSource` is one way of making a
// surface; MapLibre over OpenFreeMap is the first (D-128), and another is a file and a line in the registry.
import type { Destination } from '../../../egress/types.js'
import type { Bounds, LngLat } from '../../../geo/index.js'

export interface MapView {
	center: LngLat
	zoom: number
}

/** The colours the ground is drawn in, each an `rgb()` the map library can read; made from Eden's tokens. */
export interface MapPalette {
	ground: string
	/** Built-up land, a shade off the ground. */
	land: string
	park: string
	water: string
	building: string
	road: string
	roadCasing: string
	/** Paths and rails: quieter than a road. */
	path: string
	boundary: string
	label: string
	/** A town's or a district's name. */
	labelStrong: string
	waterLabel: string
	halo: string
}

export interface MapInsets {
	top: number
	right: number
	bottom: number
	left: number
}

export interface MapSurfaceOptions {
	container: HTMLElement
	view: MapView
	palette: MapPalette
	/** The language labels are drawn in, where the tiles have one. */
	lang: string
	/** The address of the map library's worker, which each app bundles for itself. */
	workerUrl?: string
	/** No animation at all: every move is a jump. */
	still?: boolean
}

export type MapEvent = 'move' | 'moveend' | 'idle' | 'error'

export interface MapSurface {
	/** Resolves once the ground can be drawn on; rejects when the source could not start. */
	readonly ready: Promise<void>
	/** Where a point falls on the surface, in its layout pixels from the top left; null before it is ready. */
	project(point: LngLat): { x: number; y: number } | null
	/** The point under a place on the surface. */
	unproject(at: { x: number; y: number }): LngLat | null
	view(): MapView
	bounds(): Bounds
	setView(view: Partial<MapView>, options?: { animate?: boolean }): void
	/** Shows every point, with the padding kept clear. */
	fit(points: LngLat[], options?: { maxZoom?: number; animate?: boolean }): void
	/** Room kept clear at the edges, for what lies over the map there: the view centres in the rest. */
	setPadding(insets: MapInsets): void
	setPalette(palette: MapPalette): void
	on(event: MapEvent, handler: () => void): () => void
	/** Hears a click on the ground itself, with the point under it. */
	onClick(handler: (point: LngLat) => void): () => void
	destroy(): void
}

export interface MapSource {
	id: string
	name: string
	/** The credit the map must carry, as plain text. */
	attribution: string
	/** Where its requests are counted in the egress ledger. */
	destination: Destination
	/** The name of the secret it needs, when it needs one. */
	secret?: string
	/** Loads the library, only when a map is first shown. */
	load(): Promise<(options: MapSurfaceOptions) => Promise<MapSurface>>
}
