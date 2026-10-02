import { describe, expect, it } from 'vitest'
import { mapPalette, mix } from './palette.js'
import { edenMapStyle, GLYPHS, nameIn, TILE_HOST, TILEJSON } from './style.js'

const tokens = {
	'surface-0': 'rgb(250, 248, 240)',
	'surface-1': '#f0ede2',
	'surface-2': 'rgb(228, 224, 210)',
	stroke: 'rgb(200, 196, 180)',
	'stroke-hover': 'rgb(170, 166, 150)',
	'text-primary': 'rgb(30, 34, 28)',
	'text-secondary': 'rgb(90, 96, 86)',
	'text-tertiary': 'rgb(140, 146, 136)',
	success: 'rgb(60, 120, 70)',
	info: 'rgb(50, 110, 160)',
}

/** Every string in a style that is a colour. */
function colours(value: unknown, found = new Set<string>()): Set<string> {
	if (typeof value === 'string') {
		if (/^(rgb|hsl|#)/.test(value)) found.add(value)
	} else if (Array.isArray(value)) value.forEach((entry) => colours(entry, found))
	else if (value && typeof value === 'object') Object.values(value).forEach((entry) => colours(entry, found))
	return found
}

describe('mapPalette', () => {
	it('mixes as color-mix in srgb does, and writes every colour as rgb()', () => {
		expect(mix('rgb(0, 0, 0)', 'rgb(200, 100, 50)', 0.5)).toBe('rgb(100, 50, 25)')
		expect(mix('#ffffff', '#000000', 0.25)).toBe('rgb(64, 64, 64)')
		const palette = mapPalette(tokens)
		expect(palette.ground).toBe('rgb(240, 237, 226)')
		expect(palette.road).toBe('rgb(250, 248, 240)')
		for (const colour of Object.values(palette)) expect(colour).toMatch(/^rgb\(\d+, \d+, \d+\)$/)
		// the park leans to green and the water to blue, each still close to the ground
		expect(palette.park).toBe(mix(tokens.success, palette.ground, 0.16))
		expect(palette.water).not.toBe(palette.park)
	})
})

describe('edenMapStyle', () => {
	const palette = mapPalette(tokens)
	const style = edenMapStyle(palette, 'ja')

	it('draws every colour from the palette and nothing else', () => {
		const used = colours(style.layers)
		expect(used.size).toBeGreaterThan(8)
		const known = new Set(Object.values(palette))
		for (const colour of used) expect(known.has(colour), colour).toBe(true)
	})

	it('reaches one host only, for the tiles and for the glyphs, and names no sprite', () => {
		expect(TILEJSON.startsWith(TILE_HOST) && GLYPHS.startsWith(TILE_HOST)).toBe(true)
		expect(style.sources).toEqual({ openmaptiles: { type: 'vector', url: TILEJSON } })
		expect(style.glyphs).toBe(GLYPHS)
		expect(style).not.toHaveProperty('sprite')
		const text = JSON.stringify(style)
		expect(text.match(/https:\/\/[a-z0-9.-]+/g)!.every((host) => host === TILE_HOST)).toBe(true)
		// no icons: the places on the map are Meadow's own pins
		expect(text).not.toContain('icon-image')
	})

	it('holds each layer id once, the ground first and the names last', () => {
		const ids = style.layers.map((layer) => layer.id)
		expect(new Set(ids).size).toBe(ids.length)
		expect(ids[0]).toBe('ground')
		expect(style.layers.findIndex((layer) => layer.type === 'symbol')).toBeGreaterThan(ids.indexOf('highway'))
		expect(style.layers.find((layer) => layer.id === 'building')).toMatchObject({ minzoom: 15 })
	})

	it('names things in the language asked for, falling back to how the place writes itself', () => {
		expect(nameIn('ja')).toEqual(['coalesce', ['get', 'name:ja'], ['get', 'name:latin'], ['get', 'name']])
		expect(nameIn('en-GB')[1]).toEqual(['get', 'name:en'])
		const town = style.layers.find((layer) => layer.id === 'town-name') as unknown as {
			layout: Record<string, unknown>
		}
		expect(town.layout['text-field']).toEqual(nameIn('ja'))
	})

	it('follows the palette it is given', () => {
		const dark = edenMapStyle({ ...palette, ground: 'rgb(20, 24, 20)' })
		expect(dark.layers[0]).toMatchObject({ paint: { 'background-color': 'rgb(20, 24, 20)' } })
	})
})
