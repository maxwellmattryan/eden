import { describe, expect, it } from 'vitest'
import { auditFacetsOf, auditPageOf, threadTotalsOf } from './audit-page.js'
import type { AuditEntry } from './runtime-types.js'

const base: AuditEntry = {
	id: '',
	at: 0,
	surface: 'global-chat',
	threadId: null,
	parentRequestId: null,
	tool: null,
	domain: 'kitchen',
	declaredGrade: 'light',
	grade: 'light',
	source: 'map',
	provider: 'anthropic',
	model: 'claude-haiku-4-5-20251001',
	reads: [],
	entities: [],
	tools: [],
	confirmOutcome: null,
	tokensIn: 0,
	tokensOut: 0,
	cacheRead: 0,
	cacheWrite: 0,
	costUsd: 0,
	outcome: 'ok',
	grants: [],
	image: null,
	attachments: [],
}

// The five entries of the crate's own test (`audit.rs`, `varied`), so the two answer alike.
const a: AuditEntry = {
	...base,
	id: 'A',
	at: 1000,
	threadId: 'T',
	domain: null,
	tokensIn: 500,
	tokensOut: 50,
	costUsd: 0.05,
	reads: [{ id: 'recipe', count: 1, rows: ['r1'] }],
}
const b: AuditEntry = {
	...base,
	id: 'B',
	at: 2000,
	threadId: 'T',
	surface: 'delegated',
	parentRequestId: 'A',
	tool: 'plan',
	grade: 'deep',
	model: 'claude-opus-5-5',
	tokensIn: 900,
	tokensOut: 10,
	costUsd: 0.4,
}
const c: AuditEntry = {
	...base,
	id: 'C',
	at: 3000,
	surface: 'delegated',
	tool: 'capture-haul',
	grade: 'standard',
	model: 'claude-sonnet-5-5',
	tokensIn: 100,
	tokensOut: 400,
	costUsd: 0.2,
	outcome: 'error',
	reads: [{ id: 'recipe', count: 1, rows: ['r2'] }],
}
const d: AuditEntry = { ...base, id: 'D', at: 4000, threadId: 'T', surface: 'kitchen-chat', outcome: 'budget' }
const e: AuditEntry = {
	...base,
	id: 'E',
	at: 5000,
	surface: 'delegated',
	domain: null,
	tool: 'find-similar',
	tokensIn: 300,
	tokensOut: 30,
	costUsd: 0.01,
}
const entries = [a, b, c, d, e]
const ids = (query: Parameters<typeof auditPageOf>[1]) => auditPageOf(entries, query).rows.map((entry) => entry.id)

describe('a page of the audit log', () => {
	it('sorts by each column both ways, the latest first among equals', () => {
		expect(auditPageOf(entries)).toEqual({ rows: [e, d, c, b, a], total: 5 })
		expect(ids({ order: 'at', descending: false })).toEqual(['A', 'B', 'C', 'D', 'E'])
		expect(ids({ order: 'cost' })).toEqual(['B', 'C', 'A', 'E', 'D'])
		expect(ids({ order: 'cost', descending: false })).toEqual(['D', 'E', 'A', 'C', 'B'])
		expect(ids({ order: 'tokens-in' })).toEqual(['B', 'A', 'E', 'C', 'D'])
		expect(ids({ order: 'tokens-out' })).toEqual(['C', 'A', 'E', 'B', 'D'])
		expect(ids({ order: 'grade', descending: false })).toEqual(['E', 'D', 'A', 'C', 'B'])
		expect(ids({ order: 'model' })).toEqual(['C', 'B', 'E', 'D', 'A'])
		expect(ids({ order: 'outcome', descending: false })).toEqual(['D', 'C', 'E', 'B', 'A'])
		expect(ids({ order: 'tool', descending: false })).toEqual(['D', 'A', 'C', 'E', 'B'])
	})

	it('filters, counts and offsets', () => {
		expect(ids({ threadId: 'T' })).toEqual(['D', 'B', 'A'])
		expect(ids({ kinds: ['conversation'] })).toEqual(['D', 'A'])
		expect(ids({ kinds: ['tool'] })).toEqual(['B'])
		expect(ids({ kinds: ['page'] })).toEqual(['E', 'C'])
		expect(ids({ tools: ['kitchen.plan', 'substrate.find-similar'] })).toEqual(['E', 'B'])
		expect(ids({ grades: ['deep', 'standard'] })).toEqual(['C', 'B'])
		expect(ids({ models: ['claude-opus-5-5'] })).toEqual(['B'])
		expect(ids({ outcomes: ['error', 'budget'] })).toEqual(['D', 'C'])
		expect(ids({ readRow: 'r2' })).toEqual(['C'])
		expect(ids({ fromMs: 2000, toMs: 4000, kinds: ['conversation', 'tool'] })).toEqual(['D', 'B'])
		expect(auditPageOf(entries, { limit: 2, offset: 2 })).toEqual({ rows: [c, b], total: 5 })
		expect(auditPageOf(entries, { limit: 0 }).rows).toHaveLength(1)
		expect(auditPageOf(entries, { offset: 10, limit: 9999 })).toEqual({ rows: [], total: 5 })
	})

	it('lists what a filter may name, and totals each conversation', () => {
		expect(auditFacetsOf(entries)).toEqual({
			models: ['claude-haiku-4-5-20251001', 'claude-opus-5-5', 'claude-sonnet-5-5'],
			tools: ['kitchen.capture-haul', 'kitchen.plan', 'substrate.find-similar'],
		})
		const total = threadTotalsOf(entries)[0]!
		expect(total).toMatchObject({ threadId: 'T', requests: 2, tokensIn: 1400, tokensOut: 60, lastAt: 2000 })
		expect(total.costUsd).toBeCloseTo(0.45, 9)
		expect(threadTotalsOf(entries)).toHaveLength(1)
	})
})
