// Orchard's index and query engine (product/domains/finance.md §3, D-194): every live transaction as one entry per
// money event, held in memory and rebuilt from the rows, so Activity (#83), Overview (#87) and the Gardener's query
// (#90) read money from one place and always agree. A transfer or card-payment pair is one entry, never two. Every
// figure is a sum of lines (a row's parts, or a pair's two sides) over integer minor units, and only the home
// currency's lines enter a total; the rest are reported per currency (D-188). Pure: no rune module, no I/O.
import { parseUri, type BatchOp, type Entity } from '../../data/index.js'
import { addDays, weekStartOf } from '../../dates/index.js'
import { money, parseMoney, type Money } from '../../money/index.js'
import type { WeekStart } from '../../types/index.js'
import { insideAccount, spendingOf } from './classify.js'
import {
	FINANCE,
	type Account,
	type Category,
	type Merchant,
	type RecurringCharge,
	type TransactionPayload,
	type TxKind,
	type TxPart,
} from './types.js'

// ---- Shapes ----------------------------------------------------------------------------------------------------------

/** What one side of a pair, or one part of a row, adds. */
export interface LedgerLine {
	/** Signed as the side or the part: negative is money out. */
	amount: Money
	/** The account the line moves money in. */
	accountId: string
	/** A pair's lines never have one. */
	categoryId?: string
	/** `spendingOf` counts it. */
	spending: boolean
	/** The row is one-off: the line counts in totals, never in averages. */
	oneOff: boolean
}

/** One money event: a row, or a transfer or card-payment pair. */
export interface LedgerEntry {
	/** The row's id; a pair's money-out side's. */
	id: string
	/** A pair's money-in side's id. */
	pairId?: string
	/** The row's account; a pair's from (money-out) account. */
	accountId: string
	/** A pair's to (money-in) account. */
	toAccountId?: string
	day: string
	datetime?: string
	/** Either side is pending. */
	pending: boolean
	/** The row's kind, else `purchase` or `refund` by sign. */
	kind: TxKind
	/** The provider's raw name. */
	name: string
	merchantId?: string
	/** The merchant row's current name. */
	merchant?: string
	counterparty?: string
	categoryId?: string
	parts?: TxPart[]
	reimbursable?: Money
	oneOff: boolean
	review?: 'vague'
	refundOf?: string
	repays?: string
	notes?: string
	/** A buy, a sell or a reinvested dividend: money moving inside one account, in no measure (D-197). */
	insideAccount?: true
	/** The bill the row paid (#78); a pair's out side's, else its in side's. */
	billId?: string
	/** The recurring charge the row is in (#79), when that charge is live and not dismissed. */
	recurringId?: string
	/** A single row's parts (or the row), or a pair's out side then its in side. */
	lines: LedgerLine[]
}

export interface Ledger {
	/** The home currency: the only one a total adds. */
	home: string
	/** Newest first: `day`, then `datetime`, then id, descending. */
	entries: readonly LedgerEntry[]
	/** The entry by its id, or by a pair's money-in side's id. */
	entry(id: string): LedgerEntry | undefined
	/** `YYYY-MM` of the earliest entry. */
	firstMonth?: string
}

export interface LedgerInput {
	/** The transactions; tombstoned rows are skipped. */
	transactions: readonly Entity<TransactionPayload>[]
	accounts: readonly Account[]
	/** The live categories. The entries keep a row's category id as it is; #83 names it. */
	categories: readonly Category[]
	merchants: readonly Merchant[]
	/** ISO 4217. */
	home: string
	/**
	 * The live recurring charges (#79). When given, an entry keeps `recurringId` only if it names one of them whose
	 * state is not `dismissed`; without it, `recurringId` is kept as stored.
	 */
	recurring?: readonly Pick<RecurringCharge, 'id' | 'state'>[]
}

export type RowFlag =
	'pending' | 'split' | 'one-off' | 'reimbursable' | 'refund' | 'recurring' | 'bill' | 'review' | 'other-currency'
const FLAG_ORDER: readonly RowFlag[] = [
	'pending',
	'split',
	'one-off',
	'reimbursable',
	'refund',
	'recurring',
	'bill',
	'review',
	'other-currency',
]

