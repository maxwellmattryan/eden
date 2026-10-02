// The map seam for both apps (D-129). The library itself is behind `mapSource().load()`, so importing this costs
// nothing until a map is shown.
export { mapPalette, mix, PALETTE_TOKENS, readMapPalette, type PaletteToken } from './palette.js'
export { MAP_SOURCES, mapSource, OPENFREEMAP } from './registry.js'
export { edenMapStyle, GLYPHS, nameIn, TILE_HOST, TILEJSON, type MapStyle } from './style.js'
export type { MapEvent, MapInsets, MapPalette, MapSource, MapSurface, MapSurfaceOptions, MapView } from './types.js'
