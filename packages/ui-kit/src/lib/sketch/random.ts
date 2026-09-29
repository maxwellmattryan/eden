/** A seeded stream of numbers: the same seed gives the same sketch, so a render can be named and made again. */
export interface Random {
	/** The next number, from 0 up to but not including 1. */
	next(): number
	/** A number from `min` up to but not including `max`. */
	range(min: number, max: number): number
	/** A whole number from 0 up to but not including `max`. */
	int(max: number): number
}

/** Mulberry32: small, fast and even enough for drawing. The kit never calls `Math.random`. */
export function createRandom(seed: number): Random {
	let state = seed >>> 0
	const next = () => {
		state = (state + 0x6d2b79f5) >>> 0
		let t = state
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
	return {
		next,
		range: (min, max) => min + next() * (max - min),
		int: (max) => Math.floor(next() * max),
	}
}
