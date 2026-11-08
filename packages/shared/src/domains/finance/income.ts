// The income pass (product/domains/finance.md §3, §4, D-200): from the live transactions, the paychecks by employer and
// cadence, the other repeating income and the yearly tax refund or payment, kept as one `income-source` row each. It
// says when an expected paycheck is late, when an employer paid extra and when a new paycheck starts, and it works out
// the monthly equivalents, the trailing income average #84 reads and the `monthly-income-band` fact's value. Pure: no
// rune module, no I/O. Only the home currency enters a total (D-188).
import { toUri, type BatchOp, type Entity } from '../../data/index.js'
import { addDays } from '../../dates/index.js'
import { decimalsOf, money, type Money } from '../../money/index.js'
import { addMonths, foldText, type Ledger, type LedgerEntry } from './ledger.js'
import { same } from './sync.js'
import {
	FINANCE,
	type Category,
	type IncomeCadence,
	type IncomeSource,
	type IncomeSourcePayload,
	type Merchant,
	type TransactionPayload,
} from './types.js'

/** How far back an income row is read. */
export const INCOME_WINDOW_DAYS = 400
/** How far back a tax row is read. */
export const TAX_WINDOW_DAYS = 800
/** The fewest pay days a cadence is read from, and the fewest rows an irregular source has. */
export const MIN_POINTS = 3
/** A row above this many times the group's lower median is an extra row. */
export const EXTRA_RATIO = 1.5
/** A source created with its first day this recent is new. */
export const NEW_DAYS = 100
/** How recent an extra row is for the bonus question. */
export const BONUS_DAYS = 30
/** The most extra rows a source remembers as answered; the oldest is dropped. */
export const HANDLED_MAX = 20
/** The complete months the trailing average and an irregular source's equivalent are read over. */
export const AVERAGE_MONTHS = 3
/** The cadence is read from the last this many pay days. */
const CADENCE_POINTS = 7
/** The expected amount is the lower median of the last this many regular rows. */
const EXPECTED_ROWS = 6
/** A pay day this close to its month's end is the last day (31). */
const MONTH_END_DAYS = 3
/** A tax source's next day is moved on a year at a time until it is no earlier than this many days ago. */
const TAX_LEAD_DAYS = 60
/** Paid on the last day of the month. */
const LAST_DAY = 31

const TAX_REFUND_CODE = 'INCOME_TAX_REFUND'
const TAX_PAYMENT_CODE = 'GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT'

// ---- Shapes ----------------------------------------------------------------------------------------------------------

type OwnerKey = 'endedOn' | 'leanSince' | 'lateOk' | 'ignored' | 'seenNew' | 'handled'
const OWNER_KEYS: readonly OwnerKey[] = ['endedOn', 'leanSince', 'lateOk', 'ignored', 'seenNew', 'handled']
const DETECTED_KEYS = [
	'kind',
	'merchantId',
	'counterparty',
	'nameKey',
	'name',
	'accountId',
	'cadence',
	'anchors',
	'expected',
	'firstDay',
	'lastDay',
	'nextDay',
] as const

/** What the pass detects of a source: every key but the owner's. */
export type DetectedFields = Omit<IncomeSourcePayload, OwnerKey>

/** An extra row of a source: a bonus on its own (`combined: false`) or paid in one deposit with the paycheck. */
export interface IncomeExtra {
	rowId: string
	/** The bonus: the whole row, or the row less the expected amount for a combined deposit. */
	amount: Money
	day: string
	combined: boolean
	pending: boolean
}

export type DetectedSource = DetectedFields & {
	/** Every row of the group, oldest first. */
	rowIds: string[]
	extras: IncomeExtra[]
	/** The pay days the cadence was read from; none for an irregular or a tax source. */
	points: string[]
}

export type IncomeQuestion =
	| { kind: 'late'; sourceId: string; day: string }
	| { kind: 'bonus'; sourceId: string; rowId: string; amount: Money; day: string; combined: boolean }
	| { kind: 'new'; sourceId: string }

