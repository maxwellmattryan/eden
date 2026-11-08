// The recurring pass (product/domains/finance.md §3, D-196): after the classification pass, the charges at one
// merchant (and person, for a vague one) in one currency are split into series by size and gap, a series that keeps a
// cadence becomes a `recurring-charge` row, and its charges point at it by `recurringId`. A row keeps its id across
// passes through the ids its charges name, and keeps the owner's answers; a fixed row that got dearer is a price rise
// to signal. Pure and idempotent: no stored field depends on today, so a second pass over the first one's result
// writes nothing. The helpers below read the rows for the consumers (#83, #78, #84, #87, #90) and take `today`.
import { toUri, type BatchOp, type Entity } from '../../data/index.js'
import { addDays } from '../../dates/index.js'
import { money, sumMoney, type Money } from '../../money/index.js'
import { payloadOf } from './accounts.js'
import { addMonthsClamped } from './bills.js'
import { categoryOfRow, daysApart } from './classify.js'
import type { Edit } from './edits.js'
import { same } from './sync.js'
import {
	FINANCE,
	type Cadence,
	type Category,
	type Merchant,
	type PriceChange,
	type RecurringCharge,
	type RecurringPayload,
	type RecurringState,
	type TransactionPayload,
	type TxKind,
} from './types.js'

export interface CadenceRule {
	/** The interval window, in whole days, both ends in. */
	min: number
	max: number
	/** The fewest charges a series of this cadence has. */
	charges: number
	/** Days past `nextDay` a charge may be late and the row still be active. */
	grace: number
	/** How far `nextDay` is from the last charge. */
	step: { days: number } | { months: number }
}

/** The cadences, tried in this order; the first whose rules a series meets is its own. */
export const CADENCE_RULES: Readonly<Record<Cadence, CadenceRule>> = {
	weekly: { min: 6, max: 8, charges: 4, grace: 3, step: { days: 7 } },
	biweekly: { min: 12, max: 16, charges: 3, grace: 5, step: { days: 14 } },
	monthly: { min: 26, max: 35, charges: 3, grace: 10, step: { months: 1 } },
	quarterly: { min: 84, max: 98, charges: 3, grace: 20, step: { months: 3 } },
	yearly: { min: 350, max: 380, charges: 2, grace: 30, step: { months: 12 } },
}
const ORDER: readonly Cadence[] = ['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly']

/** The fewest days between two charges of one series. */
export const MIN_GAP_DAYS = 5
/** The most price changes a row keeps. */
export const MAX_PRICE_CHANGES = 12
/** How many of the newest intervals the cadence reads. */
export const MAX_INTERVALS = 6
/** Whether `a` is within 25% of `b`, on minor units. */
export const BAND = (a: Money, b: Money) => 4 * Math.abs(a.minor - b.minor) <= Math.abs(b.minor)

/** The kinds that can be a recurring charge. */
const CHARGE_KINDS: readonly TxKind[] = ['purchase', 'fee', 'bill-payment']
/** The cadences a bill can track. */
const BILL_CADENCES: readonly Cadence[] = ['monthly', 'quarterly', 'yearly']

const size = (amount: Money) => Math.abs(amount.minor)
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

const nextDayOf = (last: string, cadence: Cadence) => {
	const step = CADENCE_RULES[cadence].step
	return 'days' in step ? addDays(last, step.days) : addMonthsClamped(last, step.months)
}

/** Whether a row is a charge the pass reads: posted, not one-off, money out, a spending kind, with a merchant. */
const isCharge = (row: TransactionPayload) =>
	!row.pending &&
	row.oneOff !== true &&
	row.amount.minor < 0 &&
	row.kind !== undefined &&
	CHARGE_KINDS.includes(row.kind) &&
	Boolean(row.merchantId)

type Row = Entity<TransactionPayload>

/** The lower median of some numbers. */
const lowerMedian = (values: readonly number[]) => [...values].sort((a, b) => a - b)[(values.length - 1) >> 1]!

/** A series' cadence: the first whose window holds the lower median and all intervals but one, with enough charges. */
export function cadenceOf(intervals: readonly number[], count: number): Cadence | undefined {
	const recent = intervals.slice(-MAX_INTERVALS)
	if (!recent.length) return undefined
	const median = lowerMedian(recent)
	const allowed = recent.length >= 3 ? 1 : 0
	return ORDER.find((cadence) => {
		const rule = CADENCE_RULES[cadence]
		const inside = (days: number) => days >= rule.min && days <= rule.max
		if (!inside(median) || count < rule.charges) return false
		return recent.filter((days) => !inside(days)).length <= allowed
	})
}