export type LedgerRow = LedgerEntry & {
	/** As the scope sees it: a pair inside the scope shows its out side (negative), one side only shows that side. */
	amount: Money
	flags: RowFlag[]
}

/** Every field optional, all ANDed. An empty list is no filter. */
export interface TxFilter {
	/** Inclusive `YYYY-MM-DD` on `day`. */
	from?: string
	to?: string
	/** The scope: an entry matches when either side's account is listed, or belongs to a listed link. */
	accountIds?: readonly string[]
	linkIds?: readonly string[]
	/** `'none'` matches lines with no category on rows `spendingOf` counts. Only the matching lines are measured. */
	categoryIds?: readonly string[]
	merchantIds?: readonly string[]
	kinds?: readonly TxKind[]
	/** Inclusive minor units of the home currency, on the size of the shown amount. */
	atLeast?: number
	atMost?: number
	pending?: boolean
	oneOff?: true
	reimbursable?: true
	/** An entry with a `billId`. */
	bill?: true
	/** An entry with a `recurringId`. */
	recurring?: true
	/** A `spendingOf` line with no category. */
	uncategorised?: true
	review?: true
	/** Full text: each folded word must be a substring of the entry's folded text. */
	text?: string
}

export type GroupKey = 'category' | 'merchant' | 'account' | 'kind' | 'month' | 'week' | 'weekday' | 'day'
const TIME_KEYS: ReadonlySet<GroupKey> = new Set(['month', 'week', 'weekday', 'day'])

export type RowSort = 'newest' | 'oldest' | 'largest'

export interface Period {
	from: string
	to: string
}

export interface LedgerQuery {
	filter?: TxFilter
	rows?: { limit?: number; offset?: number; sort?: RowSort }
	groupBy?: readonly [GroupKey] | readonly [GroupKey, GroupKey]
	/** For `week`; Monday by default. */
	weekStart?: WeekStart
	/** The same filter over this period in place of `from`/`to`, by exactly one non-time key. */
	versus?: Period
}

export interface Measures {
	/** Entries; a pair counts once. */
	count: number
	/** The positive in-scope lines in the home currency. */
	in: Money
	/** The negative ones. */
	out: Money
	net: Money
	/** `spendingOf` over the matched lines, signed as the rows: spent money is negative. */
	spending: Money
	/** The spending of the lines not one-off, per entry that has one, rounded half away from zero. */
	average?: Money
	/** The net of the lines in any other currency, one per currency. */
	left: Money[]
}

export type LedgerGroup = Measures & { key: string[] }

export interface VersusGroup {
	key: string
	now: Measures
	then: Measures
	/** `now.net − then.net`. */
	change: Money
	/** The three biggest changes carry up to 5 of their current-period entries, largest first. */
	rows?: LedgerRow[]
}

export type LedgerAnswer = Measures & {
	rows: LedgerRow[]
	groups?: LedgerGroup[]
	versus?: VersusGroup[]
}

export class LedgerQueryError extends Error {
	constructor(readonly code: 'versus-group' | 'period' | 'amount') {
		super(`invalid ledger query: ${code}`)
		this.name = 'LedgerQueryError'
	}
}

// ---- Folding ---------------------------------------------------------------------------------------------------------

const MARKS = /\p{M}/gu
const NOT_WORD = /[^\p{L}\p{N}]+/gu

/** Lower case, NFKD, combining marks dropped, every run that is not a letter or digit one space. */
export function foldText(text: string): string {
	return text.toLowerCase().normalize('NFKD').replace(MARKS, '').replace(NOT_WORD, ' ').trim()
}

// ---- Build -------------------------------------------------------------------------------------------------------------

/** What the queries need of an entry and the page never sees. */
interface Inner {
	/** The folded text, per entry. */
	hay: string[]
	/** An account's link. */
	linkOf: Map<string, string>
}
const INNER = new WeakMap<Ledger, Inner>()

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const newest = (a: LedgerEntry, b: LedgerEntry) =>
	byText(b.day, a.day) || byText(b.datetime ?? '', a.datetime ?? '') || byText(b.id, a.id)

function lineOf(amount: Money, accountId: string, row: TransactionPayload, spending: boolean, categoryId?: string) {
	const line: LedgerLine = { amount, accountId, spending, oneOff: row.oneOff === true }
	if (categoryId) line.categoryId = categoryId
	return line
}

