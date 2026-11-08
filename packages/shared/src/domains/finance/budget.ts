// Orchard's budget (product/domains/finance.md §6, D-201): the lines a month reads from the `budget` rows, what each
// has spent, carried and saved, the month's totals and its income, the draft Eden works out from the owner's bills,
// recurring charges and history, and the ops that store a draft or an owner's line with the ops that take them back.
// Every figure is integer minor units in the home currency (D-188), worked out here and never by a model (finance.md
// §5). Pure: no rune module, no I/O.
import { toUri, type BatchOp } from '../../data/index.js'
import { decimalsOf, money, type Money } from '../../money/index.js'
import { payloadOf } from './accounts.js'
import { estimateOf, latestOf, seriesOf, settled } from './bills.js'
import type { Edit, Refused } from './edits.js'
import { countsInTotals } from './income.js'
import { essentialLines } from './lean.js'
import { addMonths, rollupOf, typicalOf, type Ledger, type LedgerGroup } from './ledger.js'
import { monthlyCostOf, statusOf } from './recurring.js'
import {
	FINANCE,
	type Bill,
	type Budget,
	type BudgetPayload,
	type Category,
	type IncomeCadence,
	type IncomeSource,
	type RecurringCharge,
} from './types.js'

/** The complete months a category's history is read over. */
export const HISTORY_MONTHS = 6
/** A bill repeating this many months or more is saved for as a sinking fund. */
export const SINKING_MONTHS = 3

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
/** `a ÷ b` rounded up, for positive `b`. */
const ceilDiv = (a: number, b: number) => Math.ceil(a / b)
/** Months from `from` to `to`, `YYYY-MM`; negative when `to` is earlier. */
const monthsBetween = (from: string, to: string) =>
	Number(to.slice(0, 4)) * 12 + Number(to.slice(5, 7)) - (Number(from.slice(0, 4)) * 12 + Number(from.slice(5, 7)))

// ---- Reading a month ---------------------------------------------------------------------------------------------

export type BudgetGroup = 'fixed' | 'variable' | 'sinking'

export interface BudgetLine {
	categoryId: string
	/** The category's live name. */
	name: string
	group: BudgetGroup
	/** The row the line is read from. */
	row: Budget
	amount: Money
	/** What carried in from the months before: rollover and sinking lines only; negative after overspending. */
	carried: Money
	/** The amount plus what carried in. */
	available: Money
	/** −spending in the month; a net refund is negative. */
	spent: Money
	/** Available less spent. */
	left: Money
	/** What spent passes available by. */
	over?: Money
	rollover: boolean
	sinking?: {
		target: Money
		/** `YYYY-MM`, moved on by `every` once it has passed. */
		by: string
		/** What is in the fund: left. */
		saved: Money
		/** What still has to go in each month until `by`, both ends counted; none when nothing is still needed. */
		monthly?: Money
	}
}

export interface BudgetMonth {
	month: string
	lines: BudgetLine[]
	/** Each group's lines, largest first, then by name. */
	groups: Record<BudgetGroup, BudgetLine[]>
	planned: Money
	spent: Money
	left: Money
	/** Home-currency spending in the month in categories with no line, uncategorised included. */
	unbudgeted: Money
	/** The month's ledger has amounts in other currencies, left out. */
	hasOther: boolean
}

/** Each category's latest row at or before `month`, without the ones that are `off` (D-201). */
export function linesOf(rows: readonly Budget[], month: string): Budget[] {
	const latest = new Map<string, Budget>()
	for (const row of rows) {
		if (row.month > month) continue
		const held = latest.get(row.categoryId)
		if (!held || row.month > held.month || (row.month === held.month && byText(row.id, held.id) > 0))
			latest.set(row.categoryId, row)
	}
	return [...latest.values()].filter((row) => !row.off)
}

