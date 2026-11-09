// Orchard's debts (#86, D-205), pure so they are tested here: a rate in basis points from the provider's decimal or
// the owner's text, the terms a debt has once the owner's are laid over the provider's, how much of each card's limit
// is used, the payoff plan both ways (highest interest first, smallest balance first), a hand-entered loan's schedule
// by its due day, a loan Plaid can't see with its payment as a repeating bill, and the signal a month before an intro
// rate ends. Money is worked in BigInt minor units and rounded half away from zero; a rate is in basis points, so
// 1200 is 12 % a year and a month's interest is `balance × rate ÷ 120000`.
import { toUri, type BatchOp } from '../../data/index.js'
import { money, type Money } from '../../money/index.js'
import { accountGroups, balanceOps, dayOfInstant, payloadOf, type Ops } from './accounts.js'
import { addMonthsClamped, addMonthsToPeriod, billFromDraft, billOps, type BillDraft } from './bills.js'
import {
	FINANCE,
	WHOLE,
	type Account,
	type Apr,
	type Bill,
	type Liability,
	type LiabilityPayload,
	type ProviderLink,
} from './types.js'

/** The highest rate Orchard keeps: 999.99 %. */
export const RATE_MAX = 99999
/** Card usage at or above 30 % raises the row (D-205). */
export const USAGE_WARN_BP = 3000
/** The payoff plan looks this far ahead: 50 years. */
export const PLAN_MONTHS = 600
/** The signal name an intro rate's end raises. */
export const PROMO_SIGNAL = 'finance.promo-ending'

const MONTHLY = 120000n
/** A plan whose balance passes this many minor units is not paid off: it only grows from there. */
const RUNAWAY = 10n ** 14n

/** `numerator / denominator`, rounded half away from zero. The denominator is positive. */
function divideRounded(numerator: bigint, denominator: bigint): bigint {
	const size = numerator < 0n ? -numerator : numerator
	let quotient = size / denominator
	if ((size % denominator) * 2n >= denominator) quotient += 1n
	return numerator < 0n ? -quotient : quotient
}

const minBig = (a: bigint, b: bigint) => (a < b ? a : b)
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const isOpen = (account: Account) => !account.closedOn
const isCard = (account: Account) => account.kind === 'credit-card'
const isLoan = (account: Account) => account.kind === 'loan'

// ---- Rates -----------------------------------------------------------------------------------------------------

const RATE = /^(\d{1,6})(?:\.(\d+))?$/

/** A percent as a decimal string ("15.24") in basis points (1524), rounded half away from zero; 0 to 999.99 %. */
export function rateOf(decimal: string | null | undefined): number | undefined {
	const match = RATE.exec((decimal ?? '').trim())
	if (!match) return undefined
	const fraction = match[2] ?? ''
	const points = Number(match[1]) * 100 + Number(fraction.slice(0, 2).padEnd(2, '0'))
	const rounded = fraction.length > 2 && Number(fraction[2]) >= 5 ? points + 1 : points
	return rounded <= RATE_MAX ? rounded : undefined
}

const marks = new Map<string, string>()
function decimalMark(lang: string): string {
	let mark = marks.get(lang)
	if (mark === undefined) {
		mark = new Intl.NumberFormat(lang).formatToParts(1.5).find((part) => part.type === 'decimal')?.value ?? '.'
		marks.set(lang, mark)
	}
	return mark
}

/** A rate the owner typed, in the language's decimal mark ("24,99" in a comma locale), with or without "%". */
export function parseRate(text: string, lang: string): number | undefined {
	let value = text.trim().replace(/\s*%$/, '')
	const mark = decimalMark(lang)
	if (mark !== '.' && value.split(mark).length === 2) value = value.replace(mark, '.')
	return rateOf(value)
}

const rateFormats = new Map<string, Intl.NumberFormat>()

/** A rate as a percent with at most two decimals: "24.99%", "0%". */
export function rateText(basisPoints: number, lang: string): string {
	let format = rateFormats.get(lang)
	if (!format) {
		format = new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: 2 })
		rateFormats.set(lang, format)
	}
	return format.format(basisPoints / WHOLE)
}

/** A rate as the owner writes it in a field: "24.99", "5.9", "0". */
export function rateInput(basisPoints: number, lang: string): string {
	const whole = Math.trunc(basisPoints / 100)
	const rest = String(basisPoints % 100)
		.padStart(2, '0')
		.replace(/0+$/, '')
	return rest ? `${whole}${decimalMark(lang)}${rest}` : String(whole)
}

