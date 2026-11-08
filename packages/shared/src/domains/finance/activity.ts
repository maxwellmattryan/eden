// Orchard's Activity (product/domains/finance.md §6, D-199): what the feed's filter chips mean, how they combine into
// one `TxFilter`, the words of a row, and the four insight cards, all answered by the ledger (D-194). Within Where,
// and within each of category, merchant and kind, any chip may match; across them every set must. Pending and Posted
// are alternatives; the other State chips all narrow. Amount bounds intersect, and When holds one chip. Pure: the
// session that holds the chips is `activity.svelte.ts`, and it lives in memory only.
import type { BarSeries, IconName } from '@eden/ui-kit'
import { addDays, weekStartOf } from '../../dates/index.js'
import { decimalsOf, money, parseMoney, type Money } from '../../money/index.js'
import type { WeekStart } from '../../types/index.js'
import {
	parseSearch,
	periodOf,
	queryLedger,
	typicalOf,
	type Ledger,
	type LedgerRow,
	type PeriodPreset,
	type TxFilter,
} from './ledger.js'
import type { TxKind } from './types.js'
import type { Translate } from './words.js'

// ---- Chips -------------------------------------------------------------------------------------------------------------

export type StateChip = 'pending' | 'posted' | 'recurring' | 'bill' | 'one-off' | 'reimbursable' | 'uncategorised'
export const STATE_CHIPS: readonly StateChip[] = [
	'pending',
	'posted',
	'recurring',
	'bill',
	'one-off',
	'reimbursable',
	'uncategorised',
]
export const PERIOD_PRESETS: readonly PeriodPreset[] = ['this-month', 'last-month', '90-days', 'this-year']

export type ActivityChip =
	| { group: 'when'; preset: PeriodPreset }
	| { group: 'when'; from: string; to: string }
	| { group: 'where'; linkId: string }
	| { group: 'where'; accountId: string }
	| { group: 'what'; categoryId: string }
	| { group: 'what'; merchantId: string }
	| { group: 'what'; kind: TxKind }
	| { group: 'amount'; side: 'over' | 'under'; minor: number }
	| { group: 'state'; state: StateChip }

/** What a chip tests, once per list: `when`, `where:account:<id>`, `what:kind:fee`, `amount:over`, `state:pending`. */
export function chipKey(chip: ActivityChip): string {
	switch (chip.group) {
		case 'when':
			return 'when'
		case 'where':
			return 'accountId' in chip ? `where:account:${chip.accountId}` : `where:link:${chip.linkId}`
		case 'what':
			if ('categoryId' in chip) return `what:category:${chip.categoryId}`
			if ('merchantId' in chip) return `what:merchant:${chip.merchantId}`
			return `what:kind:${chip.kind}`
		case 'amount':
			return `amount:${chip.side}`
		case 'state':
			return `state:${chip.state}`
	}
}

const sameChip = (a: ActivityChip, b: ActivityChip) => JSON.stringify(a) === JSON.stringify(b)

/** The list with the chip on: a When chip and each amount side replace the one there; any other is added once. */
export function withChip(chips: readonly ActivityChip[], chip: ActivityChip): ActivityChip[] {
	const key = chipKey(chip)
	const at = chips.findIndex((entry) => chipKey(entry) === key)
	if (at < 0) return [...chips, chip]
	if (chip.group !== 'when' && chip.group !== 'amount') return [...chips]
	return chips.map((entry, index) => (index === at ? chip : entry))
}

export function withoutChip(chips: readonly ActivityChip[], key: string): ActivityChip[] {
	return chips.filter((entry) => chipKey(entry) !== key)
}

/** Off when this very chip is on, else on (a different preset replaces the one there). */
export function toggledChip(chips: readonly ActivityChip[], chip: ActivityChip): ActivityChip[] {
	const key = chipKey(chip)
	const held = chips.find((entry) => chipKey(entry) === key)
	return held && sameChip(held, chip) ? withoutChip(chips, key) : withChip(chips, chip)
}

