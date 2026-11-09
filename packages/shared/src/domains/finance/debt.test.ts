import { describe, expect, it } from 'vitest'
import { money } from '../../money/index.js'
import {
	effectiveTerms,
	loanOps,
	parseRate,
	payoffPlans,
	promoSignals,
	rateOf,
	scheduleOps,
	usageOf,
	type PlanDebt,
} from './debt.js'
import { WHOLE, type Account, type Bill, type Liability } from './types.js'

const usd = (minor: number) => money(minor, 'USD')
const account = (id: string, fields: Partial<Account> = {}): Account => ({
	id,
	name: id,
	kind: 'credit-card',
	currency: 'USD',
	share: WHOLE,
	...fields,
})
const liability = (accountId: string, fields: Partial<Liability> = {}): Liability => ({
	id: `l-${accountId}`,
	accountId,
	...fields,
})
const statement = (accountId: string, statementDay: string, minimum: number): Bill => ({
	id: `b-${statementDay}`,
	payee: accountId,
	period: statementDay.slice(0, 7),
	amount: usd(100000),
	source: 'statement',
	accountId,
	statementDay,
	minimum: usd(minimum),
})
const ids = () => {
	let next = 0
	return () => `id-${++next}`
}
const debt = (accountId: string, balance: number, rate: number | undefined, minimum: number | undefined): PlanDebt => ({
	accountId,
	name: accountId,
	balance: usd(balance),
	...(rate !== undefined ? { rate } : {}),
	...(minimum !== undefined ? { minimum: usd(minimum) } : {}),
})

describe('rates', () => {
	it('reads a rate in basis points', () => {
		const table: [string, number | undefined][] = [
			['15.24', 1524],
			['0', 0],
			['15.245', 1525],
			['15.2449', 1524],
			['5.9', 590],
			['999.99', 99999],
			['-1', undefined],
			['1000', undefined],
			['abc', undefined],
			['', undefined],
		]
		for (const [text, points] of table) {
			expect(rateOf(text), text).toBe(points)
			expect(parseRate(text, 'en'), text).toBe(points)
		}
		expect(parseRate('24.99%', 'en')).toBe(2499)
		expect(parseRate('24,99', 'de')).toBe(2499)
		expect(parseRate('24,99', 'en')).toBeUndefined()
	})
})

describe('terms', () => {
	it("takes the owner's terms over the provider's, and an intro rate until it ends", () => {
		const card = account('c')
		const aprs = [
			{ kind: 'balance-transfer' as const, rate: 1524 },
			{ kind: 'purchase' as const, rate: 2499 },
			{ kind: 'cash' as const, rate: 2999 },
		]
		const today = '2026-11-08'
		expect(effectiveTerms(card, liability('c', { aprs }), [], today).rate).toBe(2499)
		expect(
			effectiveTerms(card, liability('c', { aprs: aprs.filter((apr) => apr.kind !== 'purchase') }), [], today).rate
		).toBe(2999)
		expect(effectiveTerms(card, liability('c', { aprs, rate: 1999 }), [], today).rate).toBe(1999)
		expect(effectiveTerms(card, undefined, [], today)).toEqual({})

		const promo = { rate: 0, ends: '2026-12-01' }
		expect(effectiveTerms(card, liability('c', { promo }), [], '2026-11-30').promo).toEqual(promo)
		expect(effectiveTerms(card, liability('c', { promo }), [], '2026-12-01').promo).toBeUndefined()

		expect(effectiveTerms(card, liability('c', { limit: usd(500000) }), [], today).limit).toEqual(usd(500000))
		expect(
			effectiveTerms(card, liability('c', { limit: usd(500000), ownerLimit: usd(800000) }), [], today).limit
		).toEqual(usd(800000))

		// a card's minimum comes from its latest live statement bill, else the owner's payment
		const bills = [
			statement('c', '2026-09-14', 3500),
			statement('c', '2026-10-14', 4000),
			statement('x', '2026-11-01', 9),
		]
		const paying = liability('c', { payment: usd(20000) })
		expect(effectiveTerms(card, paying, bills, today).minimum).toEqual(usd(4000))
		expect(effectiveTerms(card, paying, [], today).minimum).toEqual(usd(20000))

		// a loan: the owner's rate and payment, else the provider's
		const loan = account('l', { kind: 'loan' })
		const provider = { loan: { rate: 525, minimum: usd(2500) } }
		expect(effectiveTerms(loan, liability('l', provider), [], today)).toEqual({ rate: 525, minimum: usd(2500) })
		expect(effectiveTerms(loan, liability('l', { ...provider, rate: 590, payment: usd(41200) }), bills, today)).toEqual(
			{
				rate: 590,
				minimum: usd(41200),
			}
		)
	})
})