/** The earliest month any row holds from, `YYYY-MM`; none with no rows. */
export function firstBudgetMonth(rows: readonly Budget[]): string | undefined {
	let first: string | undefined
	for (const row of rows) if (!first || row.month < first) first = row.month
	return first
}

/** What `rollupOf(ledger, 'category')` says per month: the spending by category, and the months with other currencies. */
interface SpentIndex {
	spending: Map<string, Map<string, number>>
	other: Set<string>
}
const SPENT = new WeakMap<readonly LedgerGroup[], SpentIndex>()

function spentIndex(ledger: Ledger): SpentIndex {
	const groups = rollupOf(ledger, 'category')
	let index = SPENT.get(groups)
	if (index) return index
	index = { spending: new Map(), other: new Set() }
	for (const group of groups) {
		const [month, categoryId] = group.key as [string, string]
		let held = index.spending.get(month)
		if (!held) index.spending.set(month, (held = new Map()))
		held.set(categoryId, (held.get(categoryId) ?? 0) + group.spending.minor)
		if (group.left.length) index.other.add(month)
	}
	SPENT.set(groups, index)
	return index
}

/** Spent for a category in a month: −spending, so money out is positive. */
const spentIn = (index: SpentIndex, month: string, categoryId: string) =>
	-(index.spending.get(month)?.get(categoryId) ?? 0)

/** The carry into `month` for a category: walked month by month from its earliest row (D-201). */
function carryOf(rows: readonly Budget[], categoryId: string, month: string, index: SpentIndex): number {
	const own = rows.filter((row) => row.categoryId === categoryId)
	const first = firstBudgetMonth(own)
	if (!first) return 0
	let carry = 0
	for (let at = first; at < month; at = addMonths(at, 1)) {
		const line = linesOf(own, at)[0]
		carry = line && (line.rollover || line.sinking) ? line.amount.minor + carry - spentIn(index, at, categoryId) : 0
	}
	return carry
}

/** A sinking fund's due month as of `month`: moved on by `every` while it is before it. */
function dueOf(sinking: NonNullable<Budget['sinking']>, month: string): string {
	let by = sinking.by
	if (sinking.every && sinking.every > 0) while (by < month) by = addMonths(by, sinking.every)
	return by
}

const largestFirst = (a: BudgetLine, b: BudgetLine) => b.amount.minor - a.amount.minor || byText(a.name, b.name)

/**
 * The month as the Budget tab shows it: each category's line with what it carried, spent and has left, its sinking
 * fund, the groups and the totals, and the spending outside the budget. Rollover and sinking balances are read here,
 * never stored (D-201). Lines of a category that is gone or is `income`, or not in the home currency, are left out.
 */
export function budgetMonth(input: {
	rows: readonly Budget[]
	ledger: Ledger
	categories: readonly Category[]
	month: string
}): BudgetMonth {
	const { rows, ledger, categories, month } = input
	const home = ledger.home
	const index = spentIndex(ledger)
	const byId = new Map(categories.map((category) => [category.id, category]))
	const lines: BudgetLine[] = []
	for (const row of linesOf(rows, month)) {
		const category = byId.get(row.categoryId)
		if (!category || category.group === 'income' || row.amount.currency !== home) continue
		const rollover = Boolean(row.rollover || row.sinking)
		const carried = rollover ? carryOf(rows, row.categoryId, month, index) : 0
		const available = row.amount.minor + carried
		const spent = spentIn(index, month, row.categoryId)
		const left = available - spent
		const line: BudgetLine = {
			categoryId: row.categoryId,
			name: category.name,
			group: row.sinking ? 'sinking' : category.group,
			row,
			amount: row.amount,
			carried: money(carried, home),
			available: money(available, home),
			spent: money(spent, home),
			left: money(left, home),
			rollover,
		}
		if (left < 0) line.over = money(-left, home)
		if (row.sinking) {
			const by = dueOf(row.sinking, month)
			const need = row.sinking.target.minor - carried
			const months = Math.max(1, monthsBetween(month, by) + 1)
			const monthly = need > 0 ? ceilDiv(need, months) : 0
			line.sinking = {
				target: row.sinking.target,
				by,
				saved: money(left, home),
				...(monthly > 0 ? { monthly: money(monthly, home) } : {}),
			}
		}
		lines.push(line)
	}
	const groups: Record<BudgetGroup, BudgetLine[]> = { fixed: [], variable: [], sinking: [] }
	for (const line of lines) groups[line.group].push(line)
	for (const group of Object.values(groups)) group.sort(largestFirst)
	const lined = new Set(lines.map((line) => line.categoryId))
	let unbudgeted = 0
	for (const [categoryId, spending] of index.spending.get(month) ?? [])
		if (!lined.has(categoryId)) unbudgeted -= spending
	const sum = (pick: (line: BudgetLine) => Money) =>
		money(
			lines.reduce((total, line) => total + pick(line).minor, 0),
			home
		)
	return {
		month,
		lines,
		groups,
		planned: sum((line) => line.amount),
		spent: sum((line) => line.spent),
		left: sum((line) => line.left),
		unbudgeted: money(unbudgeted, home),
		hasOther: index.other.has(month),
	}
}

