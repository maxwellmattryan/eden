// The map's style, generated and never fetched (D-128): a MapLibre style over the OpenMapTiles schema, in the
// palette's colours. Ground, land use, parks, water, roads by class, buildings from zoom 15, and labels. There are
// no points of interest and no icons, so no sprite: the places on the map are Meadow's own pins. Label glyphs come
// from the tile host with the tiles; ideographs are drawn from the system's fonts by the library.
import type { MapPalette } from './types.js'

/** The one host a map reaches (D-131): tiles through its TileJSON, and the label glyphs. */
export const TILE_HOST = 'https://tiles.openfreemap.org'
export const TILEJSON = `${TILE_HOST}/planet`
export const GLYPHS = `${TILE_HOST}/fonts/{fontstack}/{range}.pbf`
const SOURCE = 'openmaptiles'
const REGULAR = ['Noto Sans Regular']
const BOLD = ['Noto Sans Bold']
const ITALIC = ['Noto Sans Italic']

type Layer = Record<string, unknown> & { id: string; type: string }
type Expression = unknown[]

/** A width that grows with the zoom, in pixels at each stop. */
const width = (...stops: number[]): Expression => ['interpolate', ['exponential', 1.5], ['zoom'], ...stops]
const oneOf = (property: string, ...values: string[]): Expression => ['match', ['get', property], values, true, false]
const lines: Expression = ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false]
const notTunnel: Expression = ['!=', ['get', 'brunnel'], 'tunnel']

/** A name in the language asked for, else its Latin form, else as the place writes it. */
export function nameIn(lang: string): Expression {
	const base = lang.toLowerCase().split('-')[0] || 'en'
	return ['coalesce', ['get', `name:${base}`], ['get', 'name:latin'], ['get', 'name']]
}

export interface MapStyle {
	version: 8
	name: string
	glyphs: string
	sources: Record<string, { type: 'vector'; url: string }>
	layers: Layer[]
}

