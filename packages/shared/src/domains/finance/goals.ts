// Orchard's goals (product/domains/finance.md §6, "Goals (#88)", D-203): what each goal in an account holds when the
// goals fill its balance in their order, the recent pace and the month each is reached at it, the monthly a date asks,
// an emergency fund in months of essentials, the savings rate, the dips under a goal's high-water mark, and the ops
// that store an owner's change with the ops that take it back. Every figure is integer minor units worked out here,
// never by a model (finance.md §5), and nothing that holds is stored but `high`, the goal pass's key. Pure: no rune
// module, no I/O.
import { toUri, type BatchOp } from '../../data/index.js'
import { money, shareOf, type Money } from '../../money/index.js'
import { payloadOf } from './accounts.js'
import type { Edit, Refused } from './edits.js'
import { completeMonths } from './income.js'
import { essentialLines } from './lean.js'
import { addMonths, foldText, type Ledger } from './ledger.js'
import { FINANCE, isDebt, type Account, type Category, type SavingsGoal } from './types.js'

/** The complete months an account's pace is read over. */
export const PACE_MONTHS = 3
/** The complete months the savings rate is read over. */
export const RATE_MONTHS = 3
/** The longest goal name. */
export const GOAL_NAME_MAX = 60
/** The months an emergency fund may be sized at, and the one it starts on. */
export const EMERGENCY_MONTHS = { min: 1, max: 12, initial: 6 } as const
/** The whole percents a savings-rate target may be. */
export const RATE_PERCENT = { min: 1, max: 99 } as const

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const roundHalfAway = (value: number) => Math.sign(value) * Math.round(Math.abs(value))
/** Months from `from` to `to`, `YYYY-MM`; negative when `to` is earlier. */
const monthsBetween = (from: string, to: string) =>
	Number(to.slice(0, 4)) * 12 + Number(to.slice(5, 7)) - (Number(from.slice(0, 4)) * 12 + Number(from.slice(5, 7)))

/** A target or an emergency fund that is not closed: one that takes a share of its account. */
export const isOpenGoal = (goal: SavingsGoal) => goal.kind !== 'rate' && !goal.closedOn
const byOrder = (a: SavingsGoal, b: SavingsGoal) => (a.order ?? 0) - (b.order ?? 0) || byText(a.id, b.id)

/** The open goals of an account, in their fill order. */
function openIn(goals: readonly SavingsGoal[], accountId: string | undefined): SavingsGoal[] {
	return goals.filter((goal) => isOpenGoal(goal) && goal.accountId === accountId).sort(byOrder)
}

/** An account that can hold an earmark: open and not a debt. */
export const canEarmark = (account: Account | undefined): account is Account =>
	Boolean(account && !account.closedOn && !isDebt(account.kind))

/** What of an account's balance is the owner's, in its currency; none when it cannot hold an earmark or has no balance. */
function ownedOf(account: Account | undefined): number | undefined {
	if (!canEarmark(account) || !account.balance || account.balance.currency !== account.currency) return undefined
	return shareOf(account.balance, account.share).minor
}

/** The fill of one account: what each goal takes, in order, and what is left over. */
function fill(account: Account | undefined, list: readonly SavingsGoal[]) {
	const owned = ownedOf(account)
	let rest = Math.max(0, owned ?? 0)
	const taken = new Map<string, Money>()
	for (const goal of list) {
		const target = goal.target
		if (!target) continue
		const usable = account && account.currency === target.currency ? rest : 0
		const take = Math.min(usable, Math.max(0, target.minor))
		rest -= take
		taken.set(goal.id, money(take, target.currency))
	}
	return { owned, taken, rest }
}

/**
 * What each open goal holds (D-203): the goals in one account fill its balance at the owner's share in their order,
 * lowest first, each taking what is left clamped between 0 and its target. A goal in a closed, debt or gone account
 * holds 0.
 */
export function savedOf(goals: readonly SavingsGoal[], accounts: readonly Account[]): Map<string, Money> {
	const out = new Map<string, Money>()
	const ids = new Set(goals.filter(isOpenGoal).map((goal) => goal.accountId ?? ''))
	for (const accountId of ids) {
		const account = accounts.find((entry) => entry.id === accountId)
		for (const [id, taken] of fill(account, openIn(goals, accountId)).taken) out.set(id, taken)
	}
	return out
}

