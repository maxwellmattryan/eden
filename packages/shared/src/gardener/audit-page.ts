// A page of the audit log, as the crate answers one (`audit.rs`, `query_page`; D-114): the filters, the sort by one
// column and then by the latest, and the slice. The browser's engine runs these over its own entries, so the log's
// table behaves the same in a plain browser as in the app.
import type { AuditEntry, AuditFacets, AuditOrder, AuditPage, AuditPageQuery, ThreadUsage } from './runtime-types.js'
import { kindOf, toolKey, wasSent } from './usage.js'

export const AUDIT_PAGE_SIZE = 50
export const AUDIT_PAGE_MAX = 200

const GRADE_RANK = { light: 0, standard: 1, deep: 2 } as const

/** What a column sorts an entry by; null sorts before everything, as in SQLite. */
function sortKey(entry: AuditEntry, order: AuditOrder): string | number | null {
	switch (order) {
		case 'at':
			return entry.at
		case 'tool':
			return entry.tool
		case 'grade':
			return entry.grade ? GRADE_RANK[entry.grade] : null
		case 'model':
			return entry.model
		case 'tokens-in':
			return entry.tokensIn
		case 'tokens-out':
			return entry.tokensOut
		case 'cost':
			return entry.costUsd
		case 'outcome':
			return entry.outcome
	}
}

function compare(a: string | number | null, b: string | number | null): number {
	if (a === b) return 0
	if (a === null) return -1
	if (b === null) return 1
	return a < b ? -1 : 1
}

const latestFirst = (a: AuditEntry, b: AuditEntry) => b.at - a.at || compare(b.id, a.id)

const among = <T>(list: readonly T[] | undefined, value: T | null | undefined) =>
	!list?.length || (value != null && list.includes(value))

/** Whether the filters keep the entry. */
export function keeps(query: AuditPageQuery, entry: AuditEntry): boolean {
	return (
		(!query.threadId || entry.threadId === query.threadId) &&
		(query.fromMs === undefined || entry.at >= query.fromMs) &&
		(query.toMs === undefined || entry.at <= query.toMs) &&
		among(query.kinds, kindOf(entry)) &&
		among(query.tools, toolKey(entry)) &&
		among(query.grades, entry.grade) &&
		among(query.models, entry.model) &&
		among(query.outcomes, entry.outcome) &&
		(!query.readRow || entry.reads.some((read) => read.rows.includes(query.readRow!)))
	)
}

/** One page of the entries: filtered, sorted, sliced, with how many the filters keep in all. */
export function auditPageOf(entries: readonly AuditEntry[], query: AuditPageQuery = {}): AuditPage {
	const order = query.order ?? 'at'
	const sign = (query.descending ?? true) ? -1 : 1
	const kept = entries
		.filter((entry) => keeps(query, entry))
		.sort((a, b) =>
			order === 'at'
				? sign * (a.at - b.at || compare(a.id, b.id))
				: sign * compare(sortKey(a, order), sortKey(b, order)) || latestFirst(a, b)
		)
	const limit = Math.max(1, Math.min(query.limit ?? AUDIT_PAGE_SIZE, AUDIT_PAGE_MAX))
	const offset = Math.max(0, query.offset ?? 0)
	return { rows: kept.slice(offset, offset + limit), total: kept.length }
}

/** The models and the tools the entries hold, each once, in order. */
export function auditFacetsOf(entries: readonly AuditEntry[]): AuditFacets {
	const distinct = (values: (string | undefined)[]) =>
		[...new Set(values.filter((value): value is string => value !== undefined))].sort()
	return { models: distinct(entries.map((entry) => entry.model)), tools: distinct(entries.map(toolKey)) }
}

/** What each conversation's requests came to; a request that never left the device is not counted. */
export function threadTotalsOf(entries: readonly AuditEntry[]): ThreadUsage[] {
	const totals = new Map<string, ThreadUsage>()
	for (const entry of entries) {
		if (!entry.threadId || !wasSent(entry)) continue
		const held = totals.get(entry.threadId) ?? {
			threadId: entry.threadId,
			requests: 0,
			tokensIn: 0,
			tokensOut: 0,
			costUsd: 0,
			lastAt: 0,
		}
		totals.set(entry.threadId, {
			threadId: entry.threadId,
			requests: held.requests + 1,
			tokensIn: held.tokensIn + entry.tokensIn,
			tokensOut: held.tokensOut + entry.tokensOut,
			costUsd: held.costUsd + entry.costUsd,
			lastAt: Math.max(held.lastAt, entry.at),
		})
	}
	return [...totals.values()].sort((a, b) => compare(a.threadId, b.threadId))
}
