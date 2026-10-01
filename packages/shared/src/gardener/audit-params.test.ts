import { describe, expect, it } from 'vitest'
import {
	auditQueryOf,
	auditSearch,
	hasAuditFilters,
	NO_AUDIT_PARAMS,
	parseAuditParams,
	rangeFromMs,
} from './audit-params.js'

const parse = (search: string) => parseAuditParams(new URLSearchParams(search))

describe('the audit log in the address', () => {
	it('reads nothing as the log as it opens', () => {
		expect(parse('')).toEqual({ ...NO_AUDIT_PARAMS, thread: undefined, fact: undefined })
		expect(auditSearch(NO_AUDIT_PARAMS)).toBe('')
		expect(hasAuditFilters(NO_AUDIT_PARAMS)).toBe(false)
	})

	it('round-trips every filter, the sort and the page', () => {
		const search =
			'?thread=01ARZ3NDEKTSV4RRFFQ69G5FAV&fact=f1&kind=tool%2Cpage&tool=kitchen.plan&grade=deep' +
			'&model=claude-opus-5-5&outcome=error%2Cbudget&range=7d&sort=cost&dir=asc&page=3'
		const params = parse(search)
		expect(params).toEqual({
			thread: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
			fact: 'f1',
			kinds: ['tool', 'page'],
			tools: ['kitchen.plan'],
			grades: ['deep'],
			models: ['claude-opus-5-5'],
			outcomes: ['error', 'budget'],
			range: '7d',
			sort: 'cost',
			descending: false,
			page: 3,
		})
		expect(auditSearch(params)).toBe(search)
		expect(hasAuditFilters(params)).toBe(true)
		expect(hasAuditFilters({ ...NO_AUDIT_PARAMS, sort: 'cost', page: 2 })).toBe(false)
	})

	it('drops a word the log does not know', () => {
		expect(parse('kind=tool,chat,tool&grade=huge&outcome=lost&range=forever&sort=surface&dir=up&page=0')).toEqual({
			...NO_AUDIT_PARAMS,
			thread: undefined,
			fact: undefined,
			kinds: ['tool'],
		})
		expect(parse('page=2.5').page).toBe(1)
	})

	it('starts a range at midnight in the zone, or at the first of the month', () => {
		const now = Date.parse('2026-10-01T03:00:00Z') // the evening of 30 September in Los Angeles
		expect(rangeFromMs('all', now, 'UTC')).toBeUndefined()
		expect(rangeFromMs('today', now, 'UTC')).toBe(Date.parse('2026-10-01T00:00:00Z'))
		expect(rangeFromMs('today', now, 'America/Los_Angeles')).toBe(Date.parse('2026-09-30T07:00:00Z'))
		expect(rangeFromMs('7d', now, 'UTC')).toBe(Date.parse('2026-09-25T00:00:00Z'))
		expect(rangeFromMs('30d', now, 'UTC')).toBe(Date.parse('2026-09-02T00:00:00Z'))
		expect(rangeFromMs('month', now, 'America/Los_Angeles')).toBe(Date.parse('2026-09-01T07:00:00Z'))
	})

	it('asks the crate for the page the params name', () => {
		const query = auditQueryOf({ ...NO_AUDIT_PARAMS, thread: 't', fact: 'f', sort: 'tokens-in', page: 3 }, 0, 'UTC', 25)
		expect(query).toMatchObject({
			threadId: 't',
			readRow: 'f',
			fromMs: undefined,
			order: 'tokens-in',
			descending: true,
			limit: 25,
			offset: 50,
		})
	})
})