function textOf(row: TransactionPayload, merchant: string | undefined): string[] {
	const out = [merchant, row.name, row.merchantName, row.counterparty, row.notes]
	for (const part of row.parts ?? []) out.push(part.note)
	return out.filter((entry): entry is string => Boolean(entry))
}

/** Copies the keys of a row an entry keeps, the optional ones only when set. */
function entryOf(id: string, row: TransactionPayload, merchants: ReadonlyMap<string, string>): LedgerEntry {
	const entry: LedgerEntry = {
		id,
		accountId: row.accountId,
		day: row.day,
		pending: row.pending,
		kind: row.kind ?? (row.amount.minor > 0 ? 'refund' : 'purchase'),
		name: row.name,
		oneOff: row.oneOff === true,
		lines: [],
	}
	const merchant = row.merchantId ? merchants.get(row.merchantId) : undefined
	if (row.datetime) entry.datetime = row.datetime
	if (row.merchantId) entry.merchantId = row.merchantId
	if (merchant !== undefined) entry.merchant = merchant
	if (row.counterparty) entry.counterparty = row.counterparty
	if (row.categoryId) entry.categoryId = row.categoryId
	if (row.parts?.length) entry.parts = row.parts
	if (row.reimbursable) entry.reimbursable = row.reimbursable
	if (row.review) entry.review = row.review
	if (row.refundOf) entry.refundOf = row.refundOf
	if (row.repays) entry.repays = row.repays
	if (row.notes) entry.notes = row.notes
	if (insideAccount(row)) entry.insideAccount = true
	if (row.billId) entry.billId = row.billId
	if (row.recurringId) entry.recurringId = row.recurringId
	return entry
}

/** The ledger of the live rows: one entry per row, and one per transfer or card-payment pair. */
export function buildLedger(input: LedgerInput): Ledger {
	const live = new Map<string, TransactionPayload>()
	for (const row of input.transactions) if (!row.deletedAt) live.set(row.id, row.payload)
	const merchants = new Map(input.merchants.map((merchant) => [merchant.id, merchant.name]))
	const linkOf = new Map<string, string>()
	for (const account of input.accounts) if (account.linkId) linkOf.set(account.id, account.linkId)
	const charges = input.recurring
		? new Set(input.recurring.filter((charge) => charge.state !== 'dismissed').map((charge) => charge.id))
		: undefined
	/** A missing or dismissed charge leaves the entry with no `recurringId`. */
	const keepRecurring = (entry: LedgerEntry) => {
		if (charges && entry.recurringId && !charges.has(entry.recurringId)) delete entry.recurringId
	}

	const built: { entry: LedgerEntry; hay: string }[] = []
	const byId = new Map<string, LedgerEntry>()
	const seen = new Set<string>()
	for (const [id, row] of live) {
		if (seen.has(id)) continue
		const partner = row.transferId ? live.get(row.transferId) : undefined
		const paired =
			partner &&
			row.transferId !== id &&
			partner.transferId === id &&
			Math.sign(row.amount.minor) === -Math.sign(partner.amount.minor) &&
			row.amount.minor !== 0
		if (paired) {
			const partnerId = row.transferId!
			const [outId, out, inId, into] =
				row.amount.minor < 0 ? [id, row, partnerId, partner] : [partnerId, partner, id, row]
			seen.add(outId).add(inId)
			const entry = entryOf(outId, out, merchants)
			entry.pairId = inId
			entry.toAccountId = into.accountId
			entry.pending = out.pending || into.pending
			entry.oneOff = entry.oneOff || into.oneOff === true
			entry.merchantId ??= into.merchantId
			if (entry.merchantId && entry.merchant === undefined && merchants.has(entry.merchantId))
				entry.merchant = merchants.get(entry.merchantId)
			if (into.billId) entry.billId ??= into.billId
			if (into.recurringId) entry.recurringId ??= into.recurringId
			keepRecurring(entry)
			entry.lines = [
				lineOf(out.amount, out.accountId, out, spendingOf(out).length > 0),
				lineOf(into.amount, into.accountId, into, spendingOf(into).length > 0),
			]
			const hay = foldText([...textOf(out, entry.merchant), ...textOf(into, undefined)].join(' '))
			built.push({ entry, hay })
			byId.set(outId, entry)
			byId.set(inId, entry)
			continue
		}
		seen.add(id)
		const entry = entryOf(id, row, merchants)
		keepRecurring(entry)
		const spending = spendingOf(row).length > 0
		entry.lines = row.parts?.length
			? row.parts.map((part) => lineOf(part.amount, row.accountId, row, spending, part.categoryId))
			: [lineOf(row.amount, row.accountId, row, spending, row.categoryId)]
		built.push({ entry, hay: foldText(textOf(row, entry.merchant).join(' ')) })
		byId.set(id, entry)
	}
	built.sort((a, b) => newest(a.entry, b.entry))
	const entries = built.map((item) => item.entry)
	let firstMonth: string | undefined
	for (const entry of entries) {
		const month = entry.day.slice(0, 7)
		if (!firstMonth || month < firstMonth) firstMonth = month
	}
	const ledger: Ledger = {
		home: input.home,
		entries,
		entry: (id) => byId.get(id),
		...(firstMonth ? { firstMonth } : {}),
	}
	INNER.set(ledger, { hay: built.map((item) => item.hay), linkOf })
	return ledger
}

