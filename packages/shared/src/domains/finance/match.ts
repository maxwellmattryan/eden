// Which payment paid which bill (product/domains/finance.md §6, D-196), pure so it is tested here. A candidate is a
// posted money-out row in the bill's window whose payee matches and whose amount is close; exactly one pays the bill,
// two or more ask the owner. A card statement's payments are every `card-payment` row into its card after the
// statement day. The owner's Mark paid lists the payments in the window whatever their amount.
import type { Entity } from '../../data/index.js'
import { addDays } from '../../dates/index.js'
import { money, shareOf, type Money } from '../../money/index.js'
import {
	CANDIDATES_SHOWN,
	CLOSE_BP,
	ESTIMATE_CLOSE_BP,
	MERCHANT_IDS,
	NO_DUE_WINDOW_DAYS,
	WINDOW_DAYS,
	isStatement,
	remainingOf,
	settled,
} from './bills.js'
import { cleanMerchant, merchantKey } from './merchants.js'
import type { Bill, BillPayment, TransactionPayload } from './types.js'

type Row = Entity<TransactionPayload>

/** Words too common in a bank's line to say two names are the same payee. */
const COMMON = new Set([
	'payment',
	'payments',
	'autopay',
	'online',
	'bill',
	'bills',
	'service',
	'services',
	'debit',
	'purchase',
	'card',
	'recurring',
	'company',
	'monthly',
])
const MIN_WORD = 4

const wordsOf = (key: string) => key.split(' ').filter((word) => word.length >= MIN_WORD && !COMMON.has(word))

/** Whether `short` reads as an abbreviation of `long`: the same first letter, and its letters in order within it. */
function abbreviates(short: string, long: string): boolean {
	if (short.length < MIN_WORD || short[0] !== long[0]) return false
	let at = 0
	for (const letter of long) if (letter === short[at]) at += 1
	return at === short.length
}

/**
 * Whether a bank's cleaned name is the bill's payee: after `merchantKey`, one contains the other, they share a word
 * of four or more letters, or the name's first word abbreviates the payee ("TXGAS SVC" for "Texas Gas Service").
 */
export function payeeMatches(payee: string, cleaned: string): boolean {
	const a = merchantKey(payee)
	const b = merchantKey(cleaned)
	if (!a || !b) return false
	const compactA = a.replace(/ /g, '')
	const compactB = b.replace(/ /g, '')
	const shorter = compactA.length <= compactB.length ? compactA : compactB
	if (shorter.length >= MIN_WORD && (compactA.includes(compactB) || compactB.includes(compactA))) return true
	const theirs = new Set(wordsOf(b))
	if (wordsOf(a).some((word) => theirs.has(word))) return true
	const first = b.split(' ')[0] ?? ''
	return /^\p{L}+$/u.test(first) && !COMMON.has(first) && abbreviates(first, compactA)
}

/**
 * The days a bill's payment falls in, both ends included: 14 days either side of the due day; with no due day, the
 * period's start to 60 days after; a card statement's, after the statement day to 14 days past the due day.
 */
export function windowOf(bill: Pick<Bill, 'due' | 'period' | 'statementDay'>): { from: string; to: string } {
	if (bill.statementDay)
		return {
			from: addDays(bill.statementDay, 1),
			to: addDays(bill.due ?? addDays(bill.statementDay, 30), WINDOW_DAYS),
		}
	if (bill.due) return { from: addDays(bill.due, -WINDOW_DAYS), to: addDays(bill.due, WINDOW_DAYS) }
	const start = `${bill.period}-01`
	return { from: start, to: addDays(start, NO_DUE_WINDOW_DAYS) }
}

const inWindow = (day: string, window: { from: string; to: string }) => day >= window.from && day <= window.to
const sizeOf = (amount: Money) => Math.abs(amount.minor)

/** The transaction ids every bill's payments name, and the rows' own `billId`: what is claimed, and by which bill. */
export function claimsOf(bills: readonly Bill[], rows: readonly Row[]): Map<string, string> {
	const claims = new Map<string, string>()
	for (const row of rows) if (row.payload.billId) claims.set(row.id, row.payload.billId)
	for (const bill of bills)
		for (const payment of bill.payments ?? []) if (payment.transactionId) claims.set(payment.transactionId, bill.id)
	return claims
}

/** Whether a row's size is close to the bill's: within 2%, or 15% for an estimate. */
function close(bill: Bill, amount: Money): boolean {
	const tolerance = shareOf(bill.amount, bill.estimate ? ESTIMATE_CLOSE_BP : CLOSE_BP).minor
	return Math.abs(sizeOf(amount) - bill.amount.minor) <= tolerance
}

/**
 * The rows that could have paid a bill: posted, in its currency and window, not another bill's, not dismissed for
 * it and not already its payment. A card statement's are the `card-payment` rows into its card; any other bill's are
 * money-out rows that are not a transfer or a card payment (a card charge counts), whose payee matches and whose
 * amount is close.
 */
export function candidatesFor(bill: Bill, rows: readonly Row[], claims: ReadonlyMap<string, string>): Row[] {
	const window = windowOf(bill)
	const own = new Set((bill.payments ?? []).map((payment) => payment.transactionId).filter(Boolean))
	const dismissed = new Set(bill.dismissed ?? [])
	return rows.filter((row) => {
		const tx = row.payload
		if (row.deletedAt || tx.pending || own.has(row.id) || dismissed.has(row.id)) return false
		const claimed = claims.get(row.id)
		if (claimed && claimed !== bill.id) return false
		if (tx.amount.currency !== bill.amount.currency || !inWindow(tx.day, window)) return false
		if (isStatement(bill)) return tx.accountId === bill.accountId && tx.amount.minor > 0 && tx.kind === 'card-payment'
		if (tx.amount.minor >= 0 || tx.kind === 'transfer' || tx.kind === 'card-payment') return false
		const known = tx.merchantId && bill.merchantIds?.includes(tx.merchantId)
		if (!known && !payeeMatches(bill.payee, cleanMerchant(tx.name, tx.merchantName))) return false
		return close(bill, tx.amount)
	})
}

