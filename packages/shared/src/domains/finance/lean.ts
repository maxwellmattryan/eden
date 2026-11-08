// Lean mode (product/domains/finance.md §6, D-200): after a job ends, how long the owner's liquid money lasts on the
// essentials and at their usual spending, the essential categories it is spent on, and the merchants that repeat
// outside them, the things to pause. Read from the ledger (D-194) in the home currency only (D-188). Pure: no rune
// module, no I/O. "What to pause" stands in for #79's recurring charges until they land.
import { money, shareOf, type Money } from '../../money/index.js'
import { countsInTotals, monthlyOf } from './income.js'
import { addMonths, type Ledger, type LedgerEntry, type LedgerLine } from './ledger.js'
import type { Account, Category, IncomeSource } from './types.js'

/** The complete months the essentials and the usual spending are read over. */
export const ESSENTIAL_MONTHS = 6
/** The complete months a merchant must have spending in, every one, to be one to pause. */
export const PAUSE_MONTHS = 3
/** The most merchants to pause. */
export const PAUSE_MAX = 8

const LIQUID: readonly Account['kind'][] = ['checking', 'savings', 'cash']
const DAYS_PER_MONTH = 365.25 / 12
const DAY_MS = 24 * 60 * 60 * 1000

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const roundHalfAway = (value: number) => Math.sign(value) * Math.round(Math.abs(value))

export interface LeanInput {
	ledger: Ledger
	categories: readonly Category[]
	/** `YYYY-MM-DD`. */
	today: string
	/** The tax rows (`taxRowIds`): never essentials, never spending to pause. */
	exclude?: ReadonlySet<string>
}

export type RunwayInput = LeanInput & {
	accounts: readonly Account[]
	sources: readonly IncomeSource[]
	home: string
}

export type Runway =
	| {
			/** The open checking, savings and cash balances at the owner's share, less what the open cards owe. */
			liquid: Money
			/** The mean monthly essential spending, positive. */
			essentials: Money
			/** The mean monthly spending, positive. */
			usual: Money
			/** The monthly equivalent of the income sources still paying. */
			otherIncome: Money
			/** Months on the essentials, one decimal, rounded down; none when the other income covers them. */
			months?: number
			/** Months at the usual spending; none when the other income covers it. */
			usualMonths?: number
			/** About the day the money runs out on the essentials. */
			until?: string
			/** The other income covers the essentials. */
			covered: boolean
	  }
	| { reason: 'no-history' }

/** The complete months among the last `months` before today's, never before the ledger's first. */
function span(ledger: Ledger, today: string, months: number) {
	if (!ledger.firstMonth) return undefined
	const month = today.slice(0, 7)
	let from = addMonths(month, -months)
	if (from < ledger.firstMonth) from = ledger.firstMonth
	const to = addMonths(month, -1)
	if (from > to) return undefined
	let count = 0
	for (let at = from; at <= to; at = addMonths(at, 1)) count += 1
	return { from, to, count }
}

/** Each spending line in the home currency, not one-off and not a tax row, over the months. */
function eachLine(
	input: LeanInput,
	from: string,
	to: string,
	visit: (entry: LedgerEntry, line: LedgerLine, month: string) => void
) {
	const { ledger, exclude } = input
	for (const entry of ledger.entries) {
		const month = entry.day.slice(0, 7)
		if (month < from || month > to || exclude?.has(entry.id) || (entry.pairId && exclude?.has(entry.pairId))) continue
		for (const line of entry.lines) {
			if (!line.spending || line.oneOff || line.amount.currency !== ledger.home) continue
			visit(entry, line, month)
		}
	}
}

const essentialIds = (categories: readonly Category[]) =>
	new Set(categories.filter((category) => category.essential).map((category) => category.id))

/** A mean of signed spending as a positive monthly amount. */
const meanOf = (sum: number, count: number, home: string) => money(roundHalfAway(-sum / count), home)

export interface EssentialLine {
	categoryId: string
	name: string
	/** The mean monthly spending, positive. */
	amount: Money
}

/** Each essential category with a mean monthly spending above zero over the last 6 complete months, largest first. */
export function essentialLines(input: LeanInput): EssentialLine[] {
	const months = span(input.ledger, input.today, ESSENTIAL_MONTHS)
	if (!months) return []
	const essential = essentialIds(input.categories)
	const sums = new Map<string, number>()
	eachLine(input, months.from, months.to, (_entry, line) => {
		if (line.categoryId && essential.has(line.categoryId))
			sums.set(line.categoryId, (sums.get(line.categoryId) ?? 0) + line.amount.minor)
	})
	const names = new Map(input.categories.map((category) => [category.id, category.name]))
	return [...sums]
		.map(([categoryId, sum]) => ({
			categoryId,
			name: names.get(categoryId) ?? '',
			amount: meanOf(sum, months.count, input.ledger.home),
		}))
		.filter((line) => line.amount.minor > 0)
		.sort((a, b) => b.amount.minor - a.amount.minor || byText(a.name, b.name))
}