// ---- Measures ----------------------------------------------------------------------------------------------------------

const roundHalfAway = (value: number) => Math.sign(value) * Math.round(Math.abs(value))

/** A running sum of measures, in minor units. */
class Tally {
	count = 0
	inflow = 0
	outflow = 0
	spending = 0
	plain = 0
	plainEntries = 0
	left = new Map<string, number>()

	constructor(readonly home: string) {}

	/**
	 * One entry with the lines it adds here; a pair with both sides here, or a move inside one investment account, is
	 * a move inside the owner's money.
	 */
	add(entry: LedgerEntry, lines: readonly LedgerLine[]) {
		this.count += 1
		const inside = entry.insideAccount === true || (entry.pairId !== undefined && lines.length === 2)
		let plain = false
		for (const line of lines) {
			const { minor, currency } = line.amount
			if (currency !== this.home) {
				if (!inside) this.left.set(currency, (this.left.get(currency) ?? 0) + minor)
				continue
			}
			if (!inside) {
				if (minor > 0) this.inflow += minor
				else this.outflow += minor
			}
			if (!line.spending) continue
			this.spending += minor
			if (!line.oneOff) {
				this.plain += minor
				plain = true
			}
		}
		if (plain) this.plainEntries += 1
	}

	measures(): Measures {
		const home = this.home
		const out: Measures = {
			count: this.count,
			in: money(this.inflow, home),
			out: money(this.outflow, home),
			net: money(this.inflow + this.outflow, home),
			spending: money(this.spending, home),
			left: [...this.left]
				.filter(([, minor]) => minor !== 0)
				.sort(([a], [b]) => byText(a, b))
				.map(([currency, minor]) => money(minor, currency)),
		}
		if (this.plainEntries) out.average = money(roundHalfAway(this.plain / this.plainEntries), home)
		return out
	}
}

// ---- Matching ----------------------------------------------------------------------------------------------------------

interface Match {
	entry: LedgerEntry
	/** The lines the filter keeps: in scope, and of a listed category. */
	lines: readonly LedgerLine[]
	/** The shown amount. */
	amount: Money
}

const listed = <T>(list: readonly T[] | undefined): ReadonlySet<T> | undefined =>
	list?.length ? new Set(list) : undefined

