// Orchard's bills (product/domains/finance.md §6, D-196), pure so they are tested here: a bill's state, derived on
// read and never stored; what its payments come to (settled, partly paid, overpaid); the next occurrence of a series
// and its estimate; the draft the owner's form and the Gardener's answer hand over, and the bill it makes or updates;
// and the ops that store a bill and take it back. Every percentage is worked in minor units through `shareOf`
// (BigInt, rounded half away from zero), never a float (D-188).
import { toUri, type BatchOp } from '../../data/index.js'
import { addMoney, isCurrency, money, parseMoney, shareOf, type Money } from '../../money/index.js'
import { payloadOf, type Ops } from './accounts.js'
import { merchantKey } from './merchants.js'
import {
	BILL_REPEATS,
	FILE_IMPORT_SOURCE,
	FINANCE,
	INSURANCE_KINDS,
	type Account,
	type Bill,
	type BillRepeat,
	type BillSource,
	type InsuranceKind,
	type LetterImportPayload,
} from './types.js'

/** Due within today to today + 3 is Due soon. */
export const DUE_SOON_DAYS = 3
/** Payments of at least 98% of a bill settle it. */
export const SETTLE_BP = 9800
/** Payments of more than 102% of a bill overpay it. */
export const OVERPAID_BP = 10200
/** A payment within 2% of the bill's amount is close. */
export const CLOSE_BP = 200
/** Within 15% for an estimate. */
export const ESTIMATE_CLOSE_BP = 1500
/** A candidate payment falls from 14 days before the due day to 14 days after it. */
export const WINDOW_DAYS = 14
/** With no due day, from the period's start to 60 days after. */
export const NO_DUE_WINDOW_DAYS = 60
/** Paid lists the bills settled in the last 60 days. */
export const PAID_SHOWN_DAYS = 60
/** Mark paid lists at most 20 payments. */
export const CANDIDATES_SHOWN = 20
/** A bill keeps at most 10 learned merchants. */
export const MERCHANT_IDS = 10

export const BILL_STATES = ['overdue', 'due-soon', 'upcoming', 'expected', 'paid'] as const
export type BillState = (typeof BILL_STATES)[number]

const DAY_MS = 24 * 60 * 60 * 1000
const DAY = /^\d{4}-\d{2}-\d{2}$/
const PERIOD = /^\d{4}-\d{2}$/
const isDay = (value: unknown): value is string =>
	typeof value === 'string' && DAY.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
const isPeriod = (value: unknown): value is string =>
	typeof value === 'string' && PERIOD.test(value) && Number(value.slice(5)) >= 1 && Number(value.slice(5)) <= 12

/** Whole days from `a` to `b`, negative when `b` is earlier. */
export const daysBetween = (a: string, b: string) =>
	Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS)

/** A bill with a card is a card statement. */
export const isStatement = (bill: Pick<Bill, 'accountId'>) => Boolean(bill.accountId)

/** What the bill's payments come to, in its currency. */
export function paidOf(bill: Pick<Bill, 'amount' | 'payments'>): Money {
	let total = money(0, bill.amount.currency)
	for (const payment of bill.payments ?? [])
		if (payment.amount.currency === total.currency) total = addMoney(total, payment.amount)
	return total
}

/**
 * A bill is settled when its payments reach 98% of its amount; a card statement's when they reach its minimum, or
 * with no minimum its balance.
 */
export function settled(bill: Pick<Bill, 'amount' | 'payments' | 'accountId' | 'minimum'>): boolean {
	const paid = paidOf(bill).minor
	if (!bill.payments?.length) return false
	if (isStatement(bill)) {
		const floor = bill.minimum && bill.minimum.currency === bill.amount.currency ? bill.minimum : bill.amount
		return paid >= floor.minor
	}
	return paid >= shareOf(bill.amount, SETTLE_BP).minor
}

/** What is still owed: the amount less the payments, none when they cover it. */
export function remainingOf(bill: Pick<Bill, 'amount' | 'payments'>): Money | undefined {
	const left = bill.amount.minor - paidOf(bill).minor
	return left > 0 ? money(left, bill.amount.currency) : undefined
}

/** What was paid beyond the bill, once the payments pass 102% of it. */
export function overpaidOf(bill: Pick<Bill, 'amount' | 'payments'>): Money | undefined {
	const paid = paidOf(bill)
	if (paid.minor <= shareOf(bill.amount, OVERPAID_BP).minor) return undefined
	return money(paid.minor - bill.amount.minor, bill.amount.currency)
}

