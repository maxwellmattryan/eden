// The map as the phone makes it (D-129): the source from the shared registry, with the library's worker bundled by
// this app's build and named by its URL, as the desktop does.
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { mapSource, type MapSurface, type MapSurfaceOptions } from '@eden/shared/domains/places'

export const source = mapSource()

/** Makes the map's surface in a container. Rejects when the library cannot start; the page then draws plain ground. */
export async function createSurface(options: Omit<MapSurfaceOptions, 'workerUrl'>): Promise<MapSurface> {
	const make = await source.load()
	return make({ ...options, workerUrl })
}