/** The filter as a test of one entry: its matching lines and shown amount, or nothing. */
function matcher(ledger: Ledger, filter: TxFilter): (entry: LedgerEntry, at: number) => Match | undefined {
	const inner = INNER.get(ledger)!
	const accounts = listed(filter.accountIds)
	const links = listed(filter.linkIds)
	const scoped = accounts !== undefined || links !== undefined
	const inScope = (accountId: string) => {
		if (!scoped || accounts?.has(accountId)) return true
		const link = inner.linkOf.get(accountId)
		return link !== undefined && links !== undefined && links.has(link)
	}
	const categories = listed(filter.categoryIds)
	const ofCategory = (line: LedgerLine) =>
		!categories || (line.categoryId ? categories.has(line.categoryId) : line.spending && categories.has('none'))
	const merchants = listed(filter.merchantIds)
	const kinds = listed(filter.kinds)
	const words = filter.text ? foldText(filter.text).split(' ').filter(Boolean) : []
	const bounded = filter.atLeast !== undefined || filter.atMost !== undefined
	const everyLine = !scoped && !categories

	return (entry, at) => {
		if (filter.from && entry.day < filter.from) return undefined
		if (filter.to && entry.day > filter.to) return undefined
		if (filter.pending !== undefined && entry.pending !== filter.pending) return undefined
		if (filter.oneOff && !entry.oneOff) return undefined
		if (filter.reimbursable && !entry.reimbursable) return undefined
		if (filter.bill && !entry.billId) return undefined
		if (filter.recurring && !entry.recurringId) return undefined
		if (filter.review && !entry.review) return undefined
		if (merchants && !(entry.merchantId && merchants.has(entry.merchantId))) return undefined
		if (kinds && !kinds.has(entry.kind)) return undefined
		if (filter.uncategorised && !entry.lines.some((line) => line.spending && !line.categoryId)) return undefined
		const lines = everyLine ? entry.lines : entry.lines.filter((line) => inScope(line.accountId) && ofCategory(line))
		if (!lines.length) return undefined
		let amount = entry.lines[0]!.amount
		if (entry.pairId !== undefined && scoped) {
			const outIn = inScope(entry.lines[0]!.accountId)
			const inIn = inScope(entry.lines[1]!.accountId)
			if (!outIn && inIn) amount = entry.lines[1]!.amount
		} else if (entry.pairId === undefined && entry.parts) amount = sumLines(entry.lines)
		if (bounded) {
			if (amount.currency !== ledger.home) return undefined
			const size = Math.abs(amount.minor)
			if (filter.atLeast !== undefined && size < filter.atLeast) return undefined
			if (filter.atMost !== undefined && size > filter.atMost) return undefined
		}
		if (words.length) {
			const hay = inner.hay[at]!
			for (const word of words) if (!hay.includes(word)) return undefined
		}
		return { entry, lines, amount }
	}
}

/** A split row's amount: its parts sum exactly to it (`fitParts`). */
function sumLines(lines: readonly LedgerLine[]): Money {
	let minor = 0
	for (const line of lines) minor += line.amount.minor
	return money(minor, lines[0]!.amount.currency)
}

function matchAll(ledger: Ledger, filter: TxFilter): Match[] {
	const test = matcher(ledger, filter)
	const out: Match[] = []
	ledger.entries.forEach((entry, at) => {
		const found = test(entry, at)
		if (found) out.push(found)
	})
	return out
}

// ---- Rows --------------------------------------------------------------------------------------------------------------

function flagsOf(entry: LedgerEntry, home: string): RowFlag[] {
	const has: Record<RowFlag, boolean> = {
		pending: entry.pending,
		split: Boolean(entry.parts?.length),
		'one-off': entry.oneOff,
		reimbursable: Boolean(entry.reimbursable),
		refund: Boolean(entry.refundOf || entry.repays),
		recurring: Boolean(entry.recurringId),
		bill: Boolean(entry.billId),
		review: Boolean(entry.review),
		'other-currency': entry.lines.some((line) => line.amount.currency !== home),
	}
	return FLAG_ORDER.filter((flag) => has[flag])
}

const rowOf = (found: Match, home: string): LedgerRow => ({
	...found.entry,
	amount: found.amount,
	flags: flagsOf(found.entry, home),
})

/** Largest shown amount first; the matches arrive newest first and the sort is stable. */
const largestFirst = (matches: readonly Match[]) =>
	[...matches].sort((a, b) => Math.abs(b.amount.minor) - Math.abs(a.amount.minor))

function pageOf(matches: readonly Match[], options: LedgerQuery['rows'] = {}, home: string): LedgerRow[] {
	const limit = Math.min(1000, Math.max(1, Math.floor(options.limit ?? 50)))
	const offset = Math.max(0, Math.floor(options.offset ?? 0))
	const sort = options.sort ?? 'newest'
	const sorted = sort === 'largest' ? largestFirst(matches) : sort === 'oldest' ? [...matches].reverse() : matches
	return sorted.slice(offset, offset + limit).map((found) => rowOf(found, home))
}