/** The charges of one group split into series: each joins the open series it fits best, or starts one. */
function seriesOf(charges: readonly Row[]): Row[][] {
	const sorted = [...charges].sort((a, b) => byText(a.payload.day, b.payload.day) || byText(a.id, b.id))
	const series: Row[][] = []
	for (const charge of sorted) {
		let best: { at: number; off: number; day: string } | undefined
		series.forEach((list, at) => {
			const last = list.at(-1)!.payload
			if (!BAND(charge.payload.amount, last.amount)) return
			if (daysApart(charge.payload.day, last.day) < MIN_GAP_DAYS) return
			const off = Math.abs(charge.payload.amount.minor - last.amount.minor)
			if (!best || off < best.off || (off === best.off && last.day < best.day)) best = { at, off, day: last.day }
		})
		if (best) series[best.at]!.push(charge)
		else series.push([charge])
	}
	return series
}

/** A recurring series and what the pass derives of it. */
interface Found {
	charges: Row[]
	derived: RecurringPayload
}

/** What a series is as a row, or nothing when it keeps no cadence. */
function derive(charges: readonly Row[]): RecurringPayload | undefined {
	const rows = charges.map((charge) => charge.payload)
	const intervals = rows.slice(1).map((row, at) => daysApart(row.day, rows[at]!.day))
	const cadence = cadenceOf(intervals, rows.length)
	if (!cadence) return undefined
	const recent = intervals.slice(-MAX_INTERVALS)
	const offset = rows.length - 1 - recent.length
	const differing = recent.filter((_, at) => rows[offset + at]!.amount.minor !== rows[offset + at + 1]!.amount.minor)
	const variable = differing.length * 2 > recent.length
	const first = rows[0]!
	const last = rows.at(-1)!
	let expected = last.amount
	if (variable && rows.length >= 3) {
		const three = rows.slice(-3).map((row) => row.amount)
		expected = [...three].sort((a, b) => size(a) - size(b))[1]!
	}
	const priceChanges: PriceChange[] = []
	if (!variable)
		for (let at = 1; at < rows.length; at += 1)
			if (rows[at]!.amount.minor !== rows[at - 1]!.amount.minor)
				priceChanges.push({ day: rows[at]!.day, from: rows[at - 1]!.amount, to: rows[at]!.amount })
	const categoryId = categoryOfRow(last)
	return {
		merchantId: last.merchantId!,
		...(last.counterparty ? { counterparty: last.counterparty } : {}),
		currency: last.amount.currency,
		cadence,
		...(variable ? { variable: true as const } : {}),
		expected,
		firstDay: first.day,
		lastDay: last.day,
		lastAmount: last.amount,
		nextDay: nextDayOf(last.day, cadence),
		accountId: last.accountId,
		...(categoryId ? { categoryId } : {}),
		count: rows.length,
		priceChanges: priceChanges.slice(-MAX_PRICE_CHANGES),
	}
}

const OWNER_KEYS = ['state', 'stateOn', 'billOffer', 'billId'] as const
const ownerOf = (payload: RecurringPayload): Partial<RecurringPayload> => {
	const kept: Partial<RecurringPayload> = {}
	for (const key of OWNER_KEYS) if (payload[key] !== undefined) Object.assign(kept, { [key]: payload[key] })
	return kept
}
const hasOwner = (payload: RecurringPayload) => OWNER_KEYS.some((key) => payload[key] !== undefined)

export interface RecurringInput {
	/** Every live transaction, after the classification pass (`withUpdates`). */
	rows: readonly Entity<TransactionPayload>[]
	/** The live `recurring-charge` rows. */
	charges: readonly Entity<RecurringPayload>[]
	newId: () => string
}

export interface RecurringOut {
	/** The row creates and updates, then the transactions' `recurringId`, then the deletes. */
	ops: BatchOp[]
	/** The live rows after the ops, by id. */
	charges: RecurringCharge[]
	/** The rows that got dearer since the last pass, with the day of the dearer charge. */
	rises: { id: string; day: string }[]
}

/**
 * The pass: the charges grouped by merchant, person and currency, split into series, each recurring series matched to
 * the live row its charges name most (a row goes to one series at most) or given a new id; a row no series took is
 * deleted unless the owner said something about it, which keeps it as it is.
 */