export type IncomeSignalName = 'finance.paycheck-late' | 'finance.bonus' | 'finance.income-new'

export interface IncomeSignal {
	name: IncomeSignalName
	payload: { uris: string[]; employer: string; day: string }
	dedupeKey: string
}

// ---- Days ------------------------------------------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000
const dayNumber = (day: string) => Math.round(Date.parse(`${day}T00:00:00Z`) / DAY_MS)
const weekdayOf = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay()
const monthLength = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate()
const pad = (value: number) => String(value).padStart(2, '0')
const dayOf = (year: number, month: number, date: number) =>
	`${String(year).padStart(4, '0')}-${pad(month)}-${pad(date)}`
const partsOf = (day: string) => day.split('-').map(Number) as [number, number, number]
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const roundHalfAway = (value: number) => Math.sign(value) * Math.round(Math.abs(value))

/** The same day a year on; 29 Feb becomes 28 Feb. */
function yearOn(day: string): string {
	const [year, month, date] = partsOf(day)
	return dayOf(year + 1, month, month === 2 && date === 29 ? 28 : date)
}

/** A day of the month as an anchor: within 3 days of the month's end it is the last day, 31. */
function anchorOf(day: string): number {
	const [year, month, date] = partsOf(day)
	return monthLength(year, month) - date <= MONTH_END_DAYS ? LAST_DAY : date
}

/** The pay day of an anchor in a month: clamped to the month's length, moved back to Friday from a weekend. */
function payDayOf(year: number, month: number, anchor: number): string {
	const day = dayOf(year, month, Math.min(anchor, monthLength(year, month)))
	const weekday = weekdayOf(day)
	return weekday === 6 ? addDays(day, -1) : weekday === 0 ? addDays(day, -2) : day
}

const lowerMedian = (values: readonly number[]) => [...values].sort((a, b) => a - b)[(values.length - 1) >> 1]!

// ---- Rows ------------------------------------------------------------------------------------------------------------

/** Whether a row is a tax refund or a tax payment; `taxesId` is the default `taxes` category's id. */
export function taxKindOf(
	row: TransactionPayload,
	taxesId: string | undefined
): 'tax-refund' | 'tax-payment' | undefined {
	if (row.providerCategory === TAX_REFUND_CODE) return 'tax-refund'
	if (row.kind === 'income' && row.amount.minor > 0 && foldText(row.name).includes('tax ref')) return 'tax-refund'
	if (row.providerCategory === TAX_PAYMENT_CODE) return 'tax-payment'
	if (row.amount.minor < 0 && taxesId !== undefined && row.categoryId === taxesId) return 'tax-payment'
	return undefined
}

/** A source's identity across passes: its kind, with its merchant and counterparty or its folded name. */
export function incomeIdentity(source: Pick<IncomeSourcePayload, 'kind' | 'merchantId' | 'counterparty' | 'nameKey'>) {
	return source.merchantId
		? `${source.kind}\u0000m\u0000${source.merchantId}\u0000${source.counterparty ?? ''}`
		: `${source.kind}\u0000n\u0000${source.nameKey ?? ''}`
}

type Row = Entity<TransactionPayload>
interface Group {
	kind: IncomeSourcePayload['kind']
	merchantId?: string
	counterparty?: string
	nameKey?: string
	rows: Row[]
}

const isCadenced = (cadence: IncomeCadence) => cadence !== 'irregular' && cadence !== 'yearly'

// ---- Cadence ---------------------------------------------------------------------------------------------------------

const every = (gaps: readonly number[], low: number, high: number) => gaps.every((gap) => gap >= low && gap <= high)

