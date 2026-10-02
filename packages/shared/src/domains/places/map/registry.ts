// The map sources (D-128): the ways Eden can draw a map's ground. OpenFreeMap through MapLibre is the first and
// needs no key. Another source (a keyed one, OQ-24) is a file beside `maplibre.ts`, an entry here, its hosts in the
// CSP and its destination in the ledger; no view and no store changes.
import type { MapSource } from './types.js'

export const OPENFREEMAP: MapSource = {
	id: 'openfreemap',
	name: 'OpenFreeMap',
	attribution: '© OpenStreetMap contributors · OpenMapTiles · OpenFreeMap',
	destination: 'openfreemap',
	load: async () => (await import('./maplibre.js')).createMaplibreSurface,
}

export const MAP_SOURCES: readonly MapSource[] = [OPENFREEMAP]

/** The source of an id, or the first when the id names none. */
export function mapSource(id?: string): MapSource {
	return MAP_SOURCES.find((source) => source.id === id) ?? OPENFREEMAP
}
