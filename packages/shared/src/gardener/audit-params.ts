// The audit log's filters, sort and page as the address holds them (docs/engineering/gardener.md, "The audit log";
// D-114): `/gardener/audit?thread=…&kind=tool,page&sort=cost&dir=asc&page=2`. The address is the state, so a link
// from a conversation lands on its requests and back and forward walk the filters. A word the log does not know is
// dropped, never an error: an address is something the owner may have typed.
import { addDays, dateIn, instantAt } from '../dates/days.js'
import { AUDIT_PAGE_SIZE } from './audit-page.js'
import { startOfMonthMs } from './budget.js'
import { AUDIT_OUTCOMES } from './rules.js'
import type { AuditGrade, AuditOrder, AuditOutcome, AuditPageQuery, SurfaceKind } from './runtime-types.js'

export const AUDIT_KINDS: readonly SurfaceKind[] = ['conversation', 'tool', 'page']
export const AUDIT_GRADES: readonly AuditGrade[] = ['light', 'standard', 'deep']
export const AUDIT_ORDERS: readonly AuditOrder[] = [
	'at',
	'tool',
	'grade',
	'model',
	'tokens-in',
	'tokens-out',
	'cost',
	'outcome',
]
/** How far back the table looks: everything the log holds, or a stretch ending now. */
export const AUDIT_RANGES = ['all', 'today', '7d', '30d', 'month'] as const
export type AuditRange = (typeof AUDIT_RANGES)[number]

export interface AuditParams {
	/** Only this conversation's requests. */
	thread?: string
	/** Only the requests that read this row (a fact's "used by N requests"). */
	fact?: string
	kinds: SurfaceKind[]
	tools: string[]
	grades: AuditGrade[]
	models: string[]
	outcomes: AuditOutcome[]
	range: AuditRange
	sort: AuditOrder
	descending: boolean
	/** From one. */
	page: number
}

export const NO_AUDIT_PARAMS: AuditParams = {
	kinds: [],
	tools: [],
	grades: [],
	models: [],
	outcomes: [],
	range: 'all',
	sort: 'at',
	descending: true,
	page: 1,
}

const listOf = (text: string | null) => (text ? [...new Set(text.split(',').filter(Boolean))] : [])
const known = <T extends string>(text: string | null, all: readonly T[]) =>
	listOf(text).filter((word): word is T => (all as readonly string[]).includes(word))
const one = <T extends string>(text: string | null, all: readonly T[], otherwise: T) =>
	(all as readonly string[]).includes(text ?? '') ? (text as T) : otherwise

/** What an address asks of the log. */
export function parseAuditParams(search: URLSearchParams): AuditParams {
	const page = Number(search.get('page'))
	return {
		thread: search.get('thread') || undefined,
		fact: search.get('fact') || undefined,
		kinds: known(search.get('kind'), AUDIT_KINDS),
		tools: listOf(search.get('tool')),
		grades: known(search.get('grade'), AUDIT_GRADES),
		models: listOf(search.get('model')),
		outcomes: known(search.get('outcome'), AUDIT_OUTCOMES),
		range: one(search.get('range'), AUDIT_RANGES, 'all'),
		sort: one(search.get('sort'), AUDIT_ORDERS, 'at'),
		descending: search.get('dir') !== 'asc',
		page: Number.isInteger(page) && page > 0 ? page : 1,
	}
}

/** The address's query for the params, `?` included; nothing when they ask for the log as it opens. */
export function auditSearch(params: AuditParams): string {
	const search = new URLSearchParams()
	if (params.thread) search.set('thread', params.thread)
	if (params.fact) search.set('fact', params.fact)
	const lists = {
		kind: params.kinds,
		tool: params.tools,
		grade: params.grades,
		model: params.models,
		outcome: params.outcomes,
	}
	for (const [name, list] of Object.entries(lists)) if (list.length) search.set(name, list.join(','))
	if (params.range !== 'all') search.set('range', params.range)
	if (params.sort !== 'at') search.set('sort', params.sort)
	if (!params.descending) search.set('dir', 'asc')
	if (params.page > 1) search.set('page', String(params.page))
	const text = search.toString()
	return text ? `?${text}` : ''
}

/** Whether anything is filtered: what "Clear filters" clears. The sort and the page are not filters. */
export function hasAuditFilters(params: AuditParams): boolean {
	return Boolean(
		params.thread ||
		params.fact ||
		params.kinds.length ||
		params.tools.length ||
		params.grades.length ||
		params.models.length ||
		params.outcomes.length ||
		params.range !== 'all'
	)
}

/** The instant a range starts, in the owner's zone; nothing for the whole log. */
export function rangeFromMs(range: AuditRange, now: number, zone: string): number | undefined {
	if (range === 'all') return undefined
	if (range === 'month') return startOfMonthMs(now, zone)
	const today = dateIn(zone, now)
	const back = range === 'today' ? 0 : range === '7d' ? 6 : 29
	return instantAt(addDays(today, -back), '00:00', zone)
}

/** The query the crate answers for the params. */
export function auditQueryOf(
	params: AuditParams,
	now: number,
	zone: string,
	pageSize = AUDIT_PAGE_SIZE
): AuditPageQuery {
	return {
		threadId: params.thread,
		readRow: params.fact,
		fromMs: rangeFromMs(params.range, now, zone),
		kinds: params.kinds,
		tools: params.tools,
		grades: params.grades,
		models: params.models,
		outcomes: params.outcomes,
		order: params.sort,
		descending: params.descending,
		limit: pageSize,
		offset: (params.page - 1) * pageSize,
	}
}