/** The cadence the last 7 distinct days fit, the first rule that does; nothing for fewer than 3 days or no fit. */
function cadenceOf(days: readonly string[]): { cadence: IncomeCadence; points: string[] } | undefined {
	const points = [...new Set(days)].sort(byText).slice(-CADENCE_POINTS)
	if (points.length < MIN_POINTS) return undefined
	const gaps = points.slice(1).map((day, at) => dayNumber(day) - dayNumber(points[at]!))
	if (every(gaps, 5, 9)) return { cadence: 'weekly', points }
	if (every(gaps, 11, 17)) {
		const counts = new Map<number, number>()
		for (const day of points) counts.set(weekdayOf(day), (counts.get(weekdayOf(day)) ?? 0) + 1)
		if (Math.max(...counts.values()) >= points.length - 1) return { cadence: 'biweekly', points }
	}
	if (every(gaps, 9, 20)) return { cadence: 'semimonthly', points }
	if (every(gaps, 25, 36)) return { cadence: 'monthly', points }
	return undefined
}

/** The days of the month a semimonthly or monthly source pays on, ascending. */
function anchorsOf(cadence: 'semimonthly' | 'monthly', points: readonly string[]): number[] {
	const all = points.map(anchorOf)
	if (cadence === 'monthly') {
		// the day it pays on most often, the later of equals: a pay day moved back from a weekend is the odd one out
		const counts = new Map<number, number>()
		for (const day of all) counts.set(day, (counts.get(day) ?? 0) + 1)
		return [[...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]![0]]
	}
	const halves = [all.filter((day) => day <= 15), all.filter((day) => day > 15)].filter((half) => half.length)
	const anchors = halves.map((half) => Math.max(...half))
	// both pay days in one half (the 1st and the 15th): that half's first and latest
	if (halves.length === 1 && Math.min(...halves[0]!) !== anchors[0]) anchors.unshift(Math.min(...halves[0]!))
	return anchors.sort((a, b) => a - b)
}

/**
 * The pay day after `lastDay`: 7 or 14 days on for weekly and biweekly; the next anchor for semimonthly and monthly,
 * clamped to the month and moved back to Friday from a weekend; a year on (29 Feb to 28 Feb) for yearly; none for an
 * irregular source.
 */
export function nextDayOf(cadence: IncomeCadence, anchors: readonly number[] | undefined, lastDay: string) {
	if (cadence === 'weekly') return addDays(lastDay, 7)
	if (cadence === 'biweekly') return addDays(lastDay, 14)
	if (cadence === 'yearly') return yearOn(lastDay)
	if (cadence === 'irregular' || !anchors?.length) return undefined
	const sorted = [...anchors].sort((a, b) => a - b)
	let [year, month] = partsOf(lastDay)
	for (let step = 0; step < 3; step += 1) {
		for (const anchor of sorted) {
			const day = payDayOf(year, month, anchor)
			if (day > lastDay) return day
		}
		month += 1
		if (month > 12) {
			month = 1
			year += 1
		}
	}
	return undefined
}

/**
 * The months, `YYYY-MM`, in which a biweekly source pays three times: its pay days 14 days apart, projected over the
 * current calendar month and the 11 after it. None for any other cadence.
 */
export function thirdCheckMonths(source: Pick<IncomeSource, 'cadence' | 'lastDay' | 'nextDay'>, today: string) {
	if (source.cadence !== 'biweekly') return []
	const first = `${today.slice(0, 7)}-01`
	const lastMonth = addMonths(today.slice(0, 7), 11)
	const [year, month] = partsOf(`${lastMonth}-01`)
	const last = dayOf(year, month, monthLength(year, month))
	let day = source.nextDay ?? addDays(source.lastDay, 14)
	const back = Math.ceil(Math.max(0, dayNumber(day) - dayNumber(first)) / 14)
	day = addDays(day, -14 * back)
	while (day < first) day = addDays(day, 14)
	const counts = new Map<string, number>()
	for (; day <= last; day = addDays(day, 14)) counts.set(day.slice(0, 7), (counts.get(day.slice(0, 7)) ?? 0) + 1)
	return [...counts]
		.filter(([, count]) => count >= 3)
		.map(([key]) => key)
		.sort(byText)
}