export interface PauseCandidate {
	merchantId: string
	name: string
	/** The category most of its spending is in; none for uncategorised. */
	categoryId?: string
	/** The mean monthly spending over the last 3 complete months, positive. */
	amount: Money
}

/**
 * Up to 8 merchants with spending outside the essential categories (or uncategorised) in each of the last 3 complete
 * months, with the mean over them, largest first, then by name.
 */
export function pauseCandidates(input: LeanInput): PauseCandidate[] {
	const months = span(input.ledger, input.today, PAUSE_MONTHS)
	if (!months || months.count < PAUSE_MONTHS) return []
	const essential = essentialIds(input.categories)
	const found = new Map<
		string,
		{ name: string; sum: number; byMonth: Map<string, number>; byCategory: Map<string, number> }
	>()
	eachLine(input, months.from, months.to, (entry, line, month) => {
		if (!entry.merchantId || (line.categoryId && essential.has(line.categoryId))) return
		let held = found.get(entry.merchantId)
		if (!held) {
			held = { name: entry.merchant ?? entry.name, sum: 0, byMonth: new Map(), byCategory: new Map() }
			found.set(entry.merchantId, held)
		}
		const minor = line.amount.minor
		held.sum += minor
		held.byMonth.set(month, (held.byMonth.get(month) ?? 0) + minor)
		const category = line.categoryId ?? ''
		held.byCategory.set(category, (held.byCategory.get(category) ?? 0) + minor)
	})
	const out: PauseCandidate[] = []
	for (const [merchantId, held] of found) {
		const spent = [...held.byMonth.values()].filter((sum) => sum < 0).length
		if (spent < PAUSE_MONTHS) continue
		const amount = meanOf(held.sum, PAUSE_MONTHS, input.ledger.home)
		if (amount.minor <= 0) continue
		// the category most of the money went to: the most negative sum, then the id
		const [categoryId] = [...held.byCategory].sort((a, b) => a[1] - b[1] || byText(a[0], b[0]))[0]!
		out.push({ merchantId, name: held.name, ...(categoryId ? { categoryId } : {}), amount })
	}
	return out.sort((a, b) => b.amount.minor - a.amount.minor || byText(a.name, b.name)).slice(0, PAUSE_MAX)
}

/** Months the money lasts at a monthly burn, one decimal, rounded down; 0 with no money. */
const monthsOf = (liquid: number, burn: number) => (liquid <= 0 ? 0 : Math.floor((liquid / burn) * 10) / 10)

/**
 * The runway: the liquid money over the essentials less the other income, and over the usual spending likewise,
 * with the day it runs out on the essentials; covered when the other income meets the essentials; no history while
 * the ledger has no complete month among the last 6.
 */
export function runwayOf(input: RunwayInput): Runway {
	const { ledger, home, today } = input
	const months = span(ledger, today, ESSENTIAL_MONTHS)
	if (!months) return { reason: 'no-history' }
	let liquid = 0
	for (const account of input.accounts) {
		if (account.closedOn || account.currency !== home || !account.balance || account.balance.currency !== home) continue
		const owned = shareOf(account.balance, account.share).minor
		if (LIQUID.includes(account.kind)) liquid += owned
		else if (account.kind === 'credit-card') liquid -= owned
	}
	const essential = essentialIds(input.categories)
	let essentialSum = 0
	let usualSum = 0
	eachLine(input, months.from, months.to, (_entry, line) => {
		usualSum += line.amount.minor
		if (line.categoryId && essential.has(line.categoryId)) essentialSum += line.amount.minor
	})
	let other = 0
	for (const source of input.sources) if (countsInTotals(source, home)) other += monthlyOf(source, ledger, today).minor
	const essentials = meanOf(essentialSum, months.count, home)
	const usual = meanOf(usualSum, months.count, home)
	const burn = essentials.minor - other
	const base = { liquid: money(liquid, home), essentials, usual, otherIncome: money(other, home) }
	if (burn <= 0) return { ...base, covered: true }
	const runway = monthsOf(liquid, burn)
	const usualBurn = usual.minor - other
	const until = new Date(Date.parse(`${today}T00:00:00Z`) + Math.floor(runway * DAYS_PER_MONTH) * DAY_MS)
	return {
		...base,
		covered: false,
		months: runway,
		...(usualBurn > 0 ? { usualMonths: monthsOf(liquid, usualBurn) } : {}),
		until: until.toISOString().slice(0, 10),
	}
}
