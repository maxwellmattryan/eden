import { describe, expect, it } from 'vitest'
import type { Entity } from '../../data/index.js'
import type { Money } from '../../money/index.js'
import { settled, overpaidOf } from './bills.js'
import { candidatesFor, claimsOf, matchOps, payeeMatches, paymentChoices, windowOf } from './match.js'
import type { Bill, TransactionPayload } from './types.js'

const usd = (minor: number): Money => ({ minor, currency: 'USD' })

const bill = (fields: Partial<Bill> = {}): Bill => ({
	id: 'gas',
	payee: 'Texas Gas Service',
	period: '2026-09',
	due: '2026-09-26',
	amount: usd(3810),
	source: 'repeating',
	...fields,
})

type Fields = Partial<TransactionPayload> & { id: string; minor: number }
const row = ({ id, minor, ...fields }: Fields): Entity<TransactionPayload> => ({
	id,
	uri: `eden://transaction/${id}`,
	type: 'transaction',
	payload: { accountId: 'chk', amount: usd(minor), day: '2026-09-28', name: 'TXGAS SVC', pending: false, ...fields },
	createdAt: '',
	updatedAt: '',
	deletedAt: null,
	mirror: false,
	source: 'plaid',
	externalId: id,
	snapshot: null,
	links: [],
})