/** A card's provider rate: its purchase APR, else its highest. */
function cardRate(aprs: readonly Apr[] | undefined): number | undefined {
	if (!aprs?.length) return undefined
	return aprs.find((apr) => apr.kind === 'purchase')?.rate ?? Math.max(...aprs.map((apr) => apr.rate))
}

/** What the provider says a debt's rate is: a card's purchase APR, else its highest; a loan's rate. */
export function providerRateOf(account: Account, liability: LiabilityPayload | undefined): number | undefined {
	return isCard(account) ? cardRate(liability?.aprs) : liability?.loan?.rate
}

// ---- Terms -----------------------------------------------------------------------------------------------------

/** What a debt costs once the owner's terms are laid over the provider's. */
export interface Terms {
	rate?: number
	/** The intro rate, while it applies (the days before `ends`). */
	promo?: { rate: number; ends: string }
	limit?: Money
	minimum?: Money
}

/** The card's latest live statement bill: the largest statement day. */
function latestStatement(accountId: string, bills: readonly Bill[]): Bill | undefined {
	return bills
		.filter((bill) => bill.accountId === accountId && bill.statementDay)
		.sort((a, b) => byText(b.statementDay!, a.statementDay!))[0]
}

/**
 * The effective terms (D-205): the owner's rate, else a card's purchase APR or its highest, else a loan's rate; an
 * intro rate before its end day; the owner's limit, else the provider's; a card's minimum from its latest live
 * statement bill, else the owner's payment; a loan's payment, else the provider's minimum.
 */
export function effectiveTerms(
	account: Account,
	liability: LiabilityPayload | undefined,
	bills: readonly Bill[],
	today: string
): Terms {
	const card = isCard(account)
	const rate = liability?.rate ?? providerRateOf(account, liability)
	const promo = liability?.promo && today < liability.promo.ends ? liability.promo : undefined
	const limit = liability?.ownerLimit ?? liability?.limit
	const minimum = card
		? (latestStatement(account.id, bills)?.minimum ?? liability?.payment)
		: (liability?.payment ?? liability?.loan?.minimum)
	return {
		...(rate !== undefined ? { rate } : {}),
		...(promo ? { promo } : {}),
		...(limit ? { limit } : {}),
		...(minimum && minimum.minor > 0 ? { minimum } : {}),
	}
}

/** Whether the intro rate ends within the coming month: from a month before its end day up to that day. */
export function promoEnding(liability: Pick<LiabilityPayload, 'promo'> | undefined, today: string): boolean {
	const ends = liability?.promo?.ends
	return Boolean(ends && today >= addMonthsClamped(ends, -1) && today <= ends)
}

// ---- Usage -----------------------------------------------------------------------------------------------------

/** What a debt account owes: its balance, never below 0. */
export function owedOf(account: Account): Money {
	const minor = account.balance && account.balance.currency === account.currency ? account.balance.minor : 0
	return money(Math.max(0, minor), account.currency)
}

/** A part of a whole in basis points, rounded half away from zero. */
function pointsOf(part: number, whole: number): number {
	return Number(divideRounded(BigInt(part) * BigInt(WHOLE), BigInt(whole)))
}

export interface CardUsage {
	accountId: string
	owed: Money
	limit?: Money
	/** Basis points of the limit owed; absent with no limit. */
	usage?: number
	warn: boolean
}

export interface Usage {
	cards: CardUsage[]
	/** Over the open home-currency cards that have a limit; absent when none has. */
	overall?: { usage: number; owed: Money; limit: Money; warn: boolean }
	/** The cards with a limit left out for being in another currency. */
	left: { currency: string; count: number }[]
}

const limitOf = (liability: LiabilityPayload | undefined, account: Account) => {
	const limit = liability?.ownerLimit ?? liability?.limit
	return limit && limit.currency === account.currency && limit.minor > 0 ? limit : undefined
}