export interface KnownIds {
	accountIds: Iterable<string>
	linkIds: Iterable<string>
	categoryIds: Iterable<string>
	merchantIds: Iterable<string>
}

/** The chips whose bank, account, category or merchant still exists. */
export function liveChips(chips: readonly ActivityChip[], known: KnownIds): ActivityChip[] {
	const accounts = new Set(known.accountIds)
	const links = new Set(known.linkIds)
	const categories = new Set(known.categoryIds)
	const merchants = new Set(known.merchantIds)
	return chips.filter((chip) => {
		if ('accountId' in chip) return accounts.has(chip.accountId)
		if ('linkId' in chip) return links.has(chip.linkId)
		if ('categoryId' in chip) return categories.has(chip.categoryId)
		if ('merchantId' in chip) return merchants.has(chip.merchantId)
		return true
	})
}

export interface FilterContext {
	/** The home currency, ISO 4217: the search's bounds are read in it. */
	home: string
	locale: string
	/** `YYYY-MM-DD`: a preset's days are counted back from it. */
	today: string
}

/** The chips and the search text as one filter (D-199). */
export function filterOf(chips: readonly ActivityChip[], search: string, context: FilterContext): TxFilter {
	const filter: TxFilter = {}
	const accountIds: string[] = []
	const linkIds: string[] = []
	const categoryIds: string[] = []
	const merchantIds: string[] = []
	const kinds: TxKind[] = []
	const states = new Set<StateChip>()
	let atLeast: number | undefined
	let atMost: number | undefined
	for (const chip of chips) {
		if (chip.group === 'when') {
			const period = 'preset' in chip ? periodOf(chip.preset, context.today) : chip
			filter.from = period.from
			filter.to = period.to
		} else if ('accountId' in chip) accountIds.push(chip.accountId)
		else if ('linkId' in chip) linkIds.push(chip.linkId)
		else if ('categoryId' in chip) categoryIds.push(chip.categoryId)
		else if ('merchantId' in chip) merchantIds.push(chip.merchantId)
		else if ('kind' in chip) kinds.push(chip.kind)
		else if (chip.group === 'amount') {
			if (chip.side === 'over') atLeast = chip.minor
			else atMost = chip.minor
		} else states.add(chip.state)
	}
	if (accountIds.length) filter.accountIds = accountIds
	if (linkIds.length) filter.linkIds = linkIds
	if (categoryIds.length) filter.categoryIds = categoryIds
	if (merchantIds.length) filter.merchantIds = merchantIds
	if (kinds.length) filter.kinds = kinds

	const parsed = parseSearch(search, context.home, context.locale)
	if (parsed.text) filter.text = parsed.text
	if (parsed.atLeast !== undefined) atLeast = atLeast === undefined ? parsed.atLeast : Math.max(atLeast, parsed.atLeast)
	if (parsed.atMost !== undefined) atMost = atMost === undefined ? parsed.atMost : Math.min(atMost, parsed.atMost)
	if (atLeast !== undefined) filter.atLeast = atLeast
	if (atMost !== undefined) filter.atMost = atMost

	if (states.has('pending') !== states.has('posted')) filter.pending = states.has('pending')
	if (states.has('recurring')) filter.recurring = true
	if (states.has('bill')) filter.bill = true
	if (states.has('one-off')) filter.oneOff = true
	if (states.has('reimbursable')) filter.reimbursable = true
	if (states.has('uncategorised')) filter.uncategorised = true
	return filter
}

/** The minor units of an Over or Under field, or nothing when it does not read as more than zero. */
export function amountChipMinor(text: string, currency: string, locale: string): number | undefined {
	if (!text.trim()) return undefined
	const parsed = parseMoney(text, currency, locale)
	return 'error' in parsed || parsed.minor <= 0 ? undefined : parsed.minor
}

export interface ChipWords {
	tr: Translate
	/** A day as the page writes it (`dayLine`). */
	day: (iso: string) => string
	/** Money as the page writes it, through Hide amounts. */
	money: (amount: Money) => string
	home: string
	linkName: (id: string) => string | undefined
	accountName: (id: string) => string | undefined
	categoryName: (id: string) => string | undefined
	merchantName: (id: string) => string | undefined
}