describe('bill matching', () => {
	it('matches a bank line to the payee', () => {
		const cases: [string, string, boolean][] = [
			['Texas Gas Service', 'TXGAS SVC', true],
			['Texas Gas Service', 'Texas Gas Autopay', true],
			['Texas Gas Service', 'texas gas service', true],
			['Hyde Park Lofts rent', 'Hyde Park Lofts', true],
			['City of Austin water', 'City Of Austin Utilities', true],
			['Austin Energy', 'AUSTINENERGY', true],
			['Texas Gas Service', 'TXU Energy', false],
			['Texas Gas Service', 'Target', false],
			['Texas Gas Service', 'Online Payment', false],
			['Netflix', 'Spotify', false],
			['AT&T', 'AT', false],
		]
		for (const [payee, cleaned, matches] of cases)
			expect(payeeMatches(payee, cleaned), `${payee} / ${cleaned}`).toBe(matches)
	})

	it('works out the window', () => {
		expect(windowOf(bill())).toEqual({ from: '2026-09-12', to: '2026-10-10' })
		expect(windowOf(bill({ due: undefined }))).toEqual({ from: '2026-09-01', to: '2026-10-31' })
		expect(windowOf(bill({ statementDay: '2026-09-14', due: '2026-10-12' }))).toEqual({
			from: '2026-09-15',
			to: '2026-10-26',
		})
	})

	const cases: [string, Bill, Entity<TransactionPayload>[], string[]][] = [
		['one close payment', bill(), [row({ id: 'p1', minor: -3810 })], ['p1']],
		['within 2%', bill(), [row({ id: 'p1', minor: -3886 })], ['p1']],
		['past 2%', bill(), [row({ id: 'p1', minor: -3887 })], []],
		// 15% of $38.10 is $5.715, rounded half away from zero to $5.72
		['within 15% for an estimate', bill({ estimate: true }), [row({ id: 'p1', minor: -4382 })], ['p1']],
		['past 15% for an estimate', bill({ estimate: true }), [row({ id: 'p1', minor: -4383 })], []],
		['too early', bill(), [row({ id: 'p1', minor: -3810, day: '2026-09-11' })], []],
		['too late', bill(), [row({ id: 'p1', minor: -3810, day: '2026-10-11' })], []],
		['another payee', bill(), [row({ id: 'p1', minor: -3810, name: 'TARGET' })], []],
		[
			'a learned merchant',
			bill({ merchantIds: ['m-gas'] }),
			[row({ id: 'p1', minor: -3810, name: 'ACH 1234', merchantId: 'm-gas' })],
			['p1'],
		],
		['pending', bill(), [row({ id: 'p1', minor: -3810, pending: true })], []],
		['money in', bill(), [row({ id: 'p1', minor: 3810 })], []],
		['a transfer', bill(), [row({ id: 'p1', minor: -3810, kind: 'transfer' })], []],
		['a card payment', bill(), [row({ id: 'p1', minor: -3810, kind: 'card-payment' })], []],
		['dismissed', bill({ dismissed: ['p1'] }), [row({ id: 'p1', minor: -3810 })], []],
		['claimed by another bill', bill(), [row({ id: 'p1', minor: -3810, billId: 'other' })], []],
		[
			'a card charge pays a utility bill',
			bill(),
			[row({ id: 'p1', minor: -3810, accountId: 'card', kind: 'purchase' })],
			['p1'],
		],
		['another currency', bill(), [row({ id: 'p1', minor: -3810, amount: { minor: -3810, currency: 'EUR' } })], []],
	]
	for (const [name, given, rows, expected] of cases)
		it(name, () => {
			expect(candidatesFor(given, rows, claimsOf([given], rows)).map((entry) => entry.id)).toEqual(expected)
		})

	it('exactly one candidate pays the bill, and an estimate takes its amount', () => {
		const out = matchOps(
			[bill({ estimate: true, amount: usd(4000) })],
			[row({ id: 'p1', minor: -3810, merchantId: 'm-gas' })]
		)
		const [paid] = out.bills
		expect(paid).toMatchObject({
			amount: usd(3810),
			payments: [{ transactionId: 'p1', amount: usd(3810), day: '2026-09-28', accountId: 'chk' }],
			merchantIds: ['m-gas'],
		})
		expect(paid!.estimate).toBeUndefined()
		expect(settled(paid!)).toBe(true)
		expect(out.rows.map((entry) => [entry.id, entry.payload.billId])).toEqual([['p1', 'gas']])
		expect(out.asks).toEqual([])
	})

	it('two candidates ask and pay nothing', () => {
		const rows = [
			row({ id: 'pm-01', minor: -3810 }),
			row({ id: 'pm-02', minor: -3800, day: '2026-09-29', name: 'TEXAS GAS AUTOPAY' }),
		]
		const out = matchOps([bill()], rows)
		expect(out.bills[0]).toMatchObject({ ask: ['pm-01', 'pm-02'] })
		expect(out.bills[0]!.payments).toBeUndefined()
		expect(out.rows).toEqual([])
		expect(out.asks).toEqual(['gas'])
		// Neither: both dismissed, never offered again
		const after = matchOps([{ ...out.bills[0]!, dismissed: ['pm-01', 'pm-02'] }], rows)
		expect(after.bills[0]!.ask).toBeUndefined()
		expect(after.asks).toEqual([])
	})

	it('the earlier bill claims first, so one payment never pays two', () => {
		const out = matchOps(
			[bill({ id: 'oct', due: '2026-10-06', period: '2026-10' }), bill({ id: 'sep' })],
			[row({ id: 'p1', minor: -3810 })]
		)
		expect(out.bills.map((entry) => entry.payments?.length ?? 0)).toEqual([0, 1])
	})

	it('a card statement takes the card payments into its card after the statement day', () => {
		const statement = bill({
			id: 'chase',
			payee: 'Chase Sapphire statement',
			accountId: 'card',
			statementDay: '2026-09-14',
			due: '2026-10-12',
			amount: usd(120418),
			minimum: usd(3500),
			source: 'statement',
		})
		const rows = [
			row({
				id: 'into',
				minor: 5000,
				accountId: 'card',
				kind: 'card-payment',
				day: '2026-09-20',
				name: 'PAYMENT THANK YOU',
			}),
			row({ id: 'into-2', minor: 2000, accountId: 'card', kind: 'card-payment', day: '2026-10-01', name: 'PAYMENT' }),
			row({ id: 'before', minor: 9000, accountId: 'card', kind: 'card-payment', day: '2026-09-14' }),
			row({ id: 'refund', minor: 9000, accountId: 'card', kind: 'refund', day: '2026-09-20' }),
			row({ id: 'out', minor: -120418, kind: 'card-payment', day: '2026-09-20' }),
		]
		const [paid] = matchOps([statement], rows).bills
		expect(paid!.payments?.map((entry) => entry.transactionId)).toEqual(['into', 'into-2'])
		expect(settled(paid!)).toBe(true)
	})

	it('a second close payment on a settled bill flags it overpaid', () => {
		const first = matchOps([bill()], [row({ id: 'p1', minor: -3810 })])
		const rows = [row({ id: 'p1', minor: -3810, billId: 'gas' }), row({ id: 'p2', minor: -3810, day: '2026-10-02' })]
		const second = matchOps(first.bills, rows)
		expect(second.bills[0]!.payments?.map((entry) => entry.transactionId)).toEqual(['p1', 'p2'])
		expect(overpaidOf(second.bills[0]!)).toEqual(usd(3810))
		// another open bill of the payee takes it instead
		const next = bill({ id: 'oct', due: '2026-10-06', period: '2026-10' })
		const shared = matchOps([first.bills[0]!, next], rows)
		expect(shared.bills[0]!.payments).toHaveLength(1)
		expect(shared.bills[1]!.payments?.map((entry) => entry.transactionId)).toEqual(['p2'])
	})

	it('Mark paid lists the payments in the window, the payee first', () => {
		const rows = [
			row({ id: 'far', minor: -9000, name: 'TARGET' }),
			row({ id: 'near', minor: -3800, name: 'TARGET' }),
			row({ id: 'gas', minor: -1000 }),
			row({ id: 'outside', minor: -3810, day: '2026-11-01' }),
			row({ id: 'claimed', minor: -3810, billId: 'other' }),
			row({ id: 'in', minor: 3810 }),
		]
		expect(paymentChoices(bill(), rows, [bill()]).map((entry) => entry.id)).toEqual(['gas', 'near', 'far'])
	})
})