/**
 * An account's recent pace (D-203): the mean net money into it over the complete months among the last 3 before
 * today's, every line on it in its currency (transfers in and interest count), at the owner's share. None with no
 * complete month.
 */
export function paceOf(ledger: Ledger, account: Account, today: string): Money | undefined {
	const span = completeMonths(ledger, today.slice(0, 7), PACE_MONTHS)
	if (!span) return undefined
	let sum = 0
	for (const entry of ledger.entries) {
		const at = entry.day.slice(0, 7)
		// newest first: nothing older can be in the span
		if (at < span.from) break
		if (at > span.to || entry.insideAccount) continue
		for (const line of entry.lines)
			if (line.accountId === account.id && line.amount.currency === account.currency) sum += line.amount.minor
	}
	return shareOf(money(roundHalfAway(sum / span.count), account.currency), account.share)
}

/** The months from `month` to `by` with both ends counted; 0 or less once `by` has passed. */
export const monthsLeft = (month: string, by: string) => monthsBetween(month, by) + 1

/** What `left` asks each month over `months`, rounded up to a minor unit; none when nothing is left or no month is. */
export function goalMonthly(left: Money, months: number): Money | undefined {
	if (left.minor <= 0 || months <= 0) return undefined
	return money(Math.ceil(left.minor / months), left.currency)
}

/**
 * The month the owned balance covers `cumulative` at `pace` a month: this month when it does now, else the first month
 * after; none with no pace above zero.
 */
export function reachMonthOf(owned: number, cumulative: number, pace: Money | undefined, month: string) {
	if (owned >= cumulative) return month
	if (!pace || pace.minor <= 0) return undefined
	return addMonths(month, Math.ceil((cumulative - owned) / pace.minor))
}

/** The essentials' monthly mean, the sum of `essentialLines`; none with no essentials history. */
export function essentialsOf(input: {
	ledger: Ledger
	categories: readonly Category[]
	today: string
	exclude?: ReadonlySet<string>
}): Money | undefined {
	const lines = essentialLines(input)
	const sum = lines.reduce((total, line) => total + line.amount.minor, 0)
	return sum > 0 ? money(sum, input.ledger.home) : undefined
}

/** An emergency fund's target: `months` of the essentials' monthly mean. */
export const emergencyTarget = (essentials: Money, months: number) =>
	money(essentials.minor * months, essentials.currency)

/** The months of essentials `saved` covers, one decimal, rounded down. */
export const coversOf = (saved: Money, essentials: Money) =>
	Math.floor((Math.max(0, saved.minor) * 10) / essentials.minor) / 10

// ---- The savings rate --------------------------------------------------------------------------------------------

export interface SavingsRate {
	/** Whole percent, half away from zero, possibly negative; none with no income in the span. */
	rate?: number
	/** The complete months in the span, oldest first, each with its own rate when it had income. */
	months: { month: string; rate?: number }[]
	income: Money
	spending: Money
}

const rateOf = (income: number, spending: number) =>
	income > 0 ? roundHalfAway(((income - spending) * 100) / income) : undefined

/**
 * The savings rate (D-203): (income − spending) ÷ income over the complete months among the last 3, and per month.
 * Income is the home-currency lines of `income` entries, one-offs included, the tax rows (`exclude`, or a "tax ref"
 * name) left out as `incomeAverage` leaves them; spending is the negated sum of the `spending` lines. None with no
 * complete month.
 */
export function savingsRateOf(ledger: Ledger, today: string, exclude?: ReadonlySet<string>): SavingsRate | undefined {
	const span = completeMonths(ledger, today.slice(0, 7), RATE_MONTHS)
	if (!span) return undefined
	const home = ledger.home
	const byMonth = new Map<string, { income: number; spending: number }>()
	for (let at = span.from; at <= span.to; at = addMonths(at, 1)) byMonth.set(at, { income: 0, spending: 0 })
	for (const entry of ledger.entries) {
		const at = entry.day.slice(0, 7)
		if (at < span.from) break
		const held = byMonth.get(at)
		if (!held) continue
		const taxed = exclude?.has(entry.id) || foldText(entry.name).includes('tax ref')
		for (const line of entry.lines) {
			if (line.amount.currency !== home) continue
			if (entry.kind === 'income' && !taxed) held.income += line.amount.minor
			if (line.spending) held.spending -= line.amount.minor
		}
	}
	let income = 0
	let spending = 0
	const months: SavingsRate['months'] = []
	for (const [month, held] of byMonth) {
		income += held.income
		spending += held.spending
		const rate = rateOf(held.income, held.spending)
		months.push(rate === undefined ? { month } : { month, rate })
	}
	const rate = rateOf(income, spending)
	return {
		...(rate === undefined ? {} : { rate }),
		months,
		income: money(income, home),
		spending: money(spending, home),
	}
}

