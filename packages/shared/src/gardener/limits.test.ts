import { describe, expect, it } from 'vitest'
import { LIMITS_KEY, readLimits, recordLimits, usageGate, windowState, type Limits } from './limits.js'
import type { GardenerEvent } from './runtime-types.js'

function memory() {
	const items = new Map<string, string>()
	return {
		items,
		getItem: (key: string) => items.get(key) ?? null,
		setItem: (key: string, value: string) => void items.set(key, value),
	}
}

const HOUR = 3_600_000
const NOW = Date.UTC(2026, 9, 31, 12, 0)

const reading = (
	windows: Record<string, { utilization: number; resetsAt: number | null }>,
	status = 'allowed',
	rateLimitType: string | null = null
): Extract<GardenerEvent, { type: 'limits' }> => ({
	type: 'limits',
	status,
	resetsAt: null,
	rateLimitType,
	windows,
})

const gate = (limits: Limits, more: Partial<Parameters<typeof usageGate>[0]> = {}) =>
	usageGate({ limits, warnAt: 0.8, stopAt: 0.95, now: NOW, warnedOn: null, today: '2026-10-31', ...more })

describe('the usage-window readings', () => {
	it('keeps the latest reading of each window, its reset in milliseconds', () => {
		const storage = memory()
		const resets = NOW / 1000 + 3600
		recordLimits(reading({ five_hour: { utilization: 0.2, resetsAt: resets } }), () => storage)
		recordLimits(reading({ seven_day: { utilization: 0.4, resetsAt: resets + 86_400 } }), () => storage)
		const limits = recordLimits(reading({ five_hour: { utilization: 0.3, resetsAt: resets } }), () => storage)
		expect(limits).toEqual({
			five_hour: { utilization: 0.3, resetsAt: resets * 1000, rejected: false },
			seven_day: { utilization: 0.4, resetsAt: (resets + 86_400) * 1000, rejected: false },
		})
		expect(readLimits(() => storage)).toEqual(limits)
		expect(storage.items.has(LIMITS_KEY)).toBe(true)
	})

	it('marks the window a rejected reading names, and keeps one it does not list as full', () => {
		const storage = memory()
		const named = recordLimits(
			reading(
				{ five_hour: { utilization: 0.99, resetsAt: 10 }, seven_day: { utilization: 0.5, resetsAt: 20 } },
				'rejected',
				'five_hour'
			),
			() => storage
		)
		expect(named.five_hour?.rejected).toBe(true)
		expect(named.seven_day?.rejected).toBe(false)
		const unlisted = recordLimits({ ...reading({}, 'rejected', 'seven_day_opus'), resetsAt: 30 }, () => memory())
		expect(unlisted).toEqual({ seven_day_opus: { utilization: 1, resetsAt: 30_000, rejected: true } })
	})

	it('survives a missing or throwing storage, and a stored value that is nonsense', () => {
		const throwing = {
			getItem: () => {
				throw new Error('denied')
			},
			setItem: () => {
				throw new Error('denied')
			},
		}
		expect(readLimits(() => undefined)).toEqual({})
		expect(readLimits(() => throwing)).toEqual({})
		const event = reading({ five_hour: { utilization: 0.5, resetsAt: 100 } })
		expect(recordLimits(event, () => undefined)).toEqual({
			five_hour: { utilization: 0.5, resetsAt: 100_000, rejected: false },
		})
		expect(recordLimits(event, () => throwing).five_hour?.utilization).toBe(0.5)
		const storage = memory()
		storage.setItem(LIMITS_KEY, 'not json')
		expect(readLimits(() => storage)).toEqual({})
		storage.setItem(LIMITS_KEY, JSON.stringify({ a: { utilization: 'full' }, b: { utilization: 0.1, resetsAt: null } }))
		expect(readLimits(() => storage)).toEqual({ b: { utilization: 0.1, resetsAt: null, rejected: false } })
	})
})

describe('the usage gate (D-180)', () => {
	const ahead = NOW + 2 * HOUR

	it('allows with no reading, and below the warn threshold', () => {
		expect(gate({})).toEqual({ allowed: true })
		expect(gate({ five_hour: { utilization: 0.5, resetsAt: ahead, rejected: false } })).toEqual({ allowed: true })
	})

	it('declines at or past the stop threshold while the reset is ahead, naming the window, its share and its reset', () => {
		const limits = { five_hour: { utilization: 0.96, resetsAt: ahead, rejected: false } }
		expect(gate(limits)).toEqual({
			allowed: false,
			decline: { window: 'five_hour', utilization: 0.96, resetsAt: ahead },
		})
		expect(gate({ five_hour: { utilization: 0.95, resetsAt: ahead, rejected: false } }).allowed).toBe(false)
		expect(gate(limits, { stopAt: 0.97 }).allowed).toBe(true)
	})

	it('declines a rejected window whatever its share, and names the one resetting last', () => {
		const limits = {
			five_hour: { utilization: 0.4, resetsAt: ahead, rejected: true },
			seven_day: { utilization: 0.97, resetsAt: ahead + 48 * HOUR, rejected: false },
		}
		expect(gate(limits).decline).toEqual({ window: 'seven_day', utilization: 0.97, resetsAt: ahead + 48 * HOUR })
		expect(gate({ five_hour: limits.five_hour }).decline?.window).toBe('five_hour')
	})

	it('ignores a reading whose reset has passed', () => {
		const passed = { five_hour: { utilization: 1, resetsAt: NOW - 1, rejected: true } }
		expect(gate(passed)).toEqual({ allowed: true })
		expect(gate({ five_hour: { utilization: 1, resetsAt: NOW, rejected: false } })).toEqual({ allowed: true })
	})

	it('warns at the warn threshold once a day, naming the fullest window', () => {
		const limits = {
			five_hour: { utilization: 0.82, resetsAt: ahead, rejected: false },
			seven_day: { utilization: 0.9, resetsAt: ahead + 24 * HOUR, rejected: false },
		}
		expect(gate(limits)).toEqual({
			allowed: true,
			warn: { window: 'seven_day', utilization: 0.9, resetsAt: ahead + 24 * HOUR },
		})
		expect(gate(limits, { warnedOn: '2026-10-31' })).toEqual({ allowed: true })
		expect(gate(limits, { warnedOn: '2026-10-30' }).warn?.window).toBe('seven_day')
	})

	it('words a decline from what it carries: the window, the share and the reset', () => {
		const { decline } = gate({ five_hour: { utilization: 0.96, resetsAt: ahead, rejected: false } })
		expect(decline && Math.round(decline.utilization * 100)).toBe(96)
		expect(decline && new Date(decline.resetsAt).toISOString()).toBe('2026-10-31T14:00:00.000Z')
	})

	it('names each window’s state the same way for the Usage tab', () => {
		const at = (utilization: number, rejected = false, resetsAt: number | null = ahead) =>
			windowState({ utilization, resetsAt, rejected }, 0.8, 0.95, NOW)
		expect(at(0.5)).toBe('ok')
		expect(at(0.8)).toBe('near')
		expect(at(0.95)).toBe('paused')
		expect(at(0.1, true)).toBe('paused')
		expect(at(0.99, false, NOW - 1)).toBe('past')
		expect(at(0.5, false, null)).toBe('ok')
	})
})