describe('usage', () => {
	it('measures card usage against limit, per card and overall', () => {
		const accounts = [
			account('high', { balance: usd(150000) }),
			account('credit', { balance: usd(-2000) }),
			account('none', { balance: usd(40000) }),
			account('euro', { currency: 'EUR', balance: money(10000, 'EUR') }),
			account('closed', { balance: usd(90000), closedOn: '2026-10-01' }),
			account('loan', { kind: 'loan', balance: usd(100000) }),
		]
		const liabilities = [
			liability('high', { limit: usd(500000) }),
			liability('credit', { ownerLimit: usd(100000) }),
			liability('euro', { limit: money(100000, 'EUR') }),
			liability('closed', { limit: usd(100000) }),
		]
		const usage = usageOf(accounts, liabilities, 'USD')
		expect(usage.cards.map((card) => [card.accountId, card.usage, card.warn])).toEqual([
			['high', 3000, true],
			['credit', 0, false],
			['none', undefined, false],
			['euro', 1000, false],
		])
		expect(usage.cards[1]!.owed).toEqual(usd(0))
		expect(usage.overall).toEqual({ usage: 2500, owed: usd(150000), limit: usd(600000), warn: false })
		expect(usage.left).toEqual([{ currency: 'EUR', count: 1 }])
		expect(usageOf([account('none', { balance: usd(1) })], [], 'USD').overall).toBeUndefined()
	})
})

describe('payoff plan', () => {
	const today = '2026-11-08'

	it('plans the payoff both ways', () => {
		// 100.00 at 12 % paying 50.00: 1.00, 0.51 and 0.02 of interest over three months
		const one = payoffPlans({ debts: [debt('a', 10000, 1200, 5000)], extra: usd(0), today })
		for (const plan of [one.interest, one.balance]) {
			expect(plan.months).toBe(3)
			expect(plan.debtFree).toBe('2027-01')
			expect(plan.interest).toEqual(usd(153))
			expect(plan.order).toEqual([{ accountId: 'a', paidOff: '2027-01', interest: usd(153) }])
		}

		// with an extra, the avalanche targets the higher rate and the snowball the smaller balance
		const two = payoffPlans({
			debts: [debt('big', 100000, 2400, 2500), debt('small', 50000, 1200, 2500)],
			extra: usd(20000),
			today,
		})
		expect(two.interest.order.map((entry) => entry.accountId)).toEqual(['big', 'small'])
		expect(two.balance.order.map((entry) => entry.accountId)).toEqual(['small', 'big'])
		expect(two.interest.interest.minor).toBeLessThanOrEqual(two.balance.interest.minor)
		expect(two.interest.months).toBeDefined()

		// a freed minimum rolls on: at 0 %, 1000.00 and 200.00 paying 100.00 each are done in six months, not ten
		const rolled = payoffPlans({
			debts: [debt('a', 100000, 0, 10000), debt('b', 20000, 0, 10000)],
			extra: usd(0),
			today,
		})
		for (const plan of [rolled.interest, rolled.balance]) {
			expect(plan.months).toBe(6)
			expect(plan.order).toEqual([
				{ accountId: 'b', paidOff: '2026-12', interest: usd(0) },
				{ accountId: 'a', paidOff: '2027-04', interest: usd(0) },
			])
		}

		// a payment that never covers the interest is not paid off within 600 months
		const never = payoffPlans({ debts: [debt('a', 100000, 2400, 1000)], extra: usd(0), today }).interest
		expect(never.months).toBeUndefined()
		expect(never.debtFree).toBeUndefined()
		expect(never.order).toEqual([{ accountId: 'a', interest: never.interest }])

		// an intro rate's months accrue at the intro rate
		const intro = (ends: string) =>
			payoffPlans({ debts: [{ ...debt('a', 100000, 2400, 10000), promo: { rate: 0, ends } }], extra: usd(0), today })
				.interest
		expect(intro('2028-01-01').interest).toEqual(usd(0))
		expect(intro('2028-01-01').months).toBe(10)
		const plain = payoffPlans({ debts: [debt('a', 100000, 2400, 10000)], extra: usd(0), today }).interest
		expect(intro('2027-01-01').interest.minor).toBeGreaterThan(0)
		expect(intro('2027-01-01').interest.minor).toBeLessThan(plain.interest.minor)

		// a debt with no rate or no minimum is listed as missing
		const missing = payoffPlans({
			debts: [
				debt('a', 10000, 1200, 5000),
				debt('norate', 10000, undefined, 5000),
				debt('nomin', 10000, 1200, undefined),
			],
			extra: usd(0),
			today,
		})
		expect(missing.interest.missing).toEqual([
			{ accountId: 'norate', need: 'rate' },
			{ accountId: 'nomin', need: 'minimum' },
		])
		expect(missing.interest.order.map((entry) => entry.accountId)).toEqual(['a'])
	})
})