/** The day the bill was last paid. */
export function paidDay(bill: Pick<Bill, 'payments'>): string | undefined {
	return (bill.payments ?? []).reduce<string | undefined>(
		(last, entry) => (!last || entry.day > last ? entry.day : last),
		undefined
	)
}

/** The bill's state on a day: Paid once settled, then Expected with no due day, Overdue, Due soon or Upcoming. */
export function billState(bill: Bill, today: string): BillState {
	if (settled(bill)) return 'paid'
	if (!bill.due) return 'expected'
	const until = daysBetween(today, bill.due)
	if (until < 0) return 'overdue'
	if (until <= DUE_SOON_DAYS) return 'due-soon'
	return 'upcoming'
}

export interface BillGroup {
	state: BillState
	bills: Bill[]
}

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/**
 * The page's groups, in the order of `BILL_STATES`, leaving out any with no bills: by due day (an Expected one by
 * period), and Paid only for the bills settled in the last 60 days, the newest first.
 */
export function billGroups(bills: readonly Bill[], today: string): BillGroup[] {
	const groups = new Map<BillState, Bill[]>(BILL_STATES.map((state) => [state, []]))
	for (const bill of bills) {
		const state = billState(bill, today)
		if (state === 'paid' && daysBetween(paidDay(bill) ?? today, today) > PAID_SHOWN_DAYS) continue
		groups.get(state)!.push(bill)
	}
	const key = (bill: Bill) => bill.due ?? `${bill.period}-00`
	for (const [state, list] of groups)
		list.sort((a, b) =>
			state === 'paid'
				? byText(paidDay(b) ?? '', paidDay(a) ?? '') || byText(a.id, b.id)
				: byText(key(a), key(b)) || byText(a.id, b.id)
		)
	return BILL_STATES.filter((state) => groups.get(state)!.length).map((state) => ({ state, bills: groups.get(state)! }))
}

// ---- Series ----------------------------------------------------------------------------------------------------

const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate()
const pad = (value: number) => String(value).padStart(2, '0')