/** Each open card's balance owed against its limit, in basis points, and the overall figure in the home currency. */
export function usageOf(accounts: readonly Account[], liabilities: readonly Liability[], home: string): Usage {
	const cards: CardUsage[] = []
	let owed = 0
	let limits = 0
	const left = new Map<string, number>()
	for (const account of accounts) {
		if (!isCard(account) || !isOpen(account)) continue
		const limit = limitOf(
			liabilities.find((entry) => entry.accountId === account.id),
			account
		)
		const balance = owedOf(account)
		const usage = limit ? pointsOf(balance.minor, limit.minor) : undefined
		cards.push({
			accountId: account.id,
			owed: balance,
			...(limit ? { limit, usage } : {}),
			warn: usage !== undefined && usage >= USAGE_WARN_BP,
		})
		if (!limit) continue
		if (account.currency !== home) left.set(account.currency, (left.get(account.currency) ?? 0) + 1)
		else {
			owed += balance.minor
			limits += limit.minor
		}
	}
	const overall = limits > 0 ? pointsOf(owed, limits) : undefined
	return {
		cards,
		...(overall !== undefined
			? {
					overall: {
						usage: overall,
						owed: money(owed, home),
						limit: money(limits, home),
						warn: overall >= USAGE_WARN_BP,
					},
				}
			: {}),
		left: [...left].map(([currency, count]) => ({ currency, count })),
	}
}

// ---- Payoff plan -----------------------------------------------------------------------------------------------

export type Strategy = 'interest' | 'balance'
export const STRATEGIES: readonly Strategy[] = ['interest', 'balance']

/** One debt as the plan takes it: its full balance, its effective rate and minimum, and any intro rate. */
export interface PlanDebt {
	accountId: string
	name: string
	balance: Money
	rate?: number
	promo?: { rate: number; ends: string }
	minimum?: Money
}

export interface PayoffPlan {
	/** Months to debt-free; absent when not within `PLAN_MONTHS`. */
	months?: number
	/** `YYYY-MM`, the month the last debt is paid. */
	debtFree?: string
	interest: Money
	/** The planned debts in payoff order; one not paid off within the plan has no `paidOff` and comes last. */
	order: { accountId: string; paidOff?: string; interest: Money }[]
	/** The debts left out, with what they need. */
	missing: { accountId: string; need: 'rate' | 'minimum' }[]
}

interface Running {
	debt: PlanDebt & { rate: number; minimum: Money }
	balance: bigint
	start: bigint
	interest: bigint
	paidOff?: string
	rate: number
}

function compare(strategy: Strategy) {
	return (a: Running, b: Running) =>
		strategy === 'interest'
			? b.rate - a.rate ||
				Number(a.start - b.start) ||
				byText(a.debt.name, b.debt.name) ||
				byText(a.debt.accountId, b.debt.accountId)
			: Number(a.start - b.start) ||
				b.rate - a.rate ||
				byText(a.debt.name, b.debt.name) ||
				byText(a.debt.accountId, b.debt.accountId)
}

const bigMoney = (minor: bigint, currency: string) =>
	money(Number(minBig(minor, BigInt(Number.MAX_SAFE_INTEGER))), currency)

function simulate(
	debts: Running['debt'][],
	extra: bigint,
	start: string,
	strategy: Strategy,
	currency: string,
	missing: PayoffPlan['missing']
): PayoffPlan {
	const states: Running[] = debts.map((debt) => ({
		debt,
		balance: BigInt(debt.balance.minor),
		start: BigInt(debt.balance.minor),
		interest: 0n,
		rate: debt.rate,
	}))
	const order: Running[] = []
	const ranked = compare(strategy)
	let freed = 0n
	let months: number | undefined
	let debtFree: string | undefined
	for (let month = 0; month < PLAN_MONTHS && states.length; month++) {
		const period = addMonthsToPeriod(start, month)
		const first = `${period}-01`
		const open = states.filter((state) => state.balance > 0n)
		for (const state of open) {
			state.start = state.balance
			const promo = state.debt.promo
			state.rate = promo && first < promo.ends ? promo.rate : state.debt.rate
			const interest = divideRounded(state.balance * BigInt(state.rate), MONTHLY)
			state.balance += interest
			state.interest += interest
		}
		for (const state of open) state.balance -= minBig(BigInt(state.debt.minimum.minor), state.balance)
		let pool = extra + freed
		while (pool > 0n) {
			const target = open.filter((state) => state.balance > 0n).sort(ranked)[0]
			if (!target) break
			const pay = minBig(pool, target.balance)
			target.balance -= pay
			pool -= pay
		}
		for (const state of open.filter((entry) => entry.balance === 0n).sort(ranked)) {
			state.paidOff = period
			order.push(state)
			freed += BigInt(state.debt.minimum.minor)
		}
		if (states.every((state) => state.balance === 0n)) {
			months = month + 1
			debtFree = period
			break
		}
		if (open.some((state) => state.balance > RUNAWAY)) break
	}
	const unpaid = states.filter((state) => state.balance > 0n).sort(ranked)
	const total = states.reduce((sum, state) => sum + state.interest, 0n)
	return {
		...(months !== undefined ? { months, debtFree } : {}),
		interest: bigMoney(total, currency),
		order: [...order, ...unpaid].map((state) => ({
			accountId: state.debt.accountId,
			...(state.paidOff ? { paidOff: state.paidOff } : {}),
			interest: bigMoney(state.interest, currency),
		})),
		missing,
	}
}