// ---- Detection -------------------------------------------------------------------------------------------------------

export interface IncomeInput {
	/** The live transactions; tombstoned rows are skipped. */
	transactions: readonly Row[]
	merchants: readonly Merchant[]
	categories: readonly Category[]
	/** `YYYY-MM-DD`. */
	today: string
}

const byDay = (a: Row, b: Row) => byText(a.payload.day, b.payload.day) || byText(a.id, b.id)

function nameOf(group: Group, latest: TransactionPayload, merchants: ReadonlyMap<string, Merchant>): string {
	const merchant = group.merchantId ? merchants.get(group.merchantId) : undefined
	return merchant?.name ?? latest.merchantName ?? latest.name
}

function baseOf(group: Group, rows: readonly Row[], merchants: ReadonlyMap<string, Merchant>) {
	const latest = rows.at(-1)!.payload
	const base: Pick<DetectedFields, 'kind' | 'merchantId' | 'counterparty' | 'nameKey' | 'name' | 'accountId'> = {
		kind: group.kind,
		name: nameOf(group, latest, merchants),
		accountId: latest.accountId,
	}
	if (group.merchantId) base.merchantId = group.merchantId
	if (group.counterparty) base.counterparty = group.counterparty
	if (group.nameKey !== undefined) base.nameKey = group.nameKey
	return base
}

/** The rows of a group in its latest row's currency, oldest first. */
function rowsOf(group: Group): Row[] {
	const sorted = [...group.rows].sort(byDay)
	const currency = sorted.at(-1)!.payload.amount.currency
	return sorted.filter((row) => row.payload.amount.currency === currency)
}

function incomeSourceOf(group: Group, merchants: ReadonlyMap<string, Merchant>): DetectedSource | undefined {
	const rows = rowsOf(group)
	const currency = rows.at(-1)!.payload.amount.currency
	const median = lowerMedian(rows.map((row) => row.payload.amount.minor))
	const isExtra = (row: Row) => row.payload.amount.minor > EXTRA_RATIO * median
	const regular = rows.filter((row) => !isExtra(row))
	const regularDays = new Set(regular.map((row) => row.payload.day))
	let fit = cadenceOf([...regularDays]) ?? cadenceOf(rows.map((row) => row.payload.day))
	if (!fit && rows.length < MIN_POINTS) return undefined
	// an extra row on a day the cadence pays, with no regular row of its own, is the paycheck and a bonus in one
	// deposit: its day is a pay day too
	for (const row of rows) {
		const day = row.payload.day
		if (!fit || regularDays.has(day) || fit.points.includes(day)) continue
		const tried = cadenceOf([...fit.points, day])
		if (tried?.cadence === fit.cadence && tried.points.includes(day)) fit = tried
	}
	const cadence: IncomeCadence = fit?.cadence ?? 'irregular'
	const points = fit?.points ?? []
	const expected = money(lowerMedian(regular.slice(-EXPECTED_ROWS).map((row) => row.payload.amount.minor)), currency)
	const lastDay = fit ? points.at(-1)! : rows.at(-1)!.payload.day
	const source: DetectedSource = {
		...baseOf(group, rows, merchants),
		cadence,
		expected,
		firstDay: rows[0]!.payload.day,
		lastDay,
		rowIds: rows.map((row) => row.id),
		extras: [],
		points,
	}
	if (cadence === 'semimonthly' || cadence === 'monthly') source.anchors = anchorsOf(cadence, points)
	const next = nextDayOf(cadence, source.anchors, lastDay)
	if (next) source.nextDay = next
	if (!fit) return source
	for (const row of rows) {
		if (!isExtra(row)) continue
		const { day, amount, pending } = row.payload
		// paid in one deposit with the paycheck: the day is a pay day with no regular row of its own
		const combined = points.includes(day) && !regularDays.has(day)
		const bonus = combined ? money(amount.minor - expected.minor, currency) : amount
		source.extras.push({ rowId: row.id, amount: bonus, day, combined, pending })
	}
	return source
}