// ---- Reading the goals -------------------------------------------------------------------------------------------

export interface GoalRow {
	goal: SavingsGoal
	saved: Money
	/** The target less saved, never below 0. */
	left: Money
	reached: boolean
	/** Dated, not reached and not past: what is left over the months to `by`. */
	monthly?: Money
	/** `by` is before this month and the goal is not reached. */
	past: boolean
	/** The month it is reached at the account's recent pace. */
	reachMonth?: string
	/** The reach month is after `by`. */
	behind: boolean
	/** An emergency fund: the months of essentials it covers. */
	covers?: number
	/** Saved is at least 1% of the target under `high`. */
	dip?: { amount: Money; from: Money; day: string }
	/** The dip over the months to `rebuildBy`. */
	rebuildMonthly?: Money
	accountState: 'open' | 'closed' | 'gone'
	/** The first or the last in its account's order. */
	first: boolean
	last: boolean
}

export interface GoalGroup {
	accountId: string
	/** None when the account is gone. */
	account?: Account
	/** What of the owned balance no goal holds, when above 0. */
	notEarmarked?: Money
	/** The sum of the monthlies, when two or more goals have one. */
	sharedMonthly?: Money
	rows: GoalRow[]
}

export interface GoalsView {
	rate?: SavingsRate
	/** The live savings-rate target. */
	rateGoal?: SavingsGoal
	totals: {
		saved: Money
		toGo: Money
		monthly: Money
		/** The currencies of goals left out of the totals. */
		left: string[]
	}
	groups: GoalGroup[]
	/** The closed goals, newest first. */
	done: SavingsGoal[]
	/** The essentials' monthly mean. */
	essentials?: Money
	/** A target or an emergency fund exists, open or closed. */
	hasGoals: boolean
	/** An emergency fund is open. */
	emergencyOpen: boolean
}

/** The smallest drop that reads as a dip: 1% of the target rounded up, at least one minor unit. */
const dipFloor = (target: Money) => Math.max(1, Math.ceil(target.minor / 100))

/**
 * The Goals tab as it reads (D-203). `accounts` comes in the Accounts tab's order and the groups follow it, a gone
 * account's goals last.
 */
