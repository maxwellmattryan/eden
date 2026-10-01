// The usage rollup's rules, in one place (docs/engineering/gardener.md, "Usage"; D-115): what kind a request was,
// which entries are counted, how a day falls into a week, a month or a year, and the sums a query answers. The crate
// does the same in SQL (`usage.rs`); the browser's engine and the Gardener's page both run these.
import { addDays, weekStartOf } from '../dates/days.js'
import type {
	AuditEntry,
	SurfaceKind,
	UsageDay,
	UsageGroup,
	UsageQuery,
	UsageRow,
	UsageSpan,
	UsageSums,
} from './runtime-types.js'

/** A turn of a conversation, a tool a conversation ran, or a tool a page ran with no conversation (D-86). */
export function kindOf(entry: Pick<AuditEntry, 'surface' | 'parentRequestId'>): SurfaceKind {
	if (entry.surface !== 'delegated') return 'conversation'
	return entry.parentRequestId ? 'tool' : 'page'
}

/** A request's tool as the filters name it: its owner, a dot, its id. Nothing for a request that was no tool's. */
export function toolKey(entry: Pick<AuditEntry, 'domain' | 'tool'>): string | undefined {
	return entry.tool ? `${entry.domain ?? 'substrate'}.${entry.tool}` : undefined
}

/** Whether a request left the device: one declined at the confirm or stopped by the budget did not, and is not counted. */
export function wasSent(entry: Pick<AuditEntry, 'outcome'>): boolean {
	return entry.outcome !== 'declined' && entry.outcome !== 'budget'
}

const SPANS: readonly UsageSpan[] = ['day', 'week', 'month', 'year']
const NOTHING: UsageSums = { requests: 0, tokensIn: 0, tokensOut: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0 }

/** The bucket a day falls in: itself, the Monday of its week, its month (`YYYY-MM`) or its year. */
export function bucketOf(day: string, span: UsageSpan): string {
	if (span === 'week') return weekStartOf(day, 'monday')
	if (span === 'month') return day.slice(0, 7)
	if (span === 'year') return day.slice(0, 4)
	return day
}

function plus(a: UsageSums, b: UsageSums): UsageSums {
	return {
		requests: a.requests + b.requests,
		tokensIn: a.tokensIn + b.tokensIn,
		tokensOut: a.tokensOut + b.tokensOut,
		cacheRead: a.cacheRead + b.cacheRead,
		cacheWrite: a.cacheWrite + b.cacheWrite,
		costUsd: a.costUsd + b.costUsd,
	}
}

/** The rows' sums, together. */
export function sumUsage(rows: readonly UsageSums[]): UsageSums {
	return rows.reduce(plus, NOTHING)
}

/** Adds one recorded entry to its day, in place. An entry that never left the device changes nothing. */
export function addUsage(days: UsageDay[], entry: AuditEntry, day: string): void {
	if (!wasSent(entry)) return
	const key = {
		day,
		provider: entry.provider,
		model: entry.model,
		grade: entry.grade ?? ('' as const),
		kind: kindOf(entry),
		domain: entry.domain ?? '',
		tool: entry.tool ?? '',
	}
	const sums: UsageSums = {
		requests: 1,
		tokensIn: entry.tokensIn,
		tokensOut: entry.tokensOut,
		cacheRead: entry.cacheRead,
		cacheWrite: entry.cacheWrite,
		costUsd: entry.costUsd,
	}
	const at = days.findIndex(
		(row) =>
			row.day === key.day &&
			row.provider === key.provider &&
			row.model === key.model &&
			row.grade === key.grade &&
			row.kind === key.kind &&
			row.domain === key.domain &&
			row.tool === key.tool
	)
	const held = days[at]
	if (held) days[at] = { ...held, ...plus(held, sums) }
	else days.push({ ...key, ...sums })
}

const FIELDS = ['provider', 'model', 'grade', 'kind', 'domain', 'tool'] as const
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** The sums over a range of days, grouped as asked, in the order of the groups: what `usage::query` answers. */
export function usageOf(days: readonly UsageDay[], query: UsageQuery = {}): UsageRow[] {
	const groups: readonly UsageGroup[] = query.groupBy ?? []
	const span = groups.find((group): group is UsageSpan => (SPANS as readonly string[]).includes(group))
	const fields = FIELDS.filter((field) => groups.includes(field))
	const rows = new Map<string, UsageRow>()
	for (const row of days) {
		if (query.fromDay !== undefined && row.day < query.fromDay) continue
		if (query.toDay !== undefined && row.day > query.toDay) continue
		const bucket = span ? bucketOf(row.day, span) : null
		const key = JSON.stringify([bucket, ...fields.map((field) => row[field])])
		const held = rows.get(key) ?? {
			bucket,
			provider: null,
			model: null,
			grade: null,
			kind: null,
			domain: null,
			tool: null,
			...Object.fromEntries(fields.map((field) => [field, row[field]])),
			...NOTHING,
		}
		rows.set(key, { ...held, ...plus(held, row) })
	}
	return [...rows.values()].sort(
		(a, b) =>
			byText(a.bucket ?? '', b.bucket ?? '') ||
			FIELDS.reduce((order, field) => order || byText(a[field] ?? '', b[field] ?? ''), 0)
	)
}

/** Every bucket from one day to another, in order, the empty ones too: what a chart's axis reads. */
export function bucketsBetween(fromDay: string, toDay: string, span: UsageSpan): string[] {
	const buckets: string[] = []
	for (let day = fromDay; day <= toDay; day = addDays(day, 1)) {
		const bucket = bucketOf(day, span)
		if (buckets.at(-1) !== bucket) buckets.push(bucket)
	}
	return buckets
}

/** The first day of the range a span shows up to a day: thirty days, twelve weeks, twelve months, or all there is. */
export function rangeStart(today: string, span: UsageSpan, earliest: string | undefined): string {
	if (span === 'day') return addDays(today, -29)
	if (span === 'week') return addDays(weekStartOf(today, 'monday'), -11 * 7)
	if (span === 'month') {
		const months = Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7)) - 1 - 11
		return `${String(Math.floor(months / 12)).padStart(4, '0')}-${String((months % 12) + 1).padStart(2, '0')}-01`
	}
	return `${(earliest ?? today).slice(0, 4)}-01-01`
}