function taxSourceOf(group: Group, merchants: ReadonlyMap<string, Merchant>, today: string): DetectedSource {
	const rows = rowsOf(group)
	const latest = rows.at(-1)!.payload
	let next = yearOn(latest.day)
	const floor = addDays(today, -TAX_LEAD_DAYS)
	while (next < floor) next = yearOn(next)
	return {
		...baseOf(group, rows, merchants),
		cadence: 'yearly',
		expected: latest.amount,
		firstDay: rows[0]!.payload.day,
		lastDay: latest.day,
		nextDay: next,
		rowIds: rows.map((row) => row.id),
		extras: [],
		points: [],
	}
}

/**
 * Every income source the live rows hold: one per group of `income` rows (by merchant and counterparty, or by the
 * folded name) with a cadence or at least 3 rows, and one per merchant of tax refunds and of tax payments. Tax rows
 * are never part of an income group. Sorted by identity, so a second run reads the same.
 */
export function detectIncome(input: IncomeInput): DetectedSource[] {
	const { today } = input
	const merchants = new Map(input.merchants.map((merchant) => [merchant.id, merchant]))
	const taxesId = input.categories.find((category) => category.key === 'taxes')?.id
	const since = addDays(today, -INCOME_WINDOW_DAYS)
	const taxSince = addDays(today, -TAX_WINDOW_DAYS)
	const groups = new Map<string, Group>()
	const add = (kind: Group['kind'], row: Row) => {
		const payload = row.payload
		const group: Group = payload.merchantId
			? {
					kind,
					merchantId: payload.merchantId,
					...(payload.counterparty ? { counterparty: payload.counterparty } : {}),
					rows: [],
				}
			: { kind, nameKey: foldText(payload.name), rows: [] }
		const key = incomeIdentity(group)
		const held = groups.get(key)
		if (held) held.rows.push(row)
		else groups.set(key, { ...group, rows: [row] })
	}
	for (const row of input.transactions) {
		if (row.deletedAt) continue
		const payload = row.payload
		const tax = taxKindOf(payload, taxesId)
		if (tax) {
			if (payload.day >= taxSince) add(tax, row)
			continue
		}
		if (payload.kind !== 'income' || payload.amount.minor <= 0 || payload.day < since) continue
		add('income', row)
	}
	const out: DetectedSource[] = []
	for (const key of [...groups.keys()].sort(byText)) {
		const group = groups.get(key)!
		const source = group.kind === 'income' ? incomeSourceOf(group, merchants) : taxSourceOf(group, merchants, today)
		if (source) out.push(source)
	}
	return out
}

/** The ids of the tax rows the sources were found in: they stay out of the average and lean mode's essentials. */
export function taxRowIds(detected: readonly DetectedSource[]): Set<string> {
	return new Set(detected.filter((source) => source.kind !== 'income').flatMap((source) => source.rowIds))
}

// ---- The rows the pass writes ------------------------------------------------------------------------------------------

/** The detected keys of a source, the optional ones only when set. */
export function incomeFields(source: DetectedSource | DetectedFields): DetectedFields {
	const fields: Record<string, unknown> = {}
	for (const key of DETECTED_KEYS) if (source[key] !== undefined) fields[key] = source[key]
	return fields as unknown as DetectedFields
}

/** Whether the owner has answered something on a source. */
export const hasOwnerKey = (payload: IncomeSourcePayload) => OWNER_KEYS.some((key) => payload[key] !== undefined)

/**
 * The writes that bring the `income-source` rows in line with what was detected: a source found the first time is
 * created; one whose detected keys changed is updated, keeping every other key; one whose group has no rows left is
 * deleted, unless the owner answered something on it. Also the sources as they are once the ops land.
 */