export function goalsOf(input: {
	goals: readonly SavingsGoal[]
	accounts: readonly Account[]
	ledger: Ledger
	categories: readonly Category[]
	today: string
	home: string
	exclude?: ReadonlySet<string>
}): GoalsView {
	const { goals, accounts, ledger, categories, today, home, exclude } = input
	const month = today.slice(0, 7)
	const essentials = essentialsOf({ ledger, categories, today, exclude })
	const open = goals.filter(isOpenGoal)
	const ids = [...new Set(open.map((goal) => goal.accountId ?? ''))]
	const position = (id: string) => {
		const at = accounts.findIndex((account) => account.id === id)
		return at < 0 ? accounts.length : at
	}
	ids.sort((a, b) => position(a) - position(b) || byText(a, b))

	const groups: GoalGroup[] = []
	for (const accountId of ids) {
		const account = accounts.find((entry) => entry.id === accountId)
		const state = !account ? 'gone' : account.closedOn || isDebt(account.kind) ? 'closed' : 'open'
		const list = openIn(goals, accountId)
		const { owned, taken, rest } = fill(account, list)
		const pace = state === 'open' && account ? paceOf(ledger, account, today) : undefined
		let cumulative = 0
		const rows = list.map((goal, at): GoalRow => {
			const target = goal.target ?? money(0, account?.currency ?? home)
			cumulative += Math.max(0, target.minor)
			const saved = taken.get(goal.id) ?? money(0, target.currency)
			const left = money(Math.max(0, target.minor - saved.minor), target.currency)
			const reached = target.minor > 0 && left.minor === 0
			const row: GoalRow = {
				goal,
				saved,
				left,
				reached,
				past: false,
				behind: false,
				accountState: state,
				first: at === 0,
				last: at === list.length - 1,
			}
			if (state !== 'open') return row
			if (goal.by && !reached) {
				const months = monthsLeft(month, goal.by)
				if (months <= 0) row.past = true
				else {
					const monthly = goalMonthly(left, months)
					if (monthly) row.monthly = monthly
				}
			}
			if (!reached && owned !== undefined) {
				const reach = reachMonthOf(owned, cumulative, pace, month)
				if (reach && reach > month) {
					row.reachMonth = reach
					row.behind = Boolean(goal.by && !row.past && reach > goal.by)
				}
			}
			if (goal.kind === 'emergency' && essentials && saved.currency === essentials.currency)
				row.covers = coversOf(saved, essentials)
			const high = goal.high
			if (high && high.amount.currency === saved.currency) {
				const drop = high.amount.minor - saved.minor
				if (drop >= dipFloor(target)) {
					row.dip = { amount: money(drop, saved.currency), from: high.amount, day: high.day }
					if (goal.rebuildBy) {
						const monthly = goalMonthly(row.dip.amount, Math.max(1, monthsLeft(month, goal.rebuildBy)))
						if (monthly) row.rebuildMonthly = monthly
					}
				}
			}
			return row
		})
		const group: GoalGroup = { accountId, rows, ...(account ? { account } : {}) }
		if (state === 'open' && rest > 0 && account) group.notEarmarked = money(rest, account.currency)
		const monthlies = rows.filter((row) => row.monthly)
		if (monthlies.length >= 2)
			group.sharedMonthly = money(
				monthlies.reduce((total, row) => total + row.monthly!.minor, 0),
				monthlies[0]!.monthly!.currency
			)
		groups.push(group)
	}

	let saved = 0
	let toGo = 0
	let monthly = 0
	const left = new Set<string>()
	for (const row of groups.flatMap((group) => group.rows)) {
		if (row.saved.currency !== home) {
			left.add(row.saved.currency)
			continue
		}
		saved += row.saved.minor
		toGo += row.left.minor
		monthly += row.monthly?.minor ?? 0
	}

	const done = goals
		.filter((goal) => goal.kind !== 'rate' && goal.closedOn)
		.sort((a, b) => byText(b.closedOn!, a.closedOn!) || byText(b.id, a.id))
	const rate = savingsRateOf(ledger, today, exclude)
	const rateGoal = goals.find((goal) => goal.kind === 'rate' && !goal.closedOn)
	return {
		...(rate ? { rate } : {}),
		...(rateGoal ? { rateGoal } : {}),
		totals: {
			saved: money(saved, home),
			toGo: money(toGo, home),
			monthly: money(monthly, home),
			left: [...left].sort(),
		},
		groups,
		done,
		...(essentials ? { essentials } : {}),
		hasGoals: goals.some((goal) => goal.kind !== 'rate'),
		emergencyOpen: open.some((goal) => goal.kind === 'emergency'),
	}
}

/**
 * What a goal the sheet holds would ask a month: it takes its place in the account (last, when new or moved there)
 * and what is left over the months to `by`. None with no account, target or date, or once reached.
 */
export function goalPreview(
	goals: readonly SavingsGoal[],
	accounts: readonly Account[],
	draft: { id?: string; accountId?: string; target?: Money; by?: string },
	month: string
): Money | undefined {
	const { accountId, target, by } = draft
	if (!accountId || !target || target.minor <= 0 || !by) return undefined
	const was = draft.id ? goals.find((goal) => goal.id === draft.id) : undefined
	const id = was?.id ?? '\u0000draft'
	const order = was && was.accountId === accountId && !was.closedOn ? was.order : nextOrder(goals, accountId, id)
	const kept = goals.filter((goal) => goal.id !== id)
	const held = savedOf([...kept, { id, kind: 'target', accountId, target, order }], accounts).get(id)
	return goalMonthly(money(target.minor - (held?.minor ?? 0), target.currency), monthsLeft(month, by))
}

// ---- Writing -----------------------------------------------------------------------------------------------------

export type GoalError = 'goal:name' | 'goal:account' | 'goal:target' | 'goal:months' | 'goal:rate' | 'goal:emergency'