// ---- Groups ------------------------------------------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000
const weekdayOf = (day: string) => String(((Math.floor(Date.parse(`${day}T00:00:00Z`) / DAY_MS) + 3) % 7) + 1)

function keyOf(key: GroupKey, entry: LedgerEntry, line: LedgerLine, weekStart: WeekStart): string {
	switch (key) {
		case 'category':
			return line.categoryId ?? 'none'
		case 'merchant':
			return entry.merchantId ?? 'none'
		case 'account':
			return line.accountId
		case 'kind':
			return entry.kind
		case 'month':
			return entry.day.slice(0, 7)
		case 'week':
			return weekStartOf(entry.day, weekStart)
		case 'weekday':
			return weekdayOf(entry.day)
		case 'day':
			return entry.day
	}
}

interface Bucket {
	key: string[]
	tally: Tally
	matches: Match[]
}

/** Each match's lines into buckets by their key; an entry adds to a bucket once, with its lines there. */
function bucketsOf(
	matches: readonly Match[],
	by: readonly GroupKey[],
	weekStart: WeekStart,
	home: string
): Map<string, Bucket> {
	const buckets = new Map<string, Bucket>()
	for (const found of matches) {
		const mine = new Map<string, { key: string[]; lines: LedgerLine[] }>()
		for (const line of found.lines) {
			const key = by.map((name) => keyOf(name, found.entry, line, weekStart))
			const id = key.join('\u0000')
			const held = mine.get(id)
			if (held) held.lines.push(line)
			else mine.set(id, { key, lines: [line] })
		}
		for (const [id, { key, lines }] of mine) {
			let bucket = buckets.get(id)
			if (!bucket) {
				bucket = { key, tally: new Tally(home), matches: [] }
				buckets.set(id, bucket)
			}
			bucket.tally.add(found.entry, lines)
			bucket.matches.push(found)
		}
	}
	return buckets
}

/** Time keys ascending; any other by the size of its net, descending, then by key. */
function keyOrder(name: GroupKey, nets: ReadonlyMap<string, number>) {
	if (TIME_KEYS.has(name)) return (a: string, b: string) => byText(a, b)
	return (a: string, b: string) => Math.abs(nets.get(b) ?? 0) - Math.abs(nets.get(a) ?? 0) || byText(a, b)
}

function groupsOf(matches: readonly Match[], by: readonly GroupKey[], weekStart: WeekStart, home: string) {
	const buckets = [...bucketsOf(matches, by, weekStart, home).values()].map((bucket) => ({
		...bucket,
		measures: bucket.tally.measures(),
	}))
	const firstNets = new Map<string, number>()
	for (const bucket of buckets)
		firstNets.set(bucket.key[0]!, (firstNets.get(bucket.key[0]!) ?? 0) + bucket.measures.net.minor)
	const first = keyOrder(by[0]!, firstNets)
	const second = by[1] ? by[1] : undefined
	const ownNets = new Map(buckets.map((bucket) => [bucket.key.join('\u0000'), bucket.measures.net.minor]))
	buckets.sort((a, b) => {
		const head = first(a.key[0]!, b.key[0]!)
		if (head || !second) return head
		if (TIME_KEYS.has(second)) return byText(a.key[1]!, b.key[1]!)
		const sizeA = Math.abs(ownNets.get(a.key.join('\u0000')) ?? 0)
		const sizeB = Math.abs(ownNets.get(b.key.join('\u0000')) ?? 0)
		return sizeB - sizeA || byText(a.key[1]!, b.key[1]!)
	})
	return buckets
}

// ---- Query -------------------------------------------------------------------------------------------------------------

function check(query: LedgerQuery) {
	const filter = query.filter ?? {}
	if (query.versus && (query.groupBy?.length !== 1 || TIME_KEYS.has(query.groupBy[0])))
		throw new LedgerQueryError('versus-group')
	if (filter.from && filter.to && filter.from > filter.to) throw new LedgerQueryError('period')
	if (query.versus && query.versus.from > query.versus.to) throw new LedgerQueryError('period')
	if (filter.atLeast !== undefined && filter.atMost !== undefined && filter.atLeast > filter.atMost)
		throw new LedgerQueryError('amount')
}