/** A chip's words, read live so a rename shows. */
export function chipLabel(chip: ActivityChip, words: ChipWords): string {
	const { tr } = words
	if (chip.group === 'when')
		return 'preset' in chip
			? tr(`domains.finance.activity.presets.${chip.preset}`)
			: tr('domains.finance.activity.range', { values: { from: words.day(chip.from), to: words.day(chip.to) } })
	if ('linkId' in chip) return words.linkName(chip.linkId) ?? ''
	if ('accountId' in chip) return words.accountName(chip.accountId) ?? ''
	if ('categoryId' in chip) return words.categoryName(chip.categoryId) ?? ''
	if ('merchantId' in chip) return words.merchantName(chip.merchantId) ?? ''
	if ('kind' in chip) return tr(`domains.finance.txKinds.${chip.kind}`)
	if (chip.group === 'amount')
		return tr(`domains.finance.activity.chips.${chip.side}`, {
			values: { amount: words.money(money(chip.minor, words.home)) },
		})
	return tr(`domains.finance.activity.states.${chip.state}`)
}

// ---- Rows --------------------------------------------------------------------------------------------------------------

/** The glyph each kind leads its row with, as the `Domains/Orchard` mocks draw it. */
export const KIND_GLYPHS: Record<TxKind, IconName> = {
	purchase: 'shopping-bag',
	refund: 'undo-2',
	transfer: 'arrow-left-right',
	'card-payment': 'credit-card',
	'bill-payment': 'receipt',
	income: 'banknote',
	'interest-earned': 'percent',
	dividend: 'coins',
	'interest-charged': 'percent',
	fee: 'hand-coins',
	'investment-buy': 'trending-up',
	'investment-sell': 'trending-down',
}

/** Costs tint danger and money earned tints positive; everything else stays in ink. */
export function kindTone(kind: TxKind): 'cost' | 'earned' | 'plain' {
	if (kind === 'interest-charged' || kind === 'fee') return 'cost'
	if (kind === 'income' || kind === 'interest-earned' || kind === 'dividend') return 'earned'
	return 'plain'
}

/**
 * A row's title: a pair's kind in words; the counterparty, which the pass sets only behind a vague merchant such as
 * Zelle (money to someone else); else the merchant, else the provider's name.
 */
export function rowTitle(row: LedgerRow, tr: Translate): string {
	if (row.pairId !== undefined) return tr(`domains.finance.txKinds.${row.kind}`)
	return row.counterparty ?? row.merchant ?? row.name
}

export interface RowWords {
	tr: Translate
	money: (amount: Money) => string
	categoryName: (id: string) => string | undefined
}

/** A row's second line: the kind, the category (or Split), then Pending, One-off, Recurring, Part of a bill, paid back. */
export function rowWords(row: LedgerRow, words: RowWords): string {
	const { tr } = words
	const state = (key: string) => tr(`domains.finance.activity.states.${key}`)
	const out = [tr(`domains.finance.txKinds.${row.kind}`)]
	if (row.parts?.length) out.push(tr('domains.finance.activity.split'))
	else if (row.categoryId) {
		const name = words.categoryName(row.categoryId)
		if (name) out.push(name)
	}
	if (row.flags.includes('pending')) out.push(state('pending'))
	if (row.flags.includes('one-off')) out.push(state('one-off'))
	if (row.flags.includes('recurring')) out.push(state('recurring'))
	if (row.flags.includes('bill')) out.push(state('bill'))
	if (row.reimbursable)
		out.push(tr('domains.finance.activity.paidBack', { values: { amount: words.money(row.reimbursable) } }))
	return out.join(' · ')
}

/** The merchants with the most ledger entries, ties by name: the popover's merchant chips. */
export function topMerchantOptions(ledger: Ledger, limit = 12): { merchantId: string; name: string }[] {
	const counts = new Map<string, { name: string; count: number }>()
	for (const entry of ledger.entries) {
		if (!entry.merchantId || entry.merchant === undefined) continue
		const held = counts.get(entry.merchantId)
		if (held) held.count += 1
		else counts.set(entry.merchantId, { name: entry.merchant, count: 1 })
	}
	return [...counts]
		.sort(([, a], [, b]) => b.count - a.count || a.name.localeCompare(b.name))
		.slice(0, limit)
		.map(([merchantId, { name }]) => ({ merchantId, name }))
}