/** A target or an emergency fund as the sheet hands it over; `id` to change one. */
export interface GoalDraft {
	id?: string
	kind: 'target' | 'emergency'
	name?: string
	accountId?: string
	target?: Money
	months?: number
	/** `YYYY-MM`. */
	by?: string
}

/**
 * What is wrong with a goal or a rate the sheet hands over, in the fields' order: a name empty or over 60
 * characters, an account missing, closed, gone or a debt, a target that is not above 0 in the account's currency,
 * months outside 1–12, a rate outside 1–99, and a second open emergency fund.
 */
export function goalErrors(
	draft: GoalDraft | { kind: 'rate'; rate?: number },
	context: { accounts: readonly Account[]; goals?: readonly SavingsGoal[] }
): GoalError[] {
	if (draft.kind === 'rate') {
		const rate = draft.rate
		const ok = rate !== undefined && Number.isInteger(rate) && rate >= RATE_PERCENT.min && rate <= RATE_PERCENT.max
		return ok ? [] : ['goal:rate']
	}
	const errors: GoalError[] = []
	const name = draft.name?.trim() ?? ''
	if (!name || name.length > GOAL_NAME_MAX) errors.push('goal:name')
	const account = context.accounts.find((entry) => entry.id === draft.accountId)
	if (!canEarmark(account)) errors.push('goal:account')
	if (!draft.target || draft.target.minor <= 0 || (account && draft.target.currency !== account.currency))
		errors.push('goal:target')
	if (draft.kind === 'emergency') {
		const months = draft.months
		if (
			months === undefined ||
			!Number.isInteger(months) ||
			months < EMERGENCY_MONTHS.min ||
			months > EMERGENCY_MONTHS.max
		)
			errors.push('goal:months')
		const other = context.goals?.some((goal) => isOpenGoal(goal) && goal.kind === 'emergency' && goal.id !== draft.id)
		if (other) errors.push('goal:emergency')
	}
	return errors
}

/** A goal write and its way back, with the rows as they will be and the ids it deletes. */
export type GoalEdit = Edit & { saved: SavingsGoal[]; deleted: string[] }

const uriOf = (row: SavingsGoal) => toUri(FINANCE.goal, row.id)
const createOp = (row: SavingsGoal): BatchOp => ({
	op: 'createEntity',
	input: { id: row.id, type: FINANCE.goal, payload: payloadOf(row) },
})
const updateOp = (row: SavingsGoal): BatchOp => ({ op: 'updateEntity', id: row.id, payload: payloadOf(row) })

/** Deep equality of two stored values, an absent key and an undefined one alike. */
function same(a: unknown, b: unknown): boolean {
	if (a === b) return true
	if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false
	const keys = (value: object) =>
		Object.keys(value).filter((key) => (value as Record<string, unknown>)[key] !== undefined)
	const ka = keys(a)
	const kb = keys(b)
	return (
		ka.length === kb.length &&
		ka.every((key) => same((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]))
	)
}

/** The writes that turn `before` into `after`, with their way back. */
function diffOf(before: readonly SavingsGoal[], after: readonly SavingsGoal[]): GoalEdit {
	const edit: GoalEdit = { ops: [], inverse: [], saved: [], deleted: [] }
	const was = new Map(before.map((row) => [row.id, row]))
	const kept = new Set(after.map((row) => row.id))
	for (const row of after) {
		const old = was.get(row.id)
		if (old && same(old, row)) continue
		edit.ops.push(old ? updateOp(row) : createOp(row))
		edit.inverse.push(old ? updateOp(old) : { op: 'delete', uri: uriOf(row) })
		edit.saved.push(row)
	}
	for (const row of before) {
		if (kept.has(row.id)) continue
		edit.ops.push({ op: 'delete', uri: uriOf(row) })
		edit.inverse.push({ op: 'restore', uri: uriOf(row) })
		edit.deleted.push(row.id)
	}
	return edit
}

const orNothing = (edit: GoalEdit) => (edit.ops.length ? edit : undefined)

/** A row without the keys named, so none is left as undefined. */
function without<K extends keyof SavingsGoal>(row: SavingsGoal, ...keys: K[]): SavingsGoal {
	const out = { ...row }
	for (const key of keys) delete out[key]
	return out
}

