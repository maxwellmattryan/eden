// The map as this app makes it (D-129): the source from the shared registry, with what only an app can give it. The
// library's worker is bundled by this app's build and named by its URL, since under the app's own scheme the
// library cannot work the address out for itself, and a worker from the app's origin is what the CSP allows
// (`worker-src 'self'`). The library's stylesheet lays its canvas out; its controls are all off.
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { mapSource, type MapSurface, type MapSurfaceOptions } from '@eden/shared/domains/places'

export const source = mapSource()

/** Makes the map's surface in a container. Rejects when the library cannot start; the page then draws plain ground. */
export async function createSurface(options: Omit<MapSurfaceOptions, 'workerUrl'>): Promise<MapSurface> {
	const make = await source.load()
	return make({ ...options, workerUrl })
}