/** A month some months on, `YYYY-MM`. */
export function addMonthsToPeriod(period: string, months: number): string {
	const index = Number(period.slice(0, 4)) * 12 + Number(period.slice(5, 7)) - 1 + months
	return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`
}

/**
 * A day some months on, clamped to the month's end: Jan 31 + 1 month is Feb 28. With `anchor`, the day of the month
 * the series started on, a clamped day goes back to it when the month allows (Feb 28 + 1 month is Mar 31).
 */
export function addMonthsClamped(day: string, months: number, anchor?: number): string {
	const period = addMonthsToPeriod(day.slice(0, 7), months)
	const want = anchor ?? Number(day.slice(8, 10))
	const last = daysIn(Number(period.slice(0, 4)), Number(period.slice(5, 7)))
	return `${period}-${pad(Math.min(want, last))}`
}

/** A bill of a series, the tombstoned ones flagged: a deleted latest occurrence ends the series. */
export type SeriesBill = Bill & { deleted?: boolean }

/** The series' latest occurrence: by period, then due day, then id. */
export function latestOf<T extends Bill>(series: readonly T[]): T | undefined {
	return [...series].sort(
		(a, b) => byText(b.period, a.period) || byText(b.due ?? '', a.due ?? '') || byText(b.id, a.id)
	)[0]
}

/** The mean of the series' last three actual amounts in its latest currency; the latest amount when there are none. */
export function estimateOf(series: readonly SeriesBill[]): Money | undefined {
	const latest = latestOf(series)
	if (!latest) return undefined
	const actual = [...series]
		.filter((bill) => !bill.deleted && !bill.estimate && bill.amount.currency === latest.amount.currency)
		.sort((a, b) => byText(b.period, a.period) || byText(b.id, a.id))
		.slice(0, 3)
	if (!actual.length) return latest.amount
	const sum = actual.reduce((total, bill) => total + BigInt(bill.amount.minor), 0n)
	const count = BigInt(actual.length)
	let mean = sum / count
	if ((sum % count) * 2n >= count) mean += 1n
	return money(Number(mean), latest.amount.currency)
}

/**
 * The next occurrence of a series, once its latest is settled or past due: the due day moved on by the interval
 * (clamped, from the day the series started on), the same amount for a fixed bill, the estimate otherwise. None
 * when the latest occurrence is deleted or no longer repeats.
 */
export function nextOccurrence(given: readonly SeriesBill[], today: string, newId: () => string): Bill | undefined {
	const series = given.filter((bill) => !(bill.deleted && bill.undone))
	const latest = latestOf(series)
	if (!latest || latest.deleted || !latest.repeat) return undefined
	if (!settled(latest) && !(latest.due && latest.due < today)) return undefined
	const months = latest.repeat.months
	const first = [...series].filter((bill) => bill.due).sort((a, b) => byText(a.due!, b.due!))[0]
	const anchor = first?.due ? Number(first.due.slice(8, 10)) : undefined
	const amount = latest.fixed ? latest.amount : estimateOf(series)!
	return {
		id: newId(),
		payee: latest.payee,
		period: addMonthsToPeriod(latest.period, months),
		...(latest.due ? { due: addMonthsClamped(latest.due, months, anchor) } : {}),
		amount,
		...(latest.fixed ? { fixed: true as const } : { estimate: true as const }),
		source: 'repeating',
		repeat: { months },
		seriesId: latest.seriesId ?? latest.id,
		...(latest.accountId ? { accountId: latest.accountId } : {}),
		...(latest.url ? { url: latest.url } : {}),
		...(latest.merchantIds?.length ? { merchantIds: [...latest.merchantIds] } : {}),
		// a premium stays a premium; an EOB, its insurer and its day of service belong to the one occurrence
		...(latest.insurance ? { insurance: latest.insurance } : {}),
	}
}

/** The series a bill is in: its `seriesId`, or its own id. */
export const seriesOf = (bill: Pick<Bill, 'id' | 'seriesId'>) => bill.seriesId ?? bill.id

// ---- Drafts ----------------------------------------------------------------------------------------------------

/** A bill as the form, or the Gardener's answer, hands it over. */
export interface BillDraft {
	/** Set, the draft updates that bill. */
	id?: string
	payee: string
	amount: Money
	due?: string
	/** `YYYY-MM`; with none, the due day's month, else this month. */
	period?: string
	estimate?: boolean
	repeat?: BillRepeat
	fixed?: boolean
	accountId?: string
	minimum?: Money
	url?: string
	source?: BillSource
	/** An insurance premium or a medical bill (#85). */
	insurance?: InsuranceKind
	/** The next three are kept only with `insurance: 'medical'`. */
	eob?: boolean
	insurer?: string
	/** `YYYY-MM-DD`. */
	serviceDay?: string
}

const isInsurance = (value: unknown): value is InsuranceKind => (INSURANCE_KINDS as readonly unknown[]).includes(value)
const MAX_NAME = 120

/** A web address the owner can be sent to: `https://` only. */
export function safeUrl(value: unknown): string | undefined {
	if (typeof value !== 'string' || !value.trim()) return undefined
	try {
		const url = new URL(value.trim())
		return url.protocol === 'https:' && url.hostname ? url.href : undefined
	} catch {
		return undefined
	}
}

/** A bill as the form shows it. */
export function draftOfBill(bill: Bill): BillDraft {
	return {
		id: bill.id,
		payee: bill.payee,
		amount: bill.amount,
		period: bill.period,
		source: bill.source,
		...(bill.due ? { due: bill.due } : {}),
		...(bill.estimate ? { estimate: true } : {}),
		...(bill.repeat ? { repeat: bill.repeat.months } : {}),
		...(bill.fixed ? { fixed: true } : {}),
		...(bill.accountId ? { accountId: bill.accountId } : {}),
		...(bill.minimum ? { minimum: bill.minimum } : {}),
		...(bill.url ? { url: bill.url } : {}),
		...(bill.insurance ? { insurance: bill.insurance } : {}),
		...(bill.eob ? { eob: true } : {}),
		...(bill.insurer ? { insurer: bill.insurer } : {}),
		...(bill.serviceDay ? { serviceDay: bill.serviceDay } : {}),
	}
}

/**
 * The bill a draft makes, or the bill it changes: a change keeps the payments, the learned merchants, the candidates,
 * the series and the task; what the draft leaves out is cleared (the estimate flag among them).
 */
export function billFromDraft(draft: BillDraft, was: Bill | undefined, today: string, newId: () => string): Bill {
	const id = was?.id ?? draft.id ?? newId()
	const bill: Bill = {
		...(was ?? {}),
		id,
		payee: draft.payee.trim(),
		amount: draft.amount,
		period: draft.period ?? was?.period ?? (draft.due ? draft.due.slice(0, 7) : today.slice(0, 7)),
		source: draft.source ?? was?.source ?? 'manual',
	}
	const set = <K extends keyof Bill>(key: K, value: Bill[K] | undefined) => {
		if (value === undefined) delete bill[key]
		else bill[key] = value
	}
	set('due', isDay(draft.due) ? draft.due : undefined)
	set('estimate', draft.estimate ? true : undefined)
	set('repeat', draft.repeat ? { months: draft.repeat } : undefined)
	set('fixed', draft.repeat && draft.fixed ? true : undefined)
	set('accountId', draft.accountId || undefined)
	set('minimum', draft.accountId && draft.minimum && draft.minimum.minor > 0 ? draft.minimum : undefined)
	set('url', safeUrl(draft.url))
	const insurance = isInsurance(draft.insurance) ? draft.insurance : undefined
	const medical = insurance === 'medical'
	const insurer = medical && typeof draft.insurer === 'string' ? draft.insurer.trim().slice(0, MAX_NAME) : ''
	set('insurance', insurance)
	set('eob', medical && draft.eob ? true : undefined)
	set('insurer', insurer || undefined)
	set('serviceDay', medical && isDay(draft.serviceDay) ? draft.serviceDay : undefined)
	if (bill.repeat && !bill.seriesId) bill.seriesId = id
	if (!bill.accountId) {
		delete bill.statementDay
		delete bill.interest
	}
	return bill
}

/** The live bill a draft is a new copy of: the same payee (by `merchantKey`) and period. */
export function sameBill(draft: Pick<BillDraft, 'payee' | 'period'>, bills: readonly Bill[]): Bill | undefined {
	const key = merchantKey(draft.payee)
	if (!key || !draft.period) return undefined
	return bills.find((bill) => bill.period === draft.period && merchantKey(bill.payee) === key)
}

/**
 * A draft over the bill it updates (a corrected letter, an actual bill replacing an estimate): the amount, the due
 * day and the minimum are the draft's, the estimate flag is cleared, and the rest stays the bill's.
 */
export function draftOver(bill: Bill, draft: BillDraft): BillDraft {
	const base = draftOfBill(bill)
	delete base.estimate
	return {
		...base,
		amount: draft.amount,
		...(draft.due ? { due: draft.due } : {}),
		...(draft.minimum ? { minimum: draft.minimum } : {}),
		...(draft.accountId && !base.accountId ? { accountId: draft.accountId } : {}),
		...(draft.url && !base.url ? { url: draft.url } : {}),
		...(draft.source ? { source: draft.source } : {}),
	}
}

/** What the Gardener answers for one bill (`finance.draft`'s schema). */
export interface BillAnswer {
	isBill?: boolean
	payee?: string
	amount?: string
	currency?: string
	due?: string
	period?: string
	estimate?: boolean
	minimum?: string
	last4?: string
	repeats?: string
	url?: string
	/** `none`, `premium` or `medical`. */
	insurance?: string
	/** An insurer's explanation of benefits. */
	eob?: boolean
	insurer?: string
	serviceDay?: string
}

/** The answer's currency code, the home one when it names none. */
const codeOf = (given: BillAnswer, home: string) =>
	typeof given.currency === 'string' && given.currency.trim() ? given.currency.trim().toUpperCase() : home

/** An EOB whose amount reads as 0: the owner owes nothing, so there is no bill. */
export function eobNothingOwed(answer: unknown, home: string): boolean {
	if (typeof answer !== 'object' || answer === null || Array.isArray(answer)) return false
	const given = answer as BillAnswer
	if (given.eob !== true || typeof given.amount !== 'string' || !given.amount.trim()) return false
	const code = codeOf(given, home)
	if (!isCurrency(code)) return false
	try {
		const parsed = parseMoney(given.amount, code, 'en')
		return !('error' in parsed) && parsed.minor === 0
	} catch {
		return false
	}
}

const REPEATS: Record<string, BillRepeat | undefined> = { month: 1, quarter: 3, 'half-year': 6, year: 12 }

/** A printed figure in the currency: "$1,204.18", "142.37"; positive or nothing. */
function figureOf(text: unknown, currency: string): Money | undefined {
	if (typeof text !== 'string' || !text.trim()) return undefined
	try {
		const parsed = parseMoney(text, currency, 'en')
		return 'error' in parsed || parsed.minor <= 0 ? undefined : parsed
	} catch {
		return undefined
	}
}

/**
 * The model's answer as a draft: nothing when it says this is not a bill, names no payee, or gives an amount that does
 * not read in its currency. A statement naming the last four digits of an open credit card becomes that card's. An
 * EOB (#85) is not a bill yet: the provider's estimate, medical, with no due day, for the month of the day of service,
 * never repeating and never a card's.
 */
export function billDraftOf(
	answer: unknown,
	accounts: readonly Account[],
	today: string,
	home: string
): BillDraft | undefined {
	if (typeof answer !== 'object' || answer === null || Array.isArray(answer)) return undefined
	const given = answer as BillAnswer
	const eob = given.eob === true
	if (given.isBill !== true && !eob) return undefined
	const payee = typeof given.payee === 'string' ? given.payee.trim().slice(0, MAX_NAME) : ''
	if (!payee) return undefined
	const code = codeOf(given, home)
	if (!isCurrency(code)) return undefined
	const amount = figureOf(given.amount, code)
	if (!amount) return undefined
	const serviceDay = isDay(given.serviceDay) ? given.serviceDay : undefined
	if (eob) {
		const insurer = typeof given.insurer === 'string' ? given.insurer.trim().slice(0, MAX_NAME) : ''
		return {
			payee,
			amount,
			period: serviceDay ? serviceDay.slice(0, 7) : isPeriod(given.period) ? given.period : today.slice(0, 7),
			source: 'letter',
			estimate: true,
			insurance: 'medical',
			eob: true,
			...(insurer ? { insurer } : {}),
			...(serviceDay ? { serviceDay } : {}),
		}
	}
	const insurance = isInsurance(given.insurance) ? given.insurance : undefined
	const due = isDay(given.due) ? given.due : undefined
	const period = isPeriod(given.period) ? given.period : due ? due.slice(0, 7) : today.slice(0, 7)
	const card =
		typeof given.last4 === 'string' && /^\d{4}$/.test(given.last4)
			? accounts.find((account) => account.kind === 'credit-card' && !account.closedOn && account.last4 === given.last4)
			: undefined
	const minimum = card ? figureOf(given.minimum, code) : undefined
	const repeat = typeof given.repeats === 'string' ? REPEATS[given.repeats] : undefined
	const url = safeUrl(given.url)
	return {
		payee,
		amount,
		period,
		source: 'letter',
		...(due ? { due } : {}),
		...(given.estimate === true ? { estimate: true } : {}),
		...(repeat && (BILL_REPEATS as readonly number[]).includes(repeat) ? { repeat } : {}),
		...(card ? { accountId: card.id } : {}),
		...(minimum ? { minimum } : {}),
		...(url ? { url } : {}),
		...(insurance ? { insurance } : {}),
		...(insurance === 'medical' && serviceDay ? { serviceDay } : {}),
	}
}

// ---- Ops -------------------------------------------------------------------------------------------------------

const update = (bill: Bill): BatchOp => ({ op: 'updateEntity', id: bill.id, payload: payloadOf(bill) })
const create = (bill: Bill): BatchOp => ({
	op: 'createEntity',
	input: { id: bill.id, type: FINANCE.bill, payload: payloadOf(bill) },
})

/** A letter read on this device, by its fingerprint, and the bill it made. */
export interface FileImport {
	id: string
	fingerprint: string
	day: string
}

/** Stores a bill, new or changed, with the `file-import` row of the letter it came from; the inverse takes it back. */
export function billOps(was: Bill | undefined, bill: Bill, read?: FileImport): Ops {
	const ops: BatchOp[] = [was ? update(bill) : create(bill)]
	const inverse: BatchOp[] = [was ? update(was) : { op: 'delete', uri: toUri(FINANCE.bill, bill.id) }]
	if (read) {
		const payload: LetterImportPayload = { kind: 'letter', day: read.day, billId: bill.id, rows: 1 }
		ops.push({
			op: 'createEntity',
			input: {
				id: read.id,
				type: FINANCE.fileImport,
				source: FILE_IMPORT_SOURCE,
				externalId: read.fingerprint,
				payload,
			},
		})
		inverse.push({ op: 'delete', uri: toUri(FINANCE.fileImport, read.id) })
	}
	return { ops, inverse }
}

/** Updates bills; the inverse puts each back as it was. */
export function billUpdateOps(pairs: readonly { was: Bill; bill: Bill }[]): Ops {
	return { ops: pairs.map((pair) => update(pair.bill)), inverse: pairs.map((pair) => update(pair.was)) }
}

/** Tombstones a bill with the `file-import` rows that made it and its open Orchard task; the inverse restores them. */
export function deleteBillOps(bill: Bill, fileImportIds: readonly string[], taskIds: readonly string[]): Ops {
	const uris = [
		toUri(FINANCE.bill, bill.id),
		...fileImportIds.map((id) => toUri(FINANCE.fileImport, id)),
		...taskIds.map((id) => toUri('task', id)),
	]
	return {
		ops: uris.map((uri) => ({ op: 'delete', uri })),
		inverse: uris.map((uri) => ({ op: 'restore', uri })),
	}
}

/** A bill's create and update, for the bill pass. */
export const billCreateOp = create
export const billUpdateOp = update