export function incomeOps(
	detected: readonly DetectedSource[],
	existing: readonly Entity<IncomeSourcePayload>[],
	newId: () => string
): { ops: BatchOp[]; created: string[]; sources: IncomeSource[] } {
	const live = existing.filter((row) => !row.deletedAt)
	const byIdentity = new Map<string, Entity<IncomeSourcePayload>>()
	for (const row of live) {
		const key = incomeIdentity(row.payload)
		if (!byIdentity.has(key)) byIdentity.set(key, row)
	}
	const ops: BatchOp[] = []
	const created: string[] = []
	const sources: IncomeSource[] = []
	const used = new Set<string>()
	for (const found of detected) {
		const fields = incomeFields(found)
		const held = byIdentity.get(incomeIdentity(fields))
		if (!held || used.has(held.id)) {
			const id = newId()
			ops.push({ op: 'createEntity', input: { id, type: FINANCE.income, payload: fields } })
			created.push(id)
			sources.push({ ...fields, id })
			continue
		}
		used.add(held.id)
		const kept: Record<string, unknown> = { ...held.payload }
		for (const key of DETECTED_KEYS) delete kept[key]
		const next = { ...kept, ...fields } as IncomeSourcePayload
		if (!same(next, held.payload)) ops.push({ op: 'updateEntity', id: held.id, payload: next })
		sources.push({ ...next, id: held.id })
	}
	for (const row of live) {
		if (used.has(row.id)) continue
		if (hasOwnerKey(row.payload)) sources.push({ ...row.payload, id: row.id })
		else ops.push({ op: 'delete', uri: toUri(FINANCE.income, row.id) })
	}
	return { ops, created, sources }
}

// ---- Questions and signals -------------------------------------------------------------------------------------------

/** A paycheck the owner should hear about: an `income` source with a cadence, not ended, not hidden. */
const watched = (source: IncomeSource) =>
	source.kind === 'income' && isCadenced(source.cadence) && !source.endedOn && !source.ignored

/**
 * The latest expected pay day that passed with its grace (2 days for weekly, 3 for the others) and no paycheck, for
 * an `income` source with a cadence that is neither ended nor hidden; nothing otherwise.
 */
export function missedDay(source: IncomeSource, today: string): string | undefined {
	if (!watched(source) || !source.nextDay) return undefined
	const grace = source.cadence === 'weekly' ? 2 : 3
	let missed: string | undefined
	let day: string | undefined = source.nextDay
	for (let step = 0; day && step < 400 && addDays(day, grace) < today; step += 1) {
		missed = day
		day = nextDayOf(source.cadence, source.anchors, day)
	}
	return missed
}

/** The day lean mode is on since: the earliest `leanSince` of the sources, or none while it is off. */
export function leanSinceOf(sources: readonly IncomeSource[]): string | undefined {
	let since: string | undefined
	for (const source of sources) if (source.leanSince && (!since || source.leanSince < since)) since = source.leanSince
	return since
}

/**
 * The questions the page asks, most urgent first: each late paycheck (the earliest missed day first) not already
 * said to be just late; each posted extra row of the last 30 days on a source with a cadence, ended ones included,
 * not yet answered (the newest first); then, during lean mode, each new paycheck that started after it.
 */