// ---- Insights ----------------------------------------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000
const daysIn = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) + 1

function addMonths(month: string, months: number): string {
	const [year, at] = month.split('-').map(Number) as [number, number]
	const index = year * 12 + (at - 1) + months
	return `${String(Math.floor(index / 12)).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`
}
const monthEnd = (month: string) => addDays(`${addMonths(month, 1)}-01`, -1)

/** Weeks for a period of 92 days or fewer, else months; months with no period. */
export function bucketOf(filter: TxFilter): 'week' | 'month' {
	return filter.from && filter.to && daysIn(filter.from, filter.to) <= 92 ? 'week' : 'month'
}

/** Spending as a size: spent money is negative in the ledger, and a net refund is none. */
const sizeOf = (spending: Money) => Math.max(0, -spending.minor)

export interface SpendingOptions {
	weekStart: WeekStart
	/** The third series' label. */
	otherLabel: string
	categoryName: (id: string) => string | undefined
}

/**
 * Spending over time, stacked by the two categories that spent most under the filter and everything else, as positive
 * minor units of the home currency. A period's buckets cover it whole; with none, the last 12 months that spent.
 * `labels` are the bucket keys (`YYYY-MM-DD` of a week's first day, or `YYYY-MM`). Empty when nothing was spent.
 */
export function spendingSeries(
	ledger: Ledger,
	filter: TxFilter,
	options: SpendingOptions
): { bucket: 'week' | 'month'; labels: string[]; series: BarSeries[] } {
	const bucket = bucketOf(filter)
	const groups =
		queryLedger(ledger, { filter, groupBy: [bucket, 'category'], weekStart: options.weekStart, rows: { limit: 1 } })
			.groups ?? []
	const byCategory = new Map<string, number>()
	const byBucket = new Map<string, number>()
	for (const group of groups) {
		const size = sizeOf(group.spending)
		if (!size) continue
		const [key, category] = group.key as [string, string]
		byBucket.set(key, (byBucket.get(key) ?? 0) + size)
		if (category !== 'none') byCategory.set(category, (byCategory.get(category) ?? 0) + size)
	}
	if (!byBucket.size) return { bucket, labels: [], series: [] }

	let labels: string[]
	if (filter.from && filter.to) {
		labels = []
		if (bucket === 'week')
			for (let at = weekStartOf(filter.from, options.weekStart); at <= filter.to; at = addDays(at, 7)) labels.push(at)
		else for (let at = filter.from.slice(0, 7); at <= filter.to.slice(0, 7); at = addMonths(at, 1)) labels.push(at)
	} else labels = [...byBucket.keys()].sort().slice(-12)

	const top = [...byCategory]
		.sort(([a, x], [b, y]) => y - x || (a < b ? -1 : 1))
		.slice(0, 2)
		.map(([id]) => id)
	const values = (pick: (category: string) => boolean) =>
		labels.map((label) =>
			groups
				.filter((group) => group.key[0] === label && pick(group.key[1]!))
				.reduce((sum, group) => sum + sizeOf(group.spending), 0)
		)
	const series: BarSeries[] = top.map((id) => ({
		id,
		label: options.categoryName(id) ?? id,
		values: values((category) => category === id),
	}))
	const rest = values((category) => !top.includes(category))
	if (rest.some(Boolean)) series.push({ id: 'else', label: options.otherLabel, values: rest })
	return { bucket, labels, series }
}