describe('schedule', () => {
	const loan = (fields: Partial<Account> = {}) =>
		account('loan', {
			kind: 'loan',
			balance: usd(1000000),
			balanceAt: '2026-09-03T12:00:00.000Z',
			...fields,
		})
	const terms = liability('loan', { rate: 1200, payment: usd(50000), dueDay: 5 })

	it("runs a hand-entered loan's schedule by itself", () => {
		const now = '2026-10-08T12:00:00.000Z'
		const run = scheduleOps({
			accounts: [loan()],
			liabilities: [terms],
			today: '2026-10-08',
			nowIso: now,
			newId: ids(),
		})
		// two due days passed (Sep 5 and Oct 5): 10000.00 + 100.00 − 500.00, then 9600.00 + 96.00 − 500.00
		expect(run.accounts).toHaveLength(1)
		expect(run.accounts[0]!.balance).toEqual(usd(919600))
		expect(run.accounts[0]!.balanceAt).toBe(now)
		expect(run.ops.map((op) => op.op)).toEqual(['updateEntity', 'createEntity'])
		expect(run.inverse).toHaveLength(2)
		expect(run.paidOff).toEqual([])

		// again the same day: nothing
		const again = scheduleOps({
			accounts: run.accounts,
			liabilities: [terms],
			today: '2026-10-08',
			nowIso: now,
			newId: ids(),
		})
		expect(again.ops).toEqual([])

		// a linked loan is never stepped
		const linked = scheduleOps({
			accounts: [loan({ linkId: 'link' })],
			liabilities: [terms],
			today: '2026-10-08',
			nowIso: now,
			newId: ids(),
		})
		expect(linked.ops).toEqual([])

		// one that reaches 0 is paid off
		const done = scheduleOps({
			accounts: [loan({ balance: usd(60000) })],
			liabilities: [liability('loan', { rate: 0, payment: usd(50000), dueDay: 5 })],
			today: '2026-10-08',
			nowIso: now,
			newId: ids(),
		})
		expect(done.accounts[0]!.balance).toEqual(usd(0))
		expect(done.paidOff).toEqual(['loan'])
	})

	it("adds a loan Plaid can't see with its payment as a repeating bill", () => {
		const draft = {
			name: ' Car loan ',
			lender: 'Credit union',
			currency: 'USD',
			balance: usd(1200000),
			rate: 590,
			payment: usd(41200),
			dueDay: 5,
		}
		const made = loanOps(draft, '2026-11-08', '2026-11-08T12:00:00.000Z', ids())
		expect(made.account).toMatchObject({
			name: 'Car loan',
			kind: 'loan',
			institution: 'Credit union',
			balance: usd(1200000),
		})
		expect(made.account.linkId).toBeUndefined()
		expect(made.liability).toMatchObject({
			accountId: made.account.id,
			rate: 590,
			payment: usd(41200),
			dueDay: 5,
			billId: made.bill.id,
		})
		expect(made.bill).toMatchObject({
			payee: 'Car loan',
			due: '2026-12-05',
			period: '2026-12',
			amount: usd(41200),
			source: 'manual',
			repeat: { months: 1 },
			fixed: true,
			seriesId: made.bill.id,
		})
		const types = made.ops.map((op) => (op.op === 'createEntity' ? op.input.type : op.op))
		expect(types).toEqual(['account', 'balance-snapshot', 'liability', 'bill'])
		expect(made.inverse.every((op) => op.op === 'delete')).toBe(true)
		expect(made.inverse).toHaveLength(4)
		const uris = made.inverse.map((op) => (op.op === 'delete' ? op.uri : ''))
		for (const id of [made.account.id, made.liability.id, made.bill.id, made.account.lastSnapshot!.id])
			expect(uris.some((uri) => uri.endsWith(id))).toBe(true)

		// a due day already past this month moves to the next; 31 is the month's last day
		expect(loanOps({ ...draft, dueDay: 8 }, '2026-11-08', '2026-11-08T12:00:00.000Z', ids()).bill.due).toBe(
			'2026-11-08'
		)
		expect(loanOps({ ...draft, dueDay: 31 }, '2026-11-08', '2026-11-08T12:00:00.000Z', ids()).bill.due).toBe(
			'2026-11-30'
		)
	})
})

describe('promo signal', () => {
	it('says a month ahead when an intro rate ends', () => {
		const card = account('c', { name: 'Sapphire', balance: usd(100000) })
		const promo = liability('c', { promo: { rate: 0, ends: '2026-12-01' } })
		const said = (today: string, accounts = [card], liabilities = [promo]) =>
			promoSignals({ accounts, liabilities, today, dayLabel: (day) => `day ${day}` })
		expect(said('2026-11-01')).toEqual([
			{
				name: 'finance.promo-ending',
				payload: { uris: ['eden://account/c'], card: 'Sapphire', endsDay: 'day 2026-12-01' },
				dedupeKey: 'c:promo:2026-12-01',
			},
		])
		expect(said('2026-12-01')).toHaveLength(1)
		expect(said('2026-10-31')).toEqual([])
		expect(said('2026-12-02')).toEqual([])
		expect(said('2026-11-15', [card], [liability('c')])).toEqual([])
		expect(said('2026-11-15', [{ ...card, closedOn: '2026-11-10' }])).toEqual([])
	})
})