export function incomeQuestions(
	sources: readonly IncomeSource[],
	detected: readonly DetectedSource[],
	today: string
): IncomeQuestion[] {
	const found = new Map(detected.map((source) => [incomeIdentity(source), source]))
	const lean = leanSinceOf(sources)
	const since = addDays(today, -BONUS_DAYS)
	const late: Extract<IncomeQuestion, { kind: 'late' }>[] = []
	const bonus: Extract<IncomeQuestion, { kind: 'bonus' }>[] = []
	const fresh: IncomeQuestion[] = []
	for (const source of sources) {
		if (source.ignored || source.kind !== 'income' || !isCadenced(source.cadence)) continue
		const day = missedDay(source, today)
		if (day && day !== source.lateOk) late.push({ kind: 'late', sourceId: source.id, day })
		for (const extra of found.get(incomeIdentity(source))?.extras ?? []) {
			if (extra.pending || extra.day < since || extra.day > today || extra.amount.minor <= 0) continue
			if (source.handled?.includes(extra.rowId)) continue
			const { rowId, amount, combined } = extra
			bonus.push({ kind: 'bonus', sourceId: source.id, rowId, amount, day: extra.day, combined })
		}
		if (lean && !source.endedOn && !source.seenNew && source.firstDay > lean)
			fresh.push({ kind: 'new', sourceId: source.id })
	}
	late.sort((a, b) => byText(a.day, b.day) || byText(a.sourceId, b.sourceId))
	bonus.sort((a, b) => byText(b.day, a.day) || byText(a.rowId, b.rowId))
	return [...late, ...bonus, ...fresh]
}

/**
 * The signals for the questions and the sources just created: a late paycheck under `<source id>:<day>`, a bonus
 * under its row's id, and a new paycheck under `<source id>:new` when its first day is within the last 100 days. Each
 * carries the employer and a day in the owner's words (`dayWords`), never an amount.
 */
export function incomeSignals(
	questions: readonly IncomeQuestion[],
	created: readonly string[],
	sources: readonly IncomeSource[],
	today: string,
	dayWords: (day: string) => string = (day) => day
): IncomeSignal[] {
	const byId = new Map(sources.map((source) => [source.id, source]))
	const base = (source: IncomeSource) => ({ uris: [toUri(FINANCE.income, source.id)], employer: source.name })
	const out: IncomeSignal[] = []
	for (const question of questions) {
		const source = byId.get(question.sourceId)
		if (!source) continue
		if (question.kind === 'late')
			out.push({
				name: 'finance.paycheck-late',
				payload: { ...base(source), day: dayWords(question.day) },
				dedupeKey: `${source.id}:${question.day}`,
			})
		else if (question.kind === 'bonus')
			out.push({
				name: 'finance.bonus',
				payload: { ...base(source), day: dayWords(question.day) },
				dedupeKey: question.rowId,
			})
	}
	const recent = addDays(today, -NEW_DAYS)
	for (const id of created) {
		const source = byId.get(id)
		if (!source || source.kind !== 'income' || !isCadenced(source.cadence) || source.firstDay < recent) continue
		out.push({
			name: 'finance.income-new',
			payload: { ...base(source), day: dayWords(source.firstDay) },
			dedupeKey: `${id}:new`,
		})
	}
	return out
}

// ---- Monthly figures -------------------------------------------------------------------------------------------------

/** The complete months among the last `months` before `month`, never before the ledger's first: `from`/`to`/`count`. */
function completeMonths(ledger: Ledger, month: string, months: number) {
	if (!ledger.firstMonth) return undefined
	let from = addMonths(month, -months)
	if (from < ledger.firstMonth) from = ledger.firstMonth
	const to = addMonths(month, -1)
	if (from > to) return undefined
	let count = 0
	for (let at = from; at <= to; at = addMonths(at, 1)) count += 1
	return { from, to, count }
}

/** Whether a ledger entry is one of a source's rows. */
function ofSource(entry: LedgerEntry, source: IncomeSourcePayload): boolean {
	if (entry.kind !== 'income') return false
	if (source.merchantId)
		return entry.merchantId === source.merchantId && (entry.counterparty ?? '') === (source.counterparty ?? '')
	return !entry.merchantId && foldText(entry.name) === source.nameKey
}

/**
 * A source's monthly equivalent, in its currency: weekly × 52 ÷ 12, biweekly × 26 ÷ 12, semimonthly × 2, monthly × 1,
 * yearly ÷ 12, each rounded half away from zero; an irregular source's rows over the last 3 complete months ÷ 3.
 */
