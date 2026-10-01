import { describe, expect, it } from 'vitest'
import { budgetState, requestTokenCap, startOfMonthMs } from './budget.js'
import { ANTHROPIC_SEED } from './providers.js'

describe('the budget', () => {
	it('allows what fits under the cap, estimate included', () => {
		expect(budgetState({ spentThisMonth: 8, capUsd: 10, estimateUsd: 2, warnedOn: null, today: '2026-09-30' })).toEqual(
			{ allowed: true, percent: 80, warn: true }
		)
		expect(
			budgetState({ spentThisMonth: 8, capUsd: 10, estimateUsd: 2.01, warnedOn: null, today: '2026-09-30' }).allowed
		).toBe(false)
		expect(
			budgetState({ spentThisMonth: 0, capUsd: 0, estimateUsd: 0.01, warnedOn: null, today: '2026-09-30' })
		).toEqual({ allowed: false, percent: 0, warn: false })
	})

	it('warns past eighty per cent, once a day', () => {
		const at = (spent: number, warnedOn: string | null) =>
			budgetState({ spentThisMonth: spent, capUsd: 10, estimateUsd: 0, warnedOn, today: '2026-09-30' })
		expect(at(7.99, null).warn).toBe(false)
		expect(at(8, null).warn).toBe(true)
		expect(at(8, '2026-09-29').warn).toBe(true)
		expect(at(8, '2026-09-30').warn).toBe(false)
		expect(at(12, null)).toEqual({ allowed: false, percent: 120, warn: true })
	})

	it('finds the start of the month in the zone', () => {
		// 2026-09-30T09:40Z is the 30th in Chicago (CDT, -5) and in Tokyo (+9).
		const now = Date.UTC(2026, 8, 30, 9, 40)
		expect(new Date(startOfMonthMs(now, 'America/Chicago')).toISOString()).toBe('2026-09-01T05:00:00.000Z')
		expect(new Date(startOfMonthMs(now, 'Asia/Tokyo')).toISOString()).toBe('2026-08-31T15:00:00.000Z')
		expect(new Date(startOfMonthMs(now, 'UTC')).toISOString()).toBe('2026-09-01T00:00:00.000Z')
		// 2026-10-01T02:00Z is still the 30th of September in Chicago, and October in Tokyo.
		const edge = Date.UTC(2026, 9, 1, 2)
		expect(new Date(startOfMonthMs(edge, 'America/Chicago')).toISOString()).toBe('2026-09-01T05:00:00.000Z')
		expect(new Date(startOfMonthMs(edge, 'Asia/Tokyo')).toISOString()).toBe('2026-09-30T15:00:00.000Z')
		// A clock change inside the month: November in Chicago starts under CDT though the 30th is CST.
		const november = Date.UTC(2026, 10, 30, 12)
		expect(new Date(startOfMonthMs(november, 'America/Chicago')).toISOString()).toBe('2026-11-01T05:00:00.000Z')
	})

	it("caps a request at the owner's cap, or the model's context", () => {
		const sonnet = ANTHROPIC_SEED.models[1]!
		expect(requestTokenCap({ requestTokenCap: null }, sonnet)).toBe(1_000_000)
		expect(requestTokenCap({ requestTokenCap: 50_000 }, sonnet)).toBe(50_000)
	})
})