// ---- Income ------------------------------------------------------------------------------------------------------

const REGULAR: readonly IncomeCadence[] = ['weekly', 'biweekly', 'semimonthly', 'monthly']

export type BudgetIncome = { amount: Money; basis: 'paychecks' } | { amount: Money; basis: 'average'; months: number }

/**
 * The income a month is planned against (D-201): the paychecks when every source that counts is regular, else the
 * trailing average, else none.
 */
export function budgetIncome(input: {
	sources: readonly IncomeSource[]
	income: { monthly: Money; average?: { average: Money; months: number } }
	home: string
}): BudgetIncome | undefined {
	const { sources, income, home } = input
	const counting = sources.filter((source) => countsInTotals(source, home))
	if (counting.length && counting.every((source) => REGULAR.includes(source.cadence)))
		return { amount: income.monthly, basis: 'paychecks' }
	if (income.average) return { amount: income.average.average, basis: 'average', months: income.average.months }
	return undefined
}

/** What is left to plan: the income less the planned lines; negative when more is planned than earned. */
export function toPlanOf(income: BudgetIncome | undefined, planned: Money): Money | undefined {
	return income ? money(income.amount.minor - planned.minor, planned.currency) : undefined
}

// ---- The draft ---------------------------------------------------------------------------------------------------

export interface DraftLine {
	categoryId: string
	amount: Money
	rollover?: true
	sinking?: { target: Money; by: string; every?: number }
}

export interface DraftInput {
	ledger: Ledger
	/** The live categories. */
	categories: readonly Category[]
	/** The live bills. */
	bills: readonly Bill[]
	/** The live recurring charges. */
	recurring: readonly RecurringCharge[]
	/** `YYYY-MM`: the month drafted. */
	month: string
	/** `YYYY-MM-DD`. */
	today: string
	/** Lean mode is on: essentials only. */
	lean: boolean
}

/** A positive amount rounded up to a whole major unit of the currency. */
function wholeUp(minor: number, currency: string): number {
	if (minor <= 0) return 0
	const unit = 10 ** decimalsOf(currency)
	return ceilDiv(minor, unit) * unit
}

/** The category of a bill's series: its newest payment's ledger entry with a transaction, first line. */
function billCategory(series: readonly Bill[], ledger: Ledger): string | undefined {
	const payments = series
		.flatMap((bill) => bill.payments ?? [])
		.filter((payment) => payment.transactionId)
		.sort((a, b) => byText(b.day, a.day) || byText(b.transactionId!, a.transactionId!))
	const newest = payments[0]
	return newest ? ledger.entry(newest.transactionId!)?.lines[0]?.categoryId : undefined
}