/** The five merchants that spent most under the filter: sizes in the home currency, the average without one-offs. */
export function topMerchants(
	ledger: Ledger,
	filter: TxFilter
): { merchantId: string; count: number; average?: Money; total: Money }[] {
	const groups = queryLedger(ledger, { filter, groupBy: ['merchant'], rows: { limit: 1 } }).groups ?? []
	return groups
		.filter((group) => group.key[0] !== 'none' && sizeOf(group.spending) > 0)
		.sort((a, b) => sizeOf(b.spending) - sizeOf(a.spending) || (a.key[0]! < b.key[0]! ? -1 : 1))
		.slice(0, 5)
		.map((group) => ({
			merchantId: group.key[0]!,
			count: group.count,
			...(group.average ? { average: money(Math.abs(group.average.minor), ledger.home) } : {}),
			total: money(sizeOf(group.spending), ledger.home),
		}))
}

/**
 * The month the period ends in (today's with none) against the typical month under the same filter (`typicalOf`):
 * per category, this month's spending, the typical one, and the change (now − typical, signed: more spent is
 * positive). Sizes in the home currency, sorted by this month's. A category with neither is left out. Nothing when no
 * complete month comes before.
 */
export function againstTypical(
	ledger: Ledger,
	filter: TxFilter,
	today: string
): { month: string; rows: { categoryId: string; now: Money; typical?: Money; change: Money }[] } | undefined {
	const month = (filter.to ?? today).slice(0, 7)
	if (!ledger.firstMonth || ledger.firstMonth >= month) return undefined
	const start = `${month}-01`
	const end = monthEnd(month)
	const from = filter.from && filter.from > start ? filter.from : start
	const to = filter.to && filter.to < end ? filter.to : end
	const now = new Map<string, number>()
	if (from <= to) {
		const groups =
			queryLedger(ledger, { filter: { ...filter, from, to }, groupBy: ['category'], rows: { limit: 1 } }).groups ?? []
		for (const group of groups) now.set(group.key[0]!, sizeOf(group.spending))
	}
	const typical = new Map(typicalOf(ledger, { month, filter }).map((entry) => [entry.key, sizeOf(entry.spending)]))
	const home = ledger.home
	const rows = [...new Set([...now.keys(), ...typical.keys()])]
		.filter((id) => (now.get(id) ?? 0) > 0 || (typical.get(id) ?? 0) > 0)
		.map((categoryId) => {
			const minor = now.get(categoryId) ?? 0
			const usual = typical.get(categoryId)
			return {
				categoryId,
				now: money(minor, home),
				...(usual ? { typical: money(usual, home) } : {}),
				change: money(minor - (usual ?? 0), home),
			}
		})
		.sort((a, b) => b.now.minor - a.now.minor || (a.categoryId < b.categoryId ? -1 : 1))
	return { month, rows }
}

/** Up to the last 12 months with matched rows, newest first: money in, money out as a size, and the net. */
export function inOutByMonth(ledger: Ledger, filter: TxFilter): { month: string; in: Money; out: Money; net: Money }[] {
	const groups = queryLedger(ledger, { filter, groupBy: ['month'], rows: { limit: 1 } }).groups ?? []
	return groups
		.filter((group) => group.count > 0)
		.slice(-12)
		.reverse()
		.map((group) => ({
			month: group.key[0]!,
			in: group.in,
			out: money(Math.abs(group.out.minor), ledger.home),
			net: group.net,
		}))
}

// ---- Words for figures ---------------------------------------------------------------------------------------------------

/** Whole money for a chart's axis and readout: "$1,204". */
export function wholeMoney(minor: number, currency: string, locale: string): string {
	const major = Math.round(minor / 10 ** decimalsOf(currency))
	return new Intl.NumberFormat(locale, {
		style: 'currency',
		currency,
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	}).format(major)
}

/** A `YYYY-MM` month in words: "October 2026" (`long`), "Oct" (`short`). */
export function monthLine(month: string, lang: string, style: 'long' | 'short' = 'long'): string {
	const [year, at] = month.split('-').map(Number) as [number, number]
	const options: Intl.DateTimeFormatOptions =
		style === 'long' ? { month: 'long', year: 'numeric', timeZone: 'UTC' } : { month: 'short', timeZone: 'UTC' }
	return new Intl.DateTimeFormat(lang, options).format(Date.UTC(year, at - 1, 1))
}
