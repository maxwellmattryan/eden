import { describe, expect, it } from 'vitest'
import type { AuditEntry, UsageDay, UsageGroup } from './runtime-types.js'
import { addUsage, bucketOf, bucketsBetween, kindOf, rangeStart, sumUsage, toolKey, usageOf, wasSent } from './usage.js'

const entry = (over: Partial<AuditEntry> = {}): AuditEntry => ({
	id: '0'.repeat(26),
	at: 0,
	surface: 'global-chat',
	threadId: null,
	parentRequestId: null,
	tool: null,
	domain: null,
	declaredGrade: 'light',
	grade: 'light',
	source: 'map',
	provider: 'anthropic',
	model: 'haiku',
	reads: [],
	entities: [],
	tools: [],
	confirmOutcome: null,
	tokensIn: 100,
	tokensOut: 10,
	cacheRead: 5,
	cacheWrite: 2,
	costUsd: 1,
	outcome: 'ok',
	grants: [],
	image: null,
	attachments: [],
	...over,
})

describe('the usage rollup', () => {
	it('tells a conversation from a tool it ran and from a tool a page ran', () => {
		expect(kindOf(entry())).toBe('conversation')
		expect(kindOf(entry({ surface: 'kitchen-chat' }))).toBe('conversation')
		expect(kindOf(entry({ surface: 'delegated', parentRequestId: 'x' }))).toBe('tool')
		expect(kindOf(entry({ surface: 'delegated' }))).toBe('page')
		expect(toolKey(entry())).toBeUndefined()
		expect(toolKey(entry({ tool: 'plan', domain: 'kitchen' }))).toBe('kitchen.plan')
		expect(toolKey(entry({ tool: 'find-similar' }))).toBe('substrate.find-similar')
	})

	it('counts what was sent, and nothing that never left', () => {
		const days: UsageDay[] = []
		addUsage(days, entry(), '2026-09-30')
		addUsage(days, entry({ costUsd: 0.5, outcome: 'error' }), '2026-09-30')
		addUsage(days, entry({ outcome: 'declined' }), '2026-09-30')
		addUsage(days, entry({ outcome: 'budget' }), '2026-09-30')
		addUsage(days, entry({ grade: null, model: 'opus' }), '2026-09-30')
		expect(wasSent(entry({ outcome: 'interrupted' }))).toBe(true)
		expect(days).toHaveLength(2)
		expect(days[0]!).toMatchObject({ day: '2026-09-30', grade: 'light', kind: 'conversation', domain: '', tool: '' })
		expect(days[0]!).toMatchObject({ requests: 2, tokensIn: 200, tokensOut: 20, cacheRead: 10, cacheWrite: 4 })
		expect(days[0]!.costUsd).toBe(1.5)
		expect(days[1]!).toMatchObject({ grade: '', model: 'opus', requests: 1 })
	})

	it('puts a day in its week, month and year', () => {
		// a Sunday belongs to the week of the Monday before it
		expect(bucketOf('2026-09-27', 'week')).toBe('2026-09-21')
		expect(bucketOf('2026-09-28', 'week')).toBe('2026-09-28')
		expect(bucketOf('2026-09-28', 'day')).toBe('2026-09-28')
		expect(bucketOf('2026-09-28', 'month')).toBe('2026-09')
		expect(bucketOf('2026-09-28', 'year')).toBe('2026')
	})

	it('sums a range by span and by what ran, in order', () => {
		const days: UsageDay[] = []
		addUsage(days, entry(), '2026-09-27')
		addUsage(days, entry({ costUsd: 2 }), '2026-09-28')
		addUsage(
			days,
			entry({ surface: 'delegated', parentRequestId: 'x', tool: 'plan', grade: 'deep', model: 'opus', costUsd: 4 }),
			'2026-10-01'
		)
		const of = (...groupBy: UsageGroup[]) =>
			usageOf(days, { groupBy }).map((row) => [row.bucket, row.model, row.grade, row.kind, row.costUsd])
		expect(of()).toEqual([[null, null, null, null, 7]])
		expect(of('week')).toEqual([
			['2026-09-21', null, null, null, 1],
			['2026-09-28', null, null, null, 6],
		])
		expect(of('month', 'grade')).toEqual([
			['2026-09', null, 'light', null, 3],
			['2026-10', null, 'deep', null, 4],
		])
		expect(of('model', 'kind')).toEqual([
			[null, 'haiku', null, 'conversation', 3],
			[null, 'opus', null, 'tool', 4],
		])
		expect(usageOf(days, { fromDay: '2026-09-28', toDay: '2026-09-30' })[0]!.costUsd).toBe(2)
		expect(usageOf(days, { fromDay: '2027-01-01' })).toEqual([])
		expect(usageOf([])).toEqual([])
		expect(sumUsage(usageOf(days, { groupBy: ['day'] }))).toMatchObject({ requests: 3, costUsd: 7, cacheWrite: 6 })
	})

	it('lists every bucket of a range, the empty ones too', () => {
		expect(bucketsBetween('2026-09-29', '2026-10-01', 'day')).toEqual(['2026-09-29', '2026-09-30', '2026-10-01'])
		expect(bucketsBetween('2026-09-21', '2026-10-01', 'week')).toEqual(['2026-09-21', '2026-09-28'])
		expect(bucketsBetween('2025-11-01', '2026-02-10', 'month')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
		expect(bucketsBetween('2025-11-01', '2026-02-10', 'year')).toEqual(['2025', '2026'])
	})

	it('starts a span thirty days, twelve weeks or twelve months back, or at the first year there is', () => {
		expect(rangeStart('2026-10-01', 'day', undefined)).toBe('2026-09-02')
		expect(rangeStart('2026-10-01', 'week', undefined)).toBe('2026-07-13')
		expect(rangeStart('2026-10-01', 'month', undefined)).toBe('2025-11-01')
		expect(rangeStart('2026-01-15', 'month', undefined)).toBe('2025-02-01')
		expect(rangeStart('2026-10-01', 'year', '2024-06-03')).toBe('2024-01-01')
		expect(rangeStart('2026-10-01', 'year', undefined)).toBe('2026-01-01')
	})
})
