// The map's colours from Eden's tokens (D-128): the ground follows the theme and the accent like any component.
// `mapPalette` is pure, from tokens already resolved to `rgb()`; `readMapPalette` resolves them where an element
// stands, by painting each on one pixel, since a token may be a `color-mix()` the map library cannot read.
import type { MapPalette } from './types.js'

/** The tokens the palette is made from. */
export const PALETTE_TOKENS = [
	'surface-0',
	'surface-1',
	'surface-2',
	'stroke',
	'stroke-hover',
	'text-primary',
	'text-secondary',
	'text-tertiary',
	'success',
	'info',
] as const
export type PaletteToken = (typeof PALETTE_TOKENS)[number]

type Rgb = [number, number, number]

function parse(color: string): Rgb {
	const match = /^rgba?\(\s*(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)/.exec(color.trim())
	if (match) return [Number(match[1]), Number(match[2]), Number(match[3])]
	const hex = /^#([0-9a-f]{6})$/i.exec(color.trim())?.[1]
	if (hex) return [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16)) as Rgb
	return [128, 128, 128]
}

const write = ([r, g, b]: Rgb) => `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`

/** `share` of `a` over `b`, as `color-mix(in srgb, a share, b)` would give. */
export function mix(a: string, b: string, share: number): string {
	const [from, to] = [parse(a), parse(b)]
	return write(from.map((channel, i) => channel * share + to[i]! * (1 - share)) as Rgb)
}

/** The palette from the tokens, each already an `rgb()` or a hex colour. */
export function mapPalette(tokens: Readonly<Record<PaletteToken, string>>): MapPalette {
	const ground = write(parse(tokens['surface-1']))
	return {
		ground,
		land: mix(tokens['surface-2'], ground, 0.5),
		park: mix(tokens.success, ground, 0.16),
		water: mix(tokens.info, ground, 0.26),
		building: mix(tokens['text-primary'], ground, 0.07),
		road: write(parse(tokens['surface-0'])),
		roadCasing: write(parse(tokens.stroke)),
		path: write(parse(tokens['stroke-hover'])),
		boundary: write(parse(tokens['text-tertiary'])),
		label: write(parse(tokens['text-secondary'])),
		labelStrong: write(parse(tokens['text-primary'])),
		waterLabel: mix(tokens.info, tokens['text-secondary'], 0.55),
		halo: ground,
	}
}

/** The palette where an element stands: its theme and its accent. */
export function readMapPalette(el: HTMLElement): MapPalette {
	const style = getComputedStyle(el)
	const canvas = new OffscreenCanvas(1, 1)
	const context = canvas.getContext('2d', { willReadFrequently: true })
	const resolve = (token: PaletteToken): string => {
		const value = style.getPropertyValue(`--${token}`).trim()
		if (!context || !value) return 'rgb(128, 128, 128)'
		context.clearRect(0, 0, 1, 1)
		context.fillStyle = '#808080'
		context.fillStyle = value
		context.fillRect(0, 0, 1, 1)
		const [r, g, b] = context.getImageData(0, 0, 1, 1).data
		return `rgb(${r}, ${g}, ${b})`
	}
	return mapPalette(
		Object.fromEntries(PALETTE_TOKENS.map((token) => [token, resolve(token)])) as Record<PaletteToken, string>
	)
}