/**
 * The lines Eden drafts for a month from the bills, the recurring charges and a 6-month history, model-free (D-201).
 * Every live category but `income`, only the essential ones while lean mode is on.
 */
export function draftBudget(input: DraftInput): DraftLine[] {
	const { ledger, categories, bills, recurring, month, today, lean } = input
	const home = ledger.home
	const sources = new Map<string, number>()
	const candidates = new Map<string, { target: Money; by: string; every: number }[]>()
	const add = (categoryId: string, minor: number) => sources.set(categoryId, (sources.get(categoryId) ?? 0) + minor)

	const series = new Map<string, Bill[]>()
	for (const bill of bills) {
		const key = seriesOf(bill)
		series.set(key, [...(series.get(key) ?? []), bill])
	}
	for (const occurrences of series.values()) {
		const latest = latestOf(occurrences)
		if (!latest?.repeat || latest.accountId || latest.amount.currency !== home) continue
		const categoryId = billCategory(occurrences, ledger)
		if (!categoryId) continue
		const months = latest.repeat.months
		const base = latest.fixed ? latest.amount : (estimateOf(occurrences) ?? latest.amount)
		if (base.currency !== home) continue
		add(categoryId, months === 1 ? base.minor : ceilDiv(base.minor, months))
		if (months >= SINKING_MONTHS) {
			const due = (latest.due ?? latest.period).slice(0, 7)
			const by = settled(latest) ? addMonths(due, months) : due
			candidates.set(categoryId, [...(candidates.get(categoryId) ?? []), { target: base, by, every: months }])
		}
	}
	for (const charge of recurring) {
		if (statusOf(charge, today) !== 'active' || charge.billId || !charge.categoryId) continue
		if (charge.expected.currency !== home) continue
		add(charge.categoryId, monthlyCostOf(charge).minor)
	}

	const typical = new Map(
		typicalOf(ledger, { month, months: HISTORY_MONTHS }).map((entry) => [entry.key, -entry.spending.minor])
	)
	const essential = lean
		? new Map(essentialLines({ ledger, categories, today }).map((line) => [line.categoryId, line.amount.minor]))
		: undefined

	const out: DraftLine[] = []
	for (const category of categories) {
		if (category.group === 'income' || (lean && !category.essential)) continue
		const raw =
			lean && category.group === 'variable' ? (essential!.get(category.id) ?? 0) : (typical.get(category.id) ?? 0)
		const history = wholeUp(raw, home)
		const sum = sources.get(category.id)
		const amount = category.group === 'fixed' ? (sum !== undefined ? sum : history) : Math.max(history, sum ?? 0)
		if (amount <= 0) continue
		const line: DraftLine = { categoryId: category.id, amount: money(amount, home) }
		const fund = candidates.get(category.id)?.sort((a, b) => byText(a.by, b.by))[0]
		if (fund) Object.assign(line, { rollover: true, sinking: fund })
		out.push(line)
	}
	return out
}

// ---- Writing -----------------------------------------------------------------------------------------------------

export type BudgetLineError = 'budget:amount' | 'budget:target' | 'budget:category'

/** A budget write and its way back, with the rows as they will be. */
export type BudgetEdit = Edit & { saved: Budget[] }

const createOp = (row: Budget): BatchOp => ({
	op: 'createEntity',
	input: { id: row.id, type: FINANCE.budget, payload: payloadOf(row) },
})
const updateOp = (row: Budget): BatchOp => ({ op: 'updateEntity', id: row.id, payload: payloadOf(row) })
const deleteOp = (row: Budget): BatchOp => ({ op: 'delete', uri: toUri(FINANCE.budget, row.id) })

const sameMoney = (a: Money | undefined, b: Money | undefined) => a?.minor === b?.minor && a?.currency === b?.currency
const samePayload = (a: BudgetPayload, b: BudgetPayload) => JSON.stringify(a) === JSON.stringify(b)

