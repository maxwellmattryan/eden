import { describe, expect, it } from 'vitest'
import { formatStamp, MIN_STAMP, parseStamp, receive, stampToDate, tick, type Hlc } from './hlc.js'

const hlc = (wallMs: number, counter: number, node: number): Hlc => ({ wallMs, counter, node })

// The same vectors as `src-tauri/src/substrate/hlc.rs`: the two implementations must agree.
describe('hlc', () => {
	it('formats and parses a stamp', () => {
		const stamp = formatStamp(hlc(1_790_000_000_000, 3, 0xab))
		expect(stamp).toBe('000001a0c4506c00-00000003-000000ab')
		expect(parseStamp(stamp)).toEqual(hlc(1_790_000_000_000, 3, 0xab))
		expect(formatStamp(hlc(0, 0, 0))).toBe(MIN_STAMP)
		for (const bad of ['', '1-2-3', '000001a0c4506c00-00000003', 'zzzzzzzzzzzzzzzz-00000003-000000ab']) {
			expect(parseStamp(bad), bad).toBeNull()
		}
	})

	it('orders stamps as text the way it orders clocks', () => {
		const stamps = [hlc(1000, 0, 9), hlc(1000, 1, 1), hlc(1001, 0, 1), hlc(2 ** 40, 0, 1)].map(formatStamp)
		expect([...stamps].sort()).toEqual(stamps)
		expect(stamps.every((stamp) => MIN_STAMP < stamp)).toBe(true)
	})

	it('follows the wall clock and counts when it stalls', () => {
		let clock = tick(hlc(0, 0, 1), 1000)
		expect(clock).toEqual(hlc(1000, 0, 1))
		clock = tick(clock, 1000)
		expect(clock).toEqual(hlc(1000, 1, 1))
		clock = tick(clock, 900)
		expect(clock).toEqual(hlc(1000, 2, 1))
		clock = tick(clock, 2000)
		expect(clock).toEqual(hlc(2000, 0, 1))
	})

	it('ends later than what it receives, in every case', () => {
		// the same wall on both sides, the wall clock behind
		expect(receive(hlc(1000, 5, 1), hlc(1000, 9, 2), 900)).toEqual(hlc(1000, 10, 1))
		// the local clock ahead
		expect(receive(hlc(2000, 5, 1), hlc(1000, 9, 2), 900)).toEqual(hlc(2000, 6, 1))
		// the remote clock ahead
		expect(receive(hlc(1000, 5, 1), hlc(3000, 9, 2), 900)).toEqual(hlc(3000, 10, 1))
		// the wall clock ahead of both
		expect(receive(hlc(1000, 5, 1), hlc(3000, 9, 2), 4000)).toEqual(hlc(4000, 0, 1))
	})

	it('reads the time out of a stamp', () => {
		expect(stampToDate('000001a0c4506c00-00000003-000000ab')?.getTime()).toBe(1_790_000_000_000)
		expect(stampToDate(MIN_STAMP)?.getTime()).toBe(0)
		expect(stampToDate('yesterday')).toBeNull()
	})
})