/**
 * The payoff plan both ways, month by month from the current month for at most `PLAN_MONTHS`: each debt accrues its
 * month's interest (the intro rate in a month that starts before its end day), is paid its minimum (capped at what it
 * owes), then the extra and the minimums of the debts already paid go to the target, and what is left over to the
 * next one. Highest interest first targets the highest rate (ties: smaller balance, name, id); smallest balance first
 * the smallest balance at the month's start (ties: higher rate, name, id). Minimums stay as they are. A debt with no
 * rate or no minimum is left out and listed with what it needs. Every amount is in `extra`'s currency.
 */
export function payoffPlans(input: {
	debts: readonly PlanDebt[]
	extra: Money
	today: string
}): Record<Strategy, PayoffPlan> {
	const currency = input.extra.currency
	const missing: PayoffPlan['missing'] = []
	const planned: Running['debt'][] = []
	for (const debt of input.debts) {
		if (debt.balance.minor <= 0) continue
		if (debt.rate === undefined) missing.push({ accountId: debt.accountId, need: 'rate' })
		else if (!debt.minimum || debt.minimum.minor <= 0) missing.push({ accountId: debt.accountId, need: 'minimum' })
		else planned.push(debt as Running['debt'])
	}
	const extra = BigInt(Math.max(0, input.extra.minor))
	const start = input.today.slice(0, 7)
	return {
		interest: simulate(planned, extra, start, 'interest', currency, missing),
		balance: simulate(planned, extra, start, 'balance', currency, missing),
	}
}

/** The open debt accounts in the order the Accounts tab shows them. */
function debtAccounts(accounts: readonly Account[], links: readonly ProviderLink[], now: number): Account[] {
	return accountGroups(accounts, [], links, now).flatMap((group) =>
		group.kind === 'link' || group.kind === 'institution' || group.kind === 'manual'
			? group.accounts.filter((account) => isCard(account) || isLoan(account))
			: []
	)
}

/** A debt as the plan takes it, from its account and liability. */
function planDebtOf(
	account: Account,
	liability: Liability | undefined,
	bills: readonly Bill[],
	today: string
): PlanDebt {
	const terms = effectiveTerms(account, liability, bills, today)
	const minimum = terms.minimum && terms.minimum.currency === account.currency ? terms.minimum : undefined
	return {
		accountId: account.id,
		name: account.name,
		balance: owedOf(account),
		...(terms.rate !== undefined ? { rate: terms.rate } : {}),
		...(liability?.promo ? { promo: liability.promo } : {}),
		...(minimum ? { minimum } : {}),
	}
}

/** The plan's input: the open home-currency debts with a positive balance, at the full balance (no share). */
export function debtsOf(input: {
	accounts: readonly Account[]
	liabilities: readonly Liability[]
	bills: readonly Bill[]
	home: string
	today: string
}): PlanDebt[] {
	return input.accounts
		.filter((account) => (isCard(account) || isLoan(account)) && isOpen(account) && account.currency === input.home)
		.filter((account) => owedOf(account).minor > 0)
		.map((account) =>
			planDebtOf(
				account,
				input.liabilities.find((entry) => entry.accountId === account.id),
				input.bills,
				input.today
			)
		)
}

// ---- Summary ---------------------------------------------------------------------------------------------------

export interface CardLine {
	account: Account
	terms: Terms
	usage: CardUsage
	/** The intro rate ends within the coming month. */
	promoEnding: boolean
	/** The latest statement's minimum and due day. */
	statement?: { minimum: Money; due?: string }
	/** Counts in the totals: the home currency. */
	home: boolean
	warn: boolean
}

export interface LoanLine {
	account: Account
	terms: Terms
	liability?: Liability
	/** The month the loan alone is paid off at its minimum; `none` past the plan; absent when it can't be planned. */
	paidOff?: string | 'none'
	home: boolean
}

export interface DebtSummary {
	/** Some open card or loan. */
	any: boolean
	cards: CardLine[]
	loans: LoanLine[]
	/** The open home-currency debts at full balance. */
	owed: Money
	usage: Usage
	/** The open debts left out of the totals for being in another currency. */
	left: { currency: string; count: number }[]
	/** The plan's input. */
	debts: PlanDebt[]
}