export function recurringOps(input: RecurringInput): RecurringOut {
	const rows = input.rows.filter((row) => !row.deletedAt)
	const existing = new Map(input.charges.filter((row) => !row.deletedAt).map((row) => [row.id, row.payload]))

	const groups = new Map<string, Row[]>()
	for (const row of rows) {
		if (!isCharge(row.payload)) continue
		const p = row.payload
		const key = JSON.stringify([p.merchantId, p.counterparty ?? '', p.amount.currency])
		const list = groups.get(key) ?? []
		list.push(row)
		groups.set(key, list)
	}
	const found: Found[] = []
	for (const group of groups.values())
		for (const charges of seriesOf(group)) {
			const derived = derive(charges)
			if (derived) found.push({ charges, derived })
		}
	found.sort(
		(a, b) =>
			b.derived.count - a.derived.count ||
			byText(a.derived.firstDay, b.derived.firstDay) ||
			byText(a.derived.merchantId, b.derived.merchantId) ||
			byText(a.charges[0]!.id, b.charges[0]!.id)
	)

	const taken = new Set<string>()
	const target = new Map<string, string>()
	const writes: BatchOp[] = []
	const live: RecurringCharge[] = []
	const rises: RecurringOut['rises'] = []
	for (const series of found) {
		const named = new Map<string, number>()
		for (const charge of series.charges) {
			const id = charge.payload.recurringId
			if (id && existing.has(id)) named.set(id, (named.get(id) ?? 0) + 1)
		}
		const ranked = [...named].sort((a, b) => b[1] - a[1] || byText(a[0], b[0])).map(([id]) => id)
		const id = ranked.find((entry) => !taken.has(entry)) ?? input.newId()
		taken.add(id)
		const was = existing.get(id)
		const payload: RecurringPayload = { ...series.derived, ...(was ? ownerOf(was) : {}) }
		live.push({ ...payload, id })
		for (const charge of series.charges) target.set(charge.id, id)
		if (!was) writes.push({ op: 'createEntity', input: { id, type: FINANCE.recurring, payload } })
		else {
			if (!same(was, payload)) writes.push({ op: 'updateEntity', id, payload })
			const change = payload.priceChanges.at(-1)
			if (
				!payload.variable &&
				payload.state !== 'cancelled' &&
				payload.state !== 'dismissed' &&
				change &&
				change.day > was.lastDay &&
				size(change.to) > size(change.from)
			)
				rises.push({ id, day: change.day })
		}
	}

	const updates: BatchOp[] = []
	for (const row of rows) {
		const id = target.get(row.id)
		if (row.payload.recurringId === id) continue
		const next = { ...row.payload }
		if (id) next.recurringId = id
		else delete next.recurringId
		updates.push({ op: 'updateEntity', id: row.id, payload: next })
	}

	const deletes: BatchOp[] = []
	for (const [id, payload] of existing) {
		if (taken.has(id)) continue
		if (hasOwner(payload)) live.push({ ...payload, id })
		else deletes.push({ op: 'delete', uri: toUri(FINANCE.recurring, id) })
	}

	live.sort((a, b) => byText(a.id, b.id))
	rises.sort((a, b) => byText(a.id, b.id))
	return { ops: [...writes, ...updates, ...deletes], charges: live, rises }
}

/** The rows with every `updateEntity` payload in the ops applied by id: what a pass wrote, without reading again. */
export function withUpdates<T>(rows: readonly Entity<T>[], ops: readonly BatchOp[]): Entity<T>[] {
	const payloads = new Map<string, T>()
	for (const op of ops) if (op.op === 'updateEntity') payloads.set(op.id, op.payload as T)
	return rows.map((row) => {
		const payload = payloads.get(row.id)
		return payload ? { ...row, payload } : row
	})
}

// ---- The helpers ---------------------------------------------------------------------------------------------------

export type RecurringStatus = 'active' | 'lapsed' | 'cancelled' | 'dismissed'

/** What the owner said, else whether the next charge is still due within its grace. */
export function statusOf(charge: RecurringPayload, today: string): RecurringStatus {
	if (charge.state === 'dismissed') return 'dismissed'
	if (charge.state === 'cancelled') return 'cancelled'
	return today <= addDays(charge.nextDay, CADENCE_RULES[charge.cadence].grace) ? 'active' : 'lapsed'
}

/** A charge the owner cancelled that was charged after the day they said so. */
export function chargedAfterCancel(charge: RecurringPayload): boolean {
	return charge.state === 'cancelled' && charge.stateOn !== undefined && charge.lastDay > charge.stateOn
}

/** A month's share of a cadence, as a fraction. */
const PER_MONTH: Readonly<Record<Cadence, [number, number]>> = {
	weekly: [52, 12],
	biweekly: [26, 12],
	monthly: [1, 1],
	quarterly: [1, 3],
	yearly: [1, 12],
}

/** The size of `expected` a month, positive, rounded half away from zero. */
export function monthlyCostOf(charge: RecurringPayload): Money {
	const [times, per] = PER_MONTH[charge.cadence]
	const scaled = size(charge.expected) * times
	return money(Math.floor((2 * scaled + per) / (2 * per)), charge.expected.currency)
}

/**
 * The active charges' monthly cost in the home currency, how many are active, in any currency, and one sum per other
 * currency, in the order first met (D-188).
 */