/** The order after the last open goal of an account, leaving `except` out. */
function nextOrder(goals: readonly SavingsGoal[], accountId: string, except?: string): number {
	const orders = openIn(goals, accountId)
		.filter((goal) => goal.id !== except)
		.map((goal) => goal.order ?? 0)
	return orders.length ? Math.max(...orders) + 1 : 0
}

/**
 * The high-water reset every owner change makes (D-203): each open goal in the accounts named takes `high` at what it
 * holds now, with `today`, and drops `rebuildBy`, so re-earmarking never reads as a dip. A goal already there is left.
 */
export function resetHighs(
	goals: readonly SavingsGoal[],
	accounts: readonly Account[],
	accountIds: Iterable<string | undefined>,
	today: string
): SavingsGoal[] {
	const ids = new Set(accountIds)
	const saved = savedOf(goals, accounts)
	return goals.map((goal) => {
		if (!isOpenGoal(goal) || !goal.accountId || !ids.has(goal.accountId)) return goal
		const now = saved.get(goal.id)
		if (!now) return goal
		if (!goal.rebuildBy && goal.high && same(goal.high.amount, now)) return goal
		return { ...without(goal, 'rebuildBy'), high: { amount: now, day: today } }
	})
}

const replaced = (goals: readonly SavingsGoal[], next: SavingsGoal) =>
	goals.map((goal) => (goal.id === next.id ? next : goal))

/**
 * A target or an emergency fund saved, new or changed. A new goal, or one moved to another account, goes last there;
 * editing keeps the kind. A change of account, target or order resets the highs of the accounts it touches.
 */
export function saveGoalOps(
	rows: readonly SavingsGoal[],
	accounts: readonly Account[],
	draft: GoalDraft,
	today: string,
	newId: () => string
): GoalEdit | Refused<GoalError> | undefined {
	const was = draft.id ? rows.find((row) => row.id === draft.id && row.kind !== 'rate') : undefined
	if (draft.id && !was) return undefined
	const kind = (was?.kind ?? draft.kind) as GoalDraft['kind']
	const [error] = goalErrors({ ...draft, kind }, { accounts, goals: rows })
	if (error) return { error }
	const accountId = draft.accountId!
	const target = draft.target!
	const moved = !was || was.accountId !== accountId
	const order = moved && !was?.closedOn ? nextOrder(rows, accountId, was?.id) : was?.order
	const next: SavingsGoal = {
		...without(was ?? { id: newId(), kind }, 'months', 'by', 'order'),
		kind,
		name: draft.name!.trim(),
		accountId,
		target,
		...(kind === 'emergency' ? { months: draft.months! } : {}),
		...(draft.by ? { by: draft.by } : {}),
		...(order !== undefined ? { order } : {}),
	}
	let after = was ? replaced(rows, next) : [...rows, next]
	if (moved || !same(was?.target, target) || was?.order !== order)
		after = resetHighs(after, accounts, [accountId, was?.accountId], today)
	return orNothing(diffOf(rows, after))
}

/** A goal one place up or down in its account's order; nothing at the end it moves toward. */
export function moveGoalOps(
	rows: readonly SavingsGoal[],
	accounts: readonly Account[],
	id: string,
	direction: 'up' | 'down',
	today: string
): GoalEdit | undefined {
	const goal = rows.find((row) => row.id === id && isOpenGoal(row))
	if (!goal) return undefined
	const list = openIn(rows, goal.accountId)
	const at = list.indexOf(goal)
	const to = direction === 'up' ? at - 1 : at + 1
	if (to < 0 || to >= list.length) return undefined
	;[list[at], list[to]] = [list[to]!, list[at]!]
	const orders = new Map(list.map((entry, index) => [entry.id, index]))
	let after = rows.map((row) => {
		const order = orders.get(row.id)
		return order === undefined || row.order === order ? row : { ...row, order }
	})
	after = resetHighs(after, accounts, [goal.accountId], today)
	return orNothing(diffOf(rows, after))
}

/** An open goal closed, as bought or plainly; its earmark passes to the goals after it. */
export function closeGoalOps(
	rows: readonly SavingsGoal[],
	accounts: readonly Account[],
	id: string,
	as: 'bought' | 'closed',
	today: string
): GoalEdit | undefined {
	const goal = rows.find((row) => row.id === id && isOpenGoal(row))
	if (!goal) return undefined
	const next: SavingsGoal = { ...without(goal, 'rebuildBy'), closedOn: today, closedAs: as }
	const after = resetHighs(replaced(rows, next), accounts, [goal.accountId], today)
	return orNothing(diffOf(rows, after))
}