/** What the Debt tab reads: the cards and loans in the Accounts tab's order, what is owed and the card usage. */
export function debtSummary(input: {
	accounts: readonly Account[]
	liabilities: readonly Liability[]
	bills: readonly Bill[]
	links: readonly ProviderLink[]
	home: string
	today: string
	now: number
}): DebtSummary {
	const { liabilities, bills, home, today } = input
	const open = debtAccounts(input.accounts, input.links, input.now)
	const usage = usageOf(open, liabilities, home)
	const liabilityOf = (id: string) => liabilities.find((entry) => entry.accountId === id)
	const cards: CardLine[] = []
	const loans: LoanLine[] = []
	const left = new Map<string, number>()
	let owed = 0
	for (const account of open) {
		const liability = liabilityOf(account.id)
		const terms = effectiveTerms(account, liability, bills, today)
		const inHome = account.currency === home
		if (inHome) owed += owedOf(account).minor
		else left.set(account.currency, (left.get(account.currency) ?? 0) + 1)
		if (isCard(account)) {
			const latest = latestStatement(account.id, bills)
			const ending = promoEnding(liability, today)
			const used = usage.cards.find((entry) => entry.accountId === account.id)!
			cards.push({
				account,
				terms,
				usage: used,
				promoEnding: ending,
				...(latest?.minimum
					? { statement: { minimum: latest.minimum, ...(latest.due ? { due: latest.due } : {}) } }
					: {}),
				home: inHome,
				warn: used.warn || ending,
			})
			continue
		}
		const debt = planDebtOf(account, liability, bills, today)
		let paidOff: LoanLine['paidOff']
		if (debt.balance.minor > 0 && debt.rate !== undefined && debt.minimum) {
			const plan = payoffPlans({ debts: [debt], extra: money(0, account.currency), today }).interest
			paidOff = plan.debtFree ?? 'none'
		}
		loans.push({
			account,
			terms,
			...(liability ? { liability } : {}),
			...(paidOff ? { paidOff } : {}),
			home: inHome,
		})
	}
	return {
		any: open.length > 0,
		cards,
		loans,
		owed: money(owed, home),
		usage,
		left: [...left].map(([currency, count]) => ({ currency, count })),
		debts: debtsOf({ accounts: open, liabilities, bills, home, today }),
	}
}

// ---- A hand-entered loan's schedule ------------------------------------------------------------------------------

/** The due day of the month (1–31, 31 the month's last day) in the month of `day`. */
export const dueDayIn = (day: string, dueDay: number) => addMonthsClamped(`${day.slice(0, 7)}-01`, 0, dueDay)

/** The next due day on or after today. */
export function nextDueDay(dueDay: number, today: string): string {
	const due = dueDayIn(today, dueDay)
	return due >= today ? due : addMonthsClamped(due, 1, dueDay)
}

/**
 * The debt pass's step for each hand-entered loan with a rate, a payment and a due day: one step for every due day
 * after its balance's day and up to today, `balance + interest − payment`, floored at 0, at its rate (the intro rate
 * on a due day before its end). The new balance goes through `balanceOps`, so it has a snapshot and its day is today;
 * a second run the same day writes nothing. A linked loan is never stepped. `paidOff` names the loans that reached 0.
 */
export function scheduleOps(input: {
	accounts: readonly Account[]
	liabilities: readonly Liability[]
	today: string
	nowIso: string
	newId: () => string
}): Ops & { accounts: Account[]; paidOff: string[] } {
	const ops: BatchOp[] = []
	const inverse: BatchOp[] = []
	const changed: Account[] = []
	const paidOff: string[] = []
	for (const account of input.accounts) {
		if (!isLoan(account) || !isOpen(account) || account.linkId || !account.balance || !account.balanceAt) continue
		const liability = input.liabilities.find((entry) => entry.accountId === account.id)
		const rate = liability?.rate ?? liability?.loan?.rate
		const payment = liability?.payment
		const dueDay = liability?.dueDay
		if (rate === undefined || !payment || !dueDay || payment.currency !== account.balance.currency) continue
		if (account.balance.minor <= 0) continue
		const anchor = dayOfInstant(account.balanceAt)
		let balance = BigInt(account.balance.minor)
		let steps = 0
		for (let month = 0; month <= PLAN_MONTHS && balance > 0n; month++) {
			const due = addMonthsClamped(`${anchor.slice(0, 7)}-01`, month, dueDay)
			if (due > input.today) break
			if (due <= anchor) continue
			const promo = liability?.promo
			const at = promo && due < promo.ends ? promo.rate : rate
			balance += divideRounded(balance * BigInt(at), MONTHLY) - BigInt(payment.minor)
			if (balance < 0n) balance = 0n
			steps += 1
		}
		if (!steps) continue
		const set = balanceOps(account, bigMoney(balance, account.balance.currency), input.nowIso, input.today, input.newId)
		ops.push(...set.ops)
		inverse.unshift(...set.inverse)
		changed.push(set.account)
		if (balance === 0n) paidOff.push(account.id)
	}
	return { ops, inverse, accounts: changed, paidOff }
}