/**
 * The answer to a query: the measures over everything that matched, a page of rows, the groups when asked, and the
 * change against another period when asked. An invalid query throws a `LedgerQueryError`, never a partial answer.
 */
export function queryLedger(ledger: Ledger, query: LedgerQuery = {}): LedgerAnswer {
	check(query)
	const filter = query.filter ?? {}
	const home = ledger.home
	const weekStart = query.weekStart ?? 'monday'
	const matches = matchAll(ledger, filter)
	const total = new Tally(home)
	for (const found of matches) total.add(found.entry, found.lines)
	const answer: LedgerAnswer = { ...total.measures(), rows: pageOf(matches, query.rows, home) }
	if (query.groupBy?.length) {
		answer.groups = groupsOf(matches, query.groupBy, weekStart, home).map((bucket) => ({
			key: bucket.key,
			...bucket.measures,
		}))
	}
	if (query.versus) answer.versus = versusOf(ledger, query, matches)
	return answer
}

function versusOf(ledger: Ledger, query: LedgerQuery, matches: readonly Match[]): VersusGroup[] {
	const home = ledger.home
	const by = query.groupBy!
	const weekStart = query.weekStart ?? 'monday'
	const then = matchAll(ledger, { ...query.filter, from: query.versus!.from, to: query.versus!.to })
	const nowBuckets = bucketsOf(matches, by, weekStart, home)
	const thenBuckets = bucketsOf(then, by, weekStart, home)
	const empty = new Tally(home).measures()
	const keys = new Set([...nowBuckets.keys(), ...thenBuckets.keys()])
	const groups = [...keys].map((key) => {
		const now = nowBuckets.get(key)?.tally.measures() ?? empty
		const was = thenBuckets.get(key)?.tally.measures() ?? empty
		return {
			group: { key, now, then: was, change: money(now.net.minor - was.net.minor, home) } as VersusGroup,
			matches: nowBuckets.get(key)?.matches ?? [],
		}
	})
	groups.sort(
		(a, b) => Math.abs(b.group.change.minor) - Math.abs(a.group.change.minor) || byText(a.group.key, b.group.key)
	)
	return groups.map(({ group, matches: theirs }, at) =>
		at < 3
			? {
					...group,
					rows: largestFirst(theirs)
						.slice(0, 5)
						.map((found) => rowOf(found, home)),
				}
			: group
	)
}

// ---- Rollups and the typical month ------------------------------------------------------------------------------------

export type RollupKey = 'category' | 'merchant' | 'account' | 'day'
const ROLLUPS = new WeakMap<Ledger, Map<RollupKey, LedgerGroup[]>>()

/**
 * The `money-rollup` resource: month × `by` over the whole ledger, or the daily one. Computed once per ledger and
 * held on it; never stored as rows.
 */
export function rollupOf(ledger: Ledger, by: RollupKey): LedgerGroup[] {
	let held = ROLLUPS.get(ledger)
	if (!held) {
		held = new Map()
		ROLLUPS.set(ledger, held)
	}
	let groups = held.get(by)
	if (!groups) {
		groups = queryLedger(ledger, { groupBy: by === 'day' ? ['day'] : ['month', by], rows: { limit: 1 } }).groups!
		held.set(by, groups)
	}
	return groups
}

/** `YYYY-MM` some months on; negative goes back. */
export function addMonths(month: string, months: number): string {
	const [year, at] = month.split('-').map(Number) as [number, number]
	const index = year * 12 + (at - 1) + months
	return `${String(Math.floor(index / 12)).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`
}

export interface Typical {
	key: string
	/** The mean monthly spending, signed as the rows, rounded half away from zero. */
	spending: Money
}

/**
 * The typical month: per key, the mean monthly spending over the complete calendar months before `month` (the last
 * `months` of them, never before the ledger's first month), one-off lines left out. Empty with no such month. With a
 * `filter`, only the lines it keeps are measured; its `from` and `to` are ignored, since the window is the months.
 */
