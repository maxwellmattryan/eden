import type { Random } from './random.js'

/** Smooth noise over three axes, from -1 to 1: two for the plane and one to move through, usually time. */
export type Noise = (x: number, y: number, z?: number) => number

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

function grad(hash: number, x: number, y: number, z: number): number {
	const h = hash & 15
	const u = h < 8 ? x : y
	const v = h < 4 ? y : h === 12 || h === 14 ? x : z
	return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v)
}

/** Perlin's improved noise over a table shuffled by `random`, so a seed fixes the field. */
export function createNoise(random: Random): Noise {
	const table = Uint8Array.from({ length: 256 }, (_, i) => i)
	for (let i = 255; i > 0; i--) {
		const j = random.int(i + 1)
		const held = table[i]!
		table[i] = table[j]!
		table[j] = held
	}
	const p = new Uint8Array(512)
	for (let i = 0; i < 512; i++) p[i] = table[i & 255]!

	return (x, y, z = 0) => {
		const fx = Math.floor(x)
		const fy = Math.floor(y)
		const fz = Math.floor(z)
		const X = fx & 255
		const Y = fy & 255
		const Z = fz & 255
		x -= fx
		y -= fy
		z -= fz
		const u = fade(x)
		const v = fade(y)
		const w = fade(z)
		const a = p[X]! + Y
		const aa = p[a]! + Z
		const ab = p[a + 1]! + Z
		const b = p[X + 1]! + Y
		const ba = p[b]! + Z
		const bb = p[b + 1]! + Z
		return lerp(
			lerp(
				lerp(grad(p[aa]!, x, y, z), grad(p[ba]!, x - 1, y, z), u),
				lerp(grad(p[ab]!, x, y - 1, z), grad(p[bb]!, x - 1, y - 1, z), u),
				v
			),
			lerp(
				lerp(grad(p[aa + 1]!, x, y, z - 1), grad(p[ba + 1]!, x - 1, y, z - 1), u),
				lerp(grad(p[ab + 1]!, x, y - 1, z - 1), grad(p[bb + 1]!, x - 1, y - 1, z - 1), u),
				v
			),
			w
		)
	}
}
