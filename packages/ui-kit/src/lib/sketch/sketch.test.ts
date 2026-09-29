import { describe, expect, it } from 'vitest'
import { createNoise } from './noise.js'
import { createRandom } from './random.js'

describe('createRandom', () => {
	it('gives the same stream for the same seed', () => {
		const a = createRandom(7)
		const b = createRandom(7)
		expect(Array.from({ length: 8 }, a.next)).toEqual(Array.from({ length: 8 }, b.next))
	})
	it('gives another stream for another seed', () => {
		expect(createRandom(1).next()).not.toBe(createRandom(2).next())
	})
	it('stays inside its bounds', () => {
		const random = createRandom(42)
		for (let i = 0; i < 1000; i++) {
			const value = random.next()
			expect(value).toBeGreaterThanOrEqual(0)
			expect(value).toBeLessThan(1)
			const ranged = random.range(-3, 5)
			expect(ranged).toBeGreaterThanOrEqual(-3)
			expect(ranged).toBeLessThan(5)
			const whole = random.int(6)
			expect(Number.isInteger(whole)).toBe(true)
			expect(whole).toBeGreaterThanOrEqual(0)
			expect(whole).toBeLessThan(6)
		}
	})
})

describe('createNoise', () => {
	it('is fixed by the seed', () => {
		const a = createNoise(createRandom(3))
		const b = createNoise(createRandom(3))
		const c = createNoise(createRandom(4))
		expect(a(1.3, 2.7, 0.4)).toBe(b(1.3, 2.7, 0.4))
		expect(a(1.3, 2.7, 0.4)).not.toBe(c(1.3, 2.7, 0.4))
	})
	it('stays between -1 and 1 and is smooth', () => {
		const noise = createNoise(createRandom(9))
		for (let i = 0; i < 500; i++) {
			const x = i * 0.137
			const value = noise(x, x * 0.61, x * 0.29)
			expect(Math.abs(value)).toBeLessThanOrEqual(1)
			expect(Math.abs(noise(x + 0.001, x * 0.61, x * 0.29) - value)).toBeLessThan(0.01)
		}
	})
	it('is zero on the lattice', () => {
		expect(createNoise(createRandom(5))(2, 3, 4)).toBe(0)
	})
})