/** Writes `payload` as the row for its month and category: updates the one there, else creates one. */
function put(rows: readonly Budget[], payload: BudgetPayload, newId: () => string, edit: BudgetEdit) {
	const was = rows.find((row) => row.month === payload.month && row.categoryId === payload.categoryId)
	if (was && samePayload(payloadOf(was), payload)) return
	const row: Budget = { ...payload, id: was?.id ?? newId() }
	edit.ops.push(was ? updateOp(row) : createOp(row))
	edit.inverse.push(was ? updateOp(was) : deleteOp(row))
	edit.saved.push(row)
}

const draftPayload = (month: string, line: DraftLine): BudgetPayload => ({
	month,
	categoryId: line.categoryId,
	amount: line.amount,
	...(line.rollover || line.sinking ? { rollover: true as const } : {}),
	...(line.sinking ? { sinking: line.sinking } : {}),
	by: 'draft',
})

/**
 * A draft's rows for a month: the owner's row for that month is kept, the draft's own is updated, the rest are made;
 * rows the draft did not produce are left alone, so a redraft never deletes (D-201). No lines, no ops.
 */
export function draftOps(rows: readonly Budget[], month: string, drafted: readonly DraftLine[], newId: () => string) {
	const edit: BudgetEdit = { ops: [], inverse: [], saved: [] }
	for (const line of drafted) {
		const was = rows.find((row) => row.month === month && row.categoryId === line.categoryId)
		if (was?.by === 'owner') continue
		put(rows, draftPayload(month, line), newId, edit)
	}
	return edit
}

/** An owner's line as the sheet hands it over, or the line it removes. */
export type LineChange =
	| {
			kind: 'save'
			categoryId?: string
			amount?: Money
			rollover: boolean
			/** Save toward a bill. */
			sinking?: { target?: Money; by: string }
	  }
	| { kind: 'remove'; categoryId: string }

/** What is wrong with a line the sheet hands over, in the fields' order. */
export function lineErrors(change: Extract<LineChange, { kind: 'save' }>): BudgetLineError[] {
	const errors: BudgetLineError[] = []
	if (!change.categoryId) errors.push('budget:category')
	if (!change.amount || change.amount.minor <= 0) errors.push('budget:amount')
	if (change.sinking && (!change.sinking.target || change.sinking.target.minor <= 0)) errors.push('budget:target')
	return errors
}

/**
 * An owner's line for a month, saved or removed, as the owner's row for that month; a sinking line always rolls over
 * and keeps the fund's `every` while its target is unchanged. Remove writes `off`. Nothing when there is nothing to
 * change.
 */
export function lineOps(
	rows: readonly Budget[],
	month: string,
	change: LineChange,
	newId: () => string
): BudgetEdit | Refused<BudgetLineError> | undefined {
	const edit: BudgetEdit = { ops: [], inverse: [], saved: [] }
	if (change.kind === 'remove') {
		const line = linesOf(rows, month).find((row) => row.categoryId === change.categoryId)
		if (!line) return undefined
		put(rows, { month, categoryId: change.categoryId, amount: line.amount, off: true, by: 'owner' }, newId, edit)
		return edit.ops.length ? edit : undefined
	}
	const [error] = lineErrors(change)
	if (error) return { error }
	const categoryId = change.categoryId!
	const was = linesOf(rows, month).find((row) => row.categoryId === categoryId)
	let sinking: BudgetPayload['sinking']
	if (change.sinking) {
		const target = change.sinking.target!
		const every = was?.sinking && sameMoney(was.sinking.target, target) ? was.sinking.every : undefined
		sinking = { target, by: change.sinking.by, ...(every ? { every } : {}) }
	}
	const payload: BudgetPayload = {
		month,
		categoryId,
		amount: change.amount!,
		...(change.rollover || sinking ? { rollover: true as const } : {}),
		...(sinking ? { sinking } : {}),
		by: 'owner',
	}
	put(rows, payload, newId, edit)
	return edit.ops.length ? edit : undefined
}