export function typicalOf(
	ledger: Ledger,
	options: {
		month: string
		months?: number
		groupBy?: 'category' | 'merchant' | 'account' | 'kind'
		filter?: TxFilter
	}
): Typical[] {
	const { month, months = 6, groupBy = 'category', filter } = options
	if (!ledger.firstMonth) return []
	let from = addMonths(month, -months)
	if (from < ledger.firstMonth) from = ledger.firstMonth
	const to = addMonths(month, -1)
	if (from > to) return []
	let count = 0
	for (let at = from; at <= to; at = addMonths(at, 1)) count += 1
	const sums = new Map<string, number>()
	const kept: Iterable<{ entry: LedgerEntry; lines: readonly LedgerLine[] }> = filter
		? matchAll(ledger, { ...filter, from: undefined, to: undefined })
		: ledger.entries.map((entry) => ({ entry, lines: entry.lines }))
	for (const { entry, lines } of kept) {
		const at = entry.day.slice(0, 7)
		if (at < from || at > to) continue
		for (const line of lines) {
			if (!line.spending || line.oneOff || line.amount.currency !== ledger.home) continue
			const key = keyOf(groupBy, entry, line, 'monday')
			sums.set(key, (sums.get(key) ?? 0) + line.amount.minor)
		}
	}
	return [...sums]
		.map(([key, sum]) => ({ key, spending: money(roundHalfAway(sum / count), ledger.home) }))
		.sort((a, b) => Math.abs(b.spending.minor) - Math.abs(a.spending.minor) || byText(a.key, b.key))
}

// ---- Search text and periods ------------------------------------------------------------------------------------------

const BOUND = /^(>=|<=|>|<)(.+)$/

/**
 * The search box's text: a word `>N`, `>=N`, `<N` or `<=N`, with N read as money in the currency, becomes an inclusive
 * bound in minor units (`>` and `<` are strict, so one minor unit is added or taken). Every other word stays text.
 */
export function parseSearch(
	text: string,
	currency: string,
	locale: string
): { text: string; atLeast?: number; atMost?: number } {
	const kept: string[] = []
	let atLeast: number | undefined
	let atMost: number | undefined
	for (const word of text.split(/\s+/).filter(Boolean)) {
		const found = BOUND.exec(word)
		const parsed = found ? parseMoney(found[2]!, currency, locale) : undefined
		if (!found || !parsed || 'error' in parsed) {
			kept.push(word)
			continue
		}
		const minor = parsed.minor
		if (found[1] === '>') atLeast = minor + 1
		else if (found[1] === '>=') atLeast = minor
		else if (found[1] === '<') atMost = minor - 1
		else atMost = minor
	}
	return {
		text: kept.join(' '),
		...(atLeast !== undefined ? { atLeast } : {}),
		...(atMost !== undefined ? { atMost } : {}),
	}
}

export type PeriodPreset = 'this-month' | 'last-month' | '90-days' | 'this-year'

/** A preset's inclusive days, as of `today` (`YYYY-MM-DD`). */
export function periodOf(preset: PeriodPreset, today: string): Period {
	const monthStart = `${today.slice(0, 7)}-01`
	switch (preset) {
		case 'this-month':
			return { from: monthStart, to: today }
		case 'last-month': {
			const to = addDays(monthStart, -1)
			return { from: `${to.slice(0, 7)}-01`, to }
		}
		case '90-days':
			return { from: addDays(today, -89), to: today }
		case 'this-year':
			return { from: `${today.slice(0, 4)}-01-01`, to: today }
	}
}

// ---- What a batch touched ----------------------------------------------------------------------------------------------

/**
 * The transaction ids a batch names, once each: the created transactions, the updated rows the index knows, and the
 * deleted or restored rows whose URI is a transaction's.
 */
export function touchedTransactions(ops: readonly BatchOp[], known: (id: string) => boolean): string[] {
	const ids = new Set<string>()
	for (const op of ops) {
		if (op.op === 'createEntity') {
			if (op.input.type === FINANCE.transaction && op.input.id) ids.add(op.input.id)
		} else if (op.op === 'updateEntity') {
			if (known(op.id)) ids.add(op.id)
		} else if (op.op === 'delete' || op.op === 'restore') {
			const parsed = parseUri(op.uri)
			if (parsed?.type === FINANCE.transaction) ids.add(parsed.id)
		}
	}
	return [...ids]
}