// ---- A loan Plaid can't see --------------------------------------------------------------------------------------

/** A loan as the owner adds it. */
export interface LoanDraft {
	name: string
	lender?: string
	currency: string
	balance: Money
	rate: number
	payment: Money
	/** 1–31. */
	dueDay: number
}

const liabilityCreate = (liability: Liability): BatchOp => ({
	op: 'createEntity',
	input: { id: liability.id, type: FINANCE.liability, payload: payloadOf(liability) },
})

/**
 * A loan Plaid can't see, in one write: the account (kind `loan`, no link) with its balance, its liability, and a
 * monthly repeating, fixed bill for the payment due on the next due day on or after today. The inverse takes all
 * three back.
 */
export function loanOps(
	draft: LoanDraft,
	today: string,
	nowIso: string,
	newId: () => string
): Ops & { account: Account; liability: Liability; bill: Bill; billDraft: BillDraft } {
	const name = draft.name.trim()
	const lender = draft.lender?.trim()
	const base: Account = {
		id: newId(),
		name,
		kind: 'loan',
		currency: draft.currency,
		...(lender ? { institution: lender } : {}),
		share: WHOLE,
	}
	const set = balanceOps(base, draft.balance, nowIso, today, newId, { created: true })
	const due = nextDueDay(draft.dueDay, today)
	const billDraft: BillDraft = {
		payee: name,
		period: due.slice(0, 7),
		due,
		amount: draft.payment,
		source: 'manual',
		repeat: 1,
		fixed: true,
	}
	const bill = billFromDraft(billDraft, undefined, today, newId)
	const liability: Liability = {
		id: newId(),
		accountId: base.id,
		rate: draft.rate,
		payment: draft.payment,
		dueDay: draft.dueDay,
		billId: bill.id,
	}
	const billed = billOps(undefined, bill)
	return {
		account: set.account,
		liability,
		bill,
		billDraft,
		ops: [...set.ops, liabilityCreate(liability), ...billed.ops],
		inverse: [...billed.inverse, { op: 'delete', uri: toUri(FINANCE.liability, liability.id) }, ...set.inverse],
	}
}

/** Writes a liability, new or changed; the inverse puts it back as it was. */
export function liabilityWriteOps(was: Liability | undefined, next: Liability): Ops {
	return {
		ops: [was ? { op: 'updateEntity', id: next.id, payload: payloadOf(next) } : liabilityCreate(next)],
		inverse: [
			was
				? { op: 'updateEntity', id: was.id, payload: payloadOf(was) }
				: { op: 'delete', uri: toUri(FINANCE.liability, next.id) },
		],
	}
}

// ---- Signals ---------------------------------------------------------------------------------------------------

export interface PromoSignal {
	name: typeof PROMO_SIGNAL
	/** The card, its name and the end day as written; never an amount. */
	payload: { uris: [string]; card: string; endsDay: string }
	dedupeKey: string
}

/** `finance.promo-ending` for each open card whose intro rate ends within the coming month, keyed by card and day. */
export function promoSignals(input: {
	accounts: readonly Account[]
	liabilities: readonly Liability[]
	today: string
	dayLabel: (day: string) => string
}): PromoSignal[] {
	const out: PromoSignal[] = []
	for (const account of input.accounts) {
		if (!isCard(account) || !isOpen(account)) continue
		const liability = input.liabilities.find((entry) => entry.accountId === account.id)
		if (!liability?.promo || !promoEnding(liability, input.today)) continue
		const ends = liability.promo.ends
		out.push({
			name: PROMO_SIGNAL,
			payload: { uris: [toUri(FINANCE.account, account.id)], card: account.name, endsDay: input.dayLabel(ends) },
			dedupeKey: `${account.id}:promo:${ends}`,
		})
	}
	return out
}
