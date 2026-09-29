import { describe, expect, it } from 'vitest'
import { createIdGenerator, isUlid, newId } from './ulid.js'

const zeros = (bytes: Uint8Array) => bytes.fill(0)
const lasts = (bytes: Uint8Array) => bytes.fill(31)

describe('ulid', () => {
	it('makes canonical ULIDs that only grow', () => {
		const ids = Array.from({ length: 500 }, () => newId())
		expect(ids.every(isUlid)).toBe(true)
		expect([...ids].sort()).toEqual(ids)
		expect(new Set(ids).size).toBe(ids.length)
	})

	it('writes the time first, so ids sort by when they were made', () => {
		const next = createIdGenerator(zeros)
		expect(next(0)).toBe('00000000000000000000000000')
		// 1 790 000 000 000 in Crockford base 32, worked out apart from this code
		const earlier = next(1_790_000_000_000)
		expect(earlier).toBe('01M3250V00' + '0000000000000000')
		expect(next(1_790_000_000_001) > earlier).toBe(true)
	})

	it('counts up within one millisecond, and when the clock goes backwards', () => {
		const next = createIdGenerator(zeros)
		const first = next(5000)
		const second = next(5000)
		const third = next(4000)
		expect(second).toBe(first.slice(0, 25) + '1')
		expect(third).toBe(first.slice(0, 25) + '2')
	})

	it('moves to the next millisecond when the random part is spent', () => {
		const next = createIdGenerator(lasts)
		const first = next(5000)
		const second = next(5000)
		expect(first.slice(10)).toBe('ZZZZZZZZZZZZZZZZ')
		expect(second > first).toBe(true)
		expect(isUlid(second)).toBe(true)
	})

	it('knows an id from what is not one', () => {
		expect(isUlid('01J9ZQ4M3T8R5V2X7Y6W1B0CDE')).toBe(true)
		expect(isUlid('00000000000000000000000001')).toBe(true)
		for (const bad of [
			'',
			'st-01',
			'01j9zq4m3t8r5v2x7y6w1b0cde',
			'01J9ZQ4M3T8R5V2X7Y6W1B0CD',
			'9f1c2a34-5b6d-4e7f-8a9b-0c1d2e3f4a5b',
			'81J9ZQ4M3T8R5V2X7Y6W1B0CDE',
			'01J9ZQ4M3T8R5V2X7Y6W1B0CDU',
		]) {
			expect(isUlid(bad), bad).toBe(false)
		}
	})
})