/** A row as a bill's payment. */
export const paymentOf = (row: Row): BillPayment => ({
	transactionId: row.id,
	amount: money(sizeOf(row.payload.amount), row.payload.amount.currency),
	day: row.payload.day,
	accountId: row.payload.accountId,
})

/**
 * A bill paid by a row: the payment added, the row's merchant learned, and an estimate's amount the payment's when
 * `actual` (a match, not a part paid by hand); its candidates are let go.
 */
export function paidWith(bill: Bill, row: Row, options: { actual?: boolean } = {}): Bill {
	const next: Bill = { ...bill, payments: [...(bill.payments ?? []), paymentOf(row)] }
	delete next.ask
	const merchant = row.payload.merchantId
	if (merchant && !next.merchantIds?.includes(merchant))
		next.merchantIds = [...(next.merchantIds ?? []), merchant].slice(-MERCHANT_IDS)
	if (options.actual && bill.estimate && !isStatement(bill) && !bill.payments?.length) {
		next.amount = paymentOf(row).amount
		delete next.estimate
	}
	return next
}

/** A row that paid a bill, as the row: it carries the bill's id. */
const claimed = (row: Row, billId: string): Row => ({ ...row, payload: { ...row.payload, billId } })

export interface MatchOut {
	/** Every bill, matched. */
	bills: Bill[]
	/** The rows that took a bill's id. */
	rows: Row[]
	/** The bills that now ask the owner which payment paid them. */
	asks: string[]
}

/**
 * The matching pass over the open bills, the earliest due first so it claims first. A card statement takes every
 * candidate; any other bill is paid by its one candidate, asks with two or more, and once settled takes one more
 * close payment (flagged overpaid by its total) when no other open bill of its payee could.
 */
export function matchOps(bills: readonly Bill[], rows: readonly Row[]): MatchOut {
	const claims = claimsOf(bills, rows)
	const out = new Map(bills.map((bill) => [bill.id, bill]))
	const changedRows = new Map<string, Row>()
	const asks: string[] = []
	const key = (bill: Bill) => `${bill.due ?? `${bill.period}-99`}:${bill.id}`
	const order = [...bills].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0))
	const take = (bill: Bill, row: Row, actual: boolean): Bill => {
		claims.set(row.id, bill.id)
		changedRows.set(row.id, claimed(changedRows.get(row.id) ?? row, bill.id))
		return paidWith(bill, row, { actual })
	}
	for (const start of order) {
		let bill = out.get(start.id)!
		const found = candidatesFor(bill, rows, claims)
		if (isStatement(bill)) {
			for (const row of found.sort((a, b) => (a.payload.day < b.payload.day ? -1 : 1))) bill = take(bill, row, false)
		} else if (!settled(bill)) {
			if (found.length === 1) bill = take(bill, found[0]!, true)
			else if (found.length > 1) {
				const ids = found.map((row) => row.id).sort()
				if (JSON.stringify(ids) !== JSON.stringify(bill.ask)) bill = { ...bill, ask: ids }
				asks.push(bill.id)
			} else if (bill.ask) {
				bill = { ...bill }
				delete bill.ask
			}
		} else if (found.length === 1) {
			const payee = merchantKey(bill.payee)
			const another = [...out.values()].some(
				(other) =>
					other.id !== bill.id &&
					merchantKey(other.payee) === payee &&
					!settled(other) &&
					candidatesFor(other, [found[0]!], claims).length > 0
			)
			if (!another) bill = take(bill, found[0]!, false)
		}
		out.set(bill.id, bill)
	}
	return { bills: bills.map((bill) => out.get(bill.id)!), rows: [...changedRows.values()], asks }
}

/**
 * What Mark paid lists: up to 20 posted money-out rows in the window whatever their amount (and, for a card
 * statement, the payments into its card), not another bill's and not already this one's; the payee's first, then by
 * how close each is to what is left to pay.
 */
export function paymentChoices(bill: Bill, rows: readonly Row[], bills: readonly Bill[]): Row[] {
	const claims = claimsOf(bills, rows)
	const window = windowOf(bill)
	const own = new Set((bill.payments ?? []).map((payment) => payment.transactionId).filter(Boolean))
	const target = (remainingOf(bill) ?? bill.amount).minor
	const choices = rows.filter((row) => {
		const tx = row.payload
		if (row.deletedAt || tx.pending || own.has(row.id)) return false
		const claimed = claims.get(row.id)
		if (claimed && claimed !== bill.id) return false
		if (tx.amount.currency !== bill.amount.currency || !inWindow(tx.day, window)) return false
		if (tx.amount.minor < 0) return true
		return isStatement(bill) && tx.accountId === bill.accountId && tx.amount.minor > 0
	})
	const score = (row: Row) => ({
		payee: payeeMatches(bill.payee, cleanMerchant(row.payload.name, row.payload.merchantName)) ? 0 : 1,
		off: Math.abs(sizeOf(row.payload.amount) - target),
	})
	return choices
		.map((row) => ({ row, ...score(row) }))
		.sort((a, b) => a.payee - b.payee || a.off - b.off || (a.row.payload.day > b.row.payload.day ? -1 : 1))
		.slice(0, CANDIDATES_SHOWN)
		.map((entry) => entry.row)
}