/** A closed goal open again, last in its account; nothing for an emergency fund while another is open. */
export function reopenGoalOps(
	rows: readonly SavingsGoal[],
	accounts: readonly Account[],
	id: string,
	today: string
): GoalEdit | undefined {
	const goal = rows.find((row) => row.id === id && row.kind !== 'rate' && row.closedOn)
	if (!goal) return undefined
	if (goal.kind === 'emergency' && rows.some((row) => isOpenGoal(row) && row.kind === 'emergency')) return undefined
	const next: SavingsGoal = {
		...without(goal, 'closedOn', 'closedAs', 'rebuildBy'),
		order: nextOrder(rows, goal.accountId ?? '', goal.id),
	}
	const after = resetHighs(replaced(rows, next), accounts, [goal.accountId], today)
	return orNothing(diffOf(rows, after))
}

/** A goal deleted; an open one's account has its highs reset. */
export function deleteGoalOps(
	rows: readonly SavingsGoal[],
	accounts: readonly Account[],
	id: string,
	today: string
): GoalEdit | undefined {
	const goal = rows.find((row) => row.id === id)
	if (!goal) return undefined
	let after = rows.filter((row) => row.id !== id)
	if (isOpenGoal(goal)) after = resetHighs(after, accounts, [goal.accountId], today)
	return orNothing(diffOf(rows, after))
}

/** The owner's rebuild plan for a dipped goal, `YYYY-MM`; none clears it. */
export function rebuildOps(rows: readonly SavingsGoal[], id: string, by: string | undefined): GoalEdit | undefined {
	const goal = rows.find((row) => row.id === id && isOpenGoal(row))
	if (!goal) return undefined
	const next = by ? { ...goal, rebuildBy: by } : without(goal, 'rebuildBy')
	return orNothing(diffOf(rows, replaced(rows, next)))
}

/** Start from here: the goal's high is what it holds now, today, and its rebuild plan is cleared. */
export function startFromHereOps(
	rows: readonly SavingsGoal[],
	accounts: readonly Account[],
	id: string,
	today: string
): GoalEdit | undefined {
	const goal = rows.find((row) => row.id === id && isOpenGoal(row))
	const now = goal ? savedOf(rows, accounts).get(goal.id) : undefined
	if (!goal || !now) return undefined
	const next: SavingsGoal = { ...without(goal, 'rebuildBy'), high: { amount: now, day: today } }
	return orNothing(diffOf(rows, replaced(rows, next)))
}

/** The savings-rate target, a whole percent, set or changed; none removes it. There is one live at most. */
export function rateOps(
	rows: readonly SavingsGoal[],
	rate: number | undefined,
	newId: () => string
): GoalEdit | Refused<GoalError> | undefined {
	const live = rows.find((row) => row.kind === 'rate' && !row.closedOn)
	if (rate === undefined)
		return live
			? orNothing(
					diffOf(
						rows,
						rows.filter((row) => row !== live)
					)
				)
			: undefined
	const [error] = goalErrors({ kind: 'rate', rate }, { accounts: [] })
	if (error) return { error }
	const next: SavingsGoal = { ...(live ?? { id: newId(), kind: 'rate' }), rate: rate * 100 }
	return orNothing(diffOf(rows, live ? replaced(rows, next) : [...rows, next]))
}

/**
 * The goal pass (D-203): each open goal in an open account takes `high` when it holds more than it (or has none), with
 * today, and drops `rebuildBy` once it holds its high again. It writes nothing else.
 */
export function goalPassOps(rows: readonly SavingsGoal[], accounts: readonly Account[], today: string): GoalEdit {
	const saved = savedOf(rows, accounts)
	const after = rows.map((goal) => {
		if (!isOpenGoal(goal) || !canEarmark(accounts.find((account) => account.id === goal.accountId))) return goal
		const now = saved.get(goal.id)
		if (!now) return goal
		const high = goal.high
		if (!high || high.amount.currency !== now.currency || now.minor > high.amount.minor)
			return { ...without(goal, 'rebuildBy'), high: { amount: now, day: today } }
		if (goal.rebuildBy && now.minor >= high.amount.minor) return without(goal, 'rebuildBy')
		return goal
	})
	return diffOf(rows, after)
}