export function recurringTotals(
	charges: readonly RecurringPayload[],
	home: string,
	today: string
): { monthly: Money; count: number; left: Money[] } {
	const active = charges.filter((charge) => statusOf(charge, today) === 'active')
	const { total, left } = sumMoney(active.map(monthlyCostOf), home)
	const others = new Map<string, Money>()
	for (const value of left) {
		const sum = others.get(value.currency)
		others.set(value.currency, sumMoney(sum ? [sum, value] : [value], value.currency).total)
	}
	return { monthly: total, count: active.length, left: [...others.values()] }
}

/**
 * The same service charged twice: active charges of one merchant, person, currency and cadence, each within 25% of
 * the first in id order. Groups of two or more, each sorted by id, sorted by their first id.
 */
export function overlapsOf(charges: readonly RecurringCharge[], today: string): string[][] {
	const active = charges.filter((charge) => statusOf(charge, today) === 'active').sort((a, b) => byText(a.id, b.id))
	const groups: RecurringCharge[][] = []
	for (const charge of active) {
		const group = groups.find(([first]) => {
			const head = first!
			return (
				head.merchantId === charge.merchantId &&
				(head.counterparty ?? '') === (charge.counterparty ?? '') &&
				head.currency === charge.currency &&
				head.cadence === charge.cadence &&
				BAND(charge.expected, head.expected)
			)
		})
		if (group) group.push(charge)
		else groups.push([charge])
	}
	return groups.filter((group) => group.length >= 2).map((group) => group.map((charge) => charge.id))
}

/** Whether to offer tracking an active charge as a bill: a bill's cadence, not yet a bill or turned down, fixed group. */
export function offersBill(charge: RecurringPayload, categories: readonly Category[], today: string): boolean {
	if (statusOf(charge, today) !== 'active' || !BILL_CADENCES.includes(charge.cadence)) return false
	if (charge.billId || charge.billOffer) return false
	const category = charge.categoryId ? categories.find((entry) => entry.id === charge.categoryId) : undefined
	return category?.group === 'fixed'
}

/** The neutral shape #78 maps onto its `bill` payload. */
export interface RecurringBillDraft {
	recurringId: string
	merchantId: string
	counterparty?: string
	/** The merchant's current name, else the person, else empty. */
	payee: string
	cadence: Cadence
	/** Positive. */
	amount: Money
	nextDay: string
	accountId: string
	categoryId?: string
}

export function recurringBillDraft(charge: RecurringCharge, merchants: readonly Merchant[]): RecurringBillDraft {
	const merchant = merchants.find((entry) => entry.id === charge.merchantId)
	return {
		recurringId: charge.id,
		merchantId: charge.merchantId,
		...(charge.counterparty ? { counterparty: charge.counterparty } : {}),
		payee: merchant?.name ?? charge.counterparty ?? '',
		cadence: charge.cadence,
		amount: money(size(charge.expected), charge.currency),
		nextDay: charge.nextDay,
		accountId: charge.accountId,
		...(charge.categoryId ? { categoryId: charge.categoryId } : {}),
	}
}

// ---- The owner's answers -------------------------------------------------------------------------------------------

/** An owner's answer: the write and its way back, and the row as it will be. */
export type RecurringEdit = Edit & { charge: RecurringCharge }

function chargeEdit(charge: RecurringCharge, next: RecurringCharge): RecurringEdit | undefined {
	if (same(payloadOf(charge), payloadOf(next))) return undefined
	return {
		ops: [{ op: 'updateEntity', id: charge.id, payload: payloadOf(next) }],
		inverse: [{ op: 'updateEntity', id: charge.id, payload: payloadOf(charge) }],
		charge: next,
	}
}

/** Kept, cancelled or not a subscription, as of today; none clears it. Saying the same again changes nothing. */
export function recurringStateOps(
	charge: RecurringCharge,
	state: RecurringState | undefined,
	today: string
): RecurringEdit | undefined {
	if (charge.state === state) return undefined
	const next = { ...charge }
	if (state) Object.assign(next, { state, stateOn: today })
	else {
		delete next.state
		delete next.stateOn
	}
	return chargeEdit(charge, next)
}

/** Turns down tracking it as a bill, or takes that back. */
export function billOfferOps(charge: RecurringCharge, declined: boolean): RecurringEdit | undefined {
	const next = { ...charge }
	if (declined) next.billOffer = 'declined'
	else delete next.billOffer
	return chargeEdit(charge, next)
}

/** The `bill` that tracks it; none lets it go. */
export function linkBillOps(charge: RecurringCharge, billId: string | undefined): RecurringEdit | undefined {
	const next = { ...charge }
	if (billId) next.billId = billId
	else delete next.billId
	return chargeEdit(charge, next)
}