export function monthlyOf(source: IncomeSourcePayload, ledger: Ledger, today: string): Money {
	const { minor, currency } = source.expected
	switch (source.cadence) {
		case 'weekly':
			return money(roundHalfAway((minor * 52) / 12), currency)
		case 'biweekly':
			return money(roundHalfAway((minor * 26) / 12), currency)
		case 'semimonthly':
			return money(minor * 2, currency)
		case 'monthly':
			return money(minor, currency)
		case 'yearly':
			return money(roundHalfAway(minor / 12), currency)
		case 'irregular': {
			const month = today.slice(0, 7)
			const from = addMonths(month, -AVERAGE_MONTHS)
			const to = addMonths(month, -1)
			let sum = 0
			for (const entry of ledger.entries) {
				const at = entry.day.slice(0, 7)
				if (at < from || at > to || !ofSource(entry, source)) continue
				for (const line of entry.lines) if (line.amount.currency === currency) sum += line.amount.minor
			}
			return money(roundHalfAway(sum / AVERAGE_MONTHS), currency)
		}
	}
}

/** An `income` source that counts in the totals: neither ended nor hidden, in the home currency. */
export const countsInTotals = (source: IncomeSourcePayload, home: string) =>
	source.kind === 'income' && !source.endedOn && !source.ignored && source.expected.currency === home

/**
 * The trailing average #84 reads: the mean monthly money in from `income` entries in the home currency over the
 * complete months among the last 3 before `month` (never before the ledger's first), one-off rows and the tax rows in
 * `exclude` left out. Nothing with no complete month.
 */
export function incomeAverage(
	ledger: Ledger,
	options: { month: string; exclude?: ReadonlySet<string> }
): { average: Money; months: number } | undefined {
	const span = completeMonths(ledger, options.month, AVERAGE_MONTHS)
	if (!span) return undefined
	let sum = 0
	for (const entry of ledger.entries) {
		const at = entry.day.slice(0, 7)
		if (at < span.from || at > span.to || entry.kind !== 'income' || entry.oneOff) continue
		if (options.exclude?.has(entry.id) || foldText(entry.name).includes('tax ref')) continue
		for (const line of entry.lines) if (line.amount.currency === ledger.home && !line.oneOff) sum += line.amount.minor
	}
	return { average: money(roundHalfAway(sum / span.count), ledger.home), months: span.count }
}

/** The sum of the monthly equivalents of the sources that count in the totals, in the home currency. */
export function monthlyIncome(sources: readonly IncomeSource[], ledger: Ledger, home: string, today: string): Money {
	let sum = 0
	for (const source of sources) if (countsInTotals(source, home)) sum += monthlyOf(source, ledger, today).minor
	return money(sum, home)
}

/**
 * The `monthly-income-band` fact's value and confidence: the monthly equivalents of the active home-currency `income`
 * sources, in whole major units, as `"<lo>-<hi> <CUR>"` in steps of 1,000 (100,000 for a currency with no decimals);
 * 0.9 when a source with a cadence adds to it, else 0.6. Nothing when the basis is 0.
 */
export function bandOf(
	sources: readonly IncomeSource[],
	ledger: Ledger,
	home: string,
	today: string
): { value: string; confidence: number } | undefined {
	let basis = 0
	let cadenced = false
	for (const source of sources) {
		if (!countsInTotals(source, home)) continue
		const monthly = monthlyOf(source, ledger, today).minor
		basis += monthly
		if (monthly > 0 && isCadenced(source.cadence)) cadenced = true
	}
	if (basis <= 0) return undefined
	const decimals = decimalsOf(home)
	const step = decimals === 0 ? 100000 : 1000
	const lo = Math.floor(basis / (step * 10 ** decimals)) * step
	return { value: `${lo}-${lo + step} ${home}`, confidence: cadenced ? 0.9 : 0.6 }
}