export function edenMapStyle(palette: MapPalette, lang = 'en'): MapStyle {
	const name = nameIn(lang)
	const road = (id: string, filter: Expression, casing: Expression, fill: Expression, minzoom: number): Layer[] => [
		{
			id: `${id}-casing`,
			type: 'line',
			source: SOURCE,
			'source-layer': 'transportation',
			minzoom,
			filter: ['all', lines, notTunnel, filter],
			layout: { 'line-cap': 'round', 'line-join': 'round' },
			paint: { 'line-color': palette.roadCasing, 'line-width': casing },
		},
		{
			id,
			type: 'line',
			source: SOURCE,
			'source-layer': 'transportation',
			minzoom,
			filter: ['all', lines, notTunnel, filter],
			layout: { 'line-cap': 'round', 'line-join': 'round' },
			paint: { 'line-color': palette.road, 'line-width': fill },
		},
	]
	const label = (id: string, extra: Record<string, unknown>): Layer => ({
		id,
		type: 'symbol',
		source: SOURCE,
		...extra,
	})
	const text = (size: Expression | number, font: string[], extra: Record<string, unknown> = {}) => ({
		'text-field': name,
		'text-font': font,
		'text-size': size,
		'text-max-width': 8,
		...extra,
	})
	const ink = (color: string) => ({ 'text-color': color, 'text-halo-color': palette.halo, 'text-halo-width': 1.4 })

	const layers: Layer[] = [
		{ id: 'ground', type: 'background', paint: { 'background-color': palette.ground } },
		{
			id: 'land',
			type: 'fill',
			source: SOURCE,
			'source-layer': 'landuse',
			filter: oneOf('class', 'residential', 'commercial', 'industrial', 'retail'),
			paint: { 'fill-color': palette.land, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0, 12, 0.6] },
		},
		{
			id: 'green',
			type: 'fill',
			source: SOURCE,
			'source-layer': 'landcover',
			filter: oneOf('class', 'wood', 'grass'),
			paint: { 'fill-color': palette.park, 'fill-opacity': 0.6 },
		},
		{
			id: 'green-use',
			type: 'fill',
			source: SOURCE,
			'source-layer': 'landuse',
			filter: oneOf('class', 'cemetery', 'pitch', 'playground', 'stadium', 'garden'),
			paint: { 'fill-color': palette.park },
		},
		{ id: 'park', type: 'fill', source: SOURCE, 'source-layer': 'park', paint: { 'fill-color': palette.park } },
		{
			id: 'waterway',
			type: 'line',
			source: SOURCE,
			'source-layer': 'waterway',
			filter: notTunnel,
			layout: { 'line-cap': 'round' },
			paint: { 'line-color': palette.water, 'line-width': width(9, 0.6, 14, 2, 18, 8) },
		},
		{
			id: 'water',
			type: 'fill',
			source: SOURCE,
			'source-layer': 'water',
			filter: notTunnel,
			paint: { 'fill-color': palette.water },
		},
		{
			id: 'building',
			type: 'fill',
			source: SOURCE,
			'source-layer': 'building',
			minzoom: 15,
			paint: { 'fill-color': palette.building, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 15, 0, 16, 1] },
		},
		{
			id: 'path',
			type: 'line',
			source: SOURCE,
			'source-layer': 'transportation',
			minzoom: 14,
			filter: ['all', lines, notTunnel, oneOf('class', 'path', 'track')],
			layout: { 'line-cap': 'round' },
			paint: { 'line-color': palette.path, 'line-width': width(14, 0.6, 18, 2), 'line-dasharray': [2, 2] },
		},
		{
			id: 'rail',
			type: 'line',
			source: SOURCE,
			'source-layer': 'transportation',
			minzoom: 11,
			filter: ['all', lines, notTunnel, oneOf('class', 'rail', 'transit')],
			paint: { 'line-color': palette.path, 'line-width': width(11, 0.5, 18, 2) },
		},
		...road(
			'street',
			oneOf('class', 'minor', 'service', 'street', 'street_limited'),
			width(12, 0.6, 14, 2.4, 18, 14),
			width(12, 0, 14, 1.2, 18, 11),
			12
		),
		...road(
			'avenue',
			oneOf('class', 'secondary', 'tertiary'),
			width(9, 0.6, 13, 3.6, 18, 20),
			width(9, 0, 13, 2.2, 18, 16),
			9
		),
		...road(
			'highway',
			oneOf('class', 'motorway', 'trunk', 'primary'),
			width(6, 0.8, 12, 4.4, 18, 26),
			width(6, 0.3, 12, 3, 18, 22),
			6
		),
		{
			id: 'boundary',
			type: 'line',
			source: SOURCE,
			'source-layer': 'boundary',
			filter: ['all', ['<=', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1]],
			paint: { 'line-color': palette.boundary, 'line-width': width(3, 0.5, 10, 1.4), 'line-dasharray': [3, 2] },
		},
		label('water-name', {
			'source-layer': 'water_name',
			minzoom: 9,
			layout: text(['interpolate', ['linear'], ['zoom'], 9, 11, 16, 14], ITALIC, { 'symbol-placement': 'point' }),
			paint: ink(palette.waterLabel),
		}),
		label('road-name', {
			'source-layer': 'transportation_name',
			minzoom: 13,
			filter: oneOf('class', 'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'street'),
			layout: text(['interpolate', ['linear'], ['zoom'], 13, 10, 18, 13], REGULAR, {
				'symbol-placement': 'line',
				'text-letter-spacing': 0.04,
			}),
			paint: ink(palette.label),
		}),
		label('park-name', {
			'source-layer': 'poi',
			minzoom: 13,
			filter: ['all', oneOf('class', 'park'), ['<=', ['get', 'rank'], 12]],
			layout: text(11, ITALIC),
			paint: ink(palette.label),
		}),
		label('district-name', {
			'source-layer': 'place',
			minzoom: 10,
			filter: oneOf('class', 'suburb', 'neighbourhood', 'quarter', 'village', 'hamlet'),
			layout: text(['interpolate', ['linear'], ['zoom'], 10, 10, 16, 14], REGULAR, { 'text-letter-spacing': 0.06 }),
			paint: ink(palette.label),
		}),
		label('town-name', {
			'source-layer': 'place',
			filter: oneOf('class', 'city', 'town'),
			layout: text(['interpolate', ['linear'], ['zoom'], 4, 11, 12, 18], BOLD),
			paint: ink(palette.labelStrong),
		}),
		label('region-name', {
			'source-layer': 'place',
			maxzoom: 7,
			filter: oneOf('class', 'country', 'state'),
			layout: text(['interpolate', ['linear'], ['zoom'], 2, 10, 6, 14], BOLD, {
				'text-transform': 'uppercase',
				'text-letter-spacing': 0.1,
			}),
			paint: ink(palette.label),
		}),
	]
	return { version: 8, name: 'Eden', glyphs: GLYPHS, sources: { [SOURCE]: { type: 'vector', url: TILEJSON } }, layers }
}
