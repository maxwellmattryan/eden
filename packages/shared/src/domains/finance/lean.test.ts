import { describe, expect, it } from 'vitest'
import type { Entity } from '../../data/index.js'
import { buildLedger } from './ledger.js'
import { essentialLines, pauseCandidates, runwayOf } from './lean.js'
import { FINANCE, WHOLE, type Account, type Category, type IncomeSource, type TransactionPayload } from './types.js'

const TODAY = '2026-10-20'
const usd = (minor: number) => ({ minor, currency: 'USD' })

const account = (id: string, kind: Account['kind'], minor: number, extra: Partial<Account> = {}): Account => ({
	id,
	name: id,
	kind,
	currency: 'USD',
	share: WHOLE,
	balance: usd(minor),
	...extra,
})
const ACCOUNTS: Account[] = [
	account('chk', 'checking', 500000),
	// half of it is the owner's
	account('sav', 'savings', 1000000, { share: 5000 }),
	account('card', 'credit-card', 100000),
	account('loan', 'loan', 900000),
	account('brokerage', 'investment', 3000000),
	account('ira', 'retirement', 5000000),
	account('old', 'checking', 700000, { closedOn: '2026-01-01' }),
	account('yen', 'savings', 900000, { currency: 'JPY', balance: { minor: 900000, currency: 'JPY' } }),
]
const CATEGORIES: Category[] = [
	{ id: 'rent', name: 'Rent', group: 'fixed', essential: true },
	{ id: 'groceries', name: 'Groceries', group: 'variable', essential: true },
	{ id: 'taxes', key: 'taxes', name: 'Taxes', group: 'variable', essential: true },
	{ id: 'subscriptions', name: 'Subscriptions', group: 'fixed', essential: false },
	{ id: 'dining', name: 'Dining', group: 'variable', essential: false },
]
const MERCHANTS = [
	{ id: 'm-land', name: 'Landlord', key: 'landlord', rawNames: ['Landlord'] },
	{ id: 'm-shop', name: 'Grocer', key: 'grocer', rawNames: ['Grocer'] },
	{ id: 'm-stream', name: 'Streamly', key: 'streamly', rawNames: ['Streamly'] },
	{ id: 'm-gym', name: 'Gym', key: 'gym', rawNames: ['Gym'] },
	{ id: 'm-cafe', name: 'Cafe', key: 'cafe', rawNames: ['Cafe'] },
	{ id: 'm-irs', name: 'IRS', key: 'irs', rawNames: ['IRS'] },
]

const tx = (id: string, day: string, minor: number, fields: Partial<TransactionPayload> = {}) =>
	({
		id,
		uri: `eden://transaction/${id}`,
		type: FINANCE.transaction,
		payload: { accountId: 'chk', amount: usd(minor), day, name: id, pending: false, kind: 'purchase', ...fields },
		createdAt: '',
		updatedAt: '',
		deletedAt: null,
		mirror: false,
		source: null,
		externalId: null,
		snapshot: null,
		links: [],
	}) satisfies Entity<TransactionPayload>

const MONTHS = ['2026-07', '2026-08', '2026-09']
const ROWS = [
	...MONTHS.flatMap((month) => [
		tx(`rent-${month}`, `${month}-01`, -200000, { categoryId: 'rent', merchantId: 'm-land' }),
		tx(`food-${month}`, `${month}-10`, -60000, { categoryId: 'groceries', merchantId: 'm-shop' }),
		tx(`stream-${month}`, `${month}-12`, -1500, { categoryId: 'subscriptions', merchantId: 'm-stream' }),
		// uncategorised, in every month: one to pause too
		tx(`gym-${month}`, `${month}-05`, -4500, { merchantId: 'm-gym' }),
	]),
	// two months only: not one to pause
	tx('cafe-7', '2026-07-14', -9000, { categoryId: 'dining', merchantId: 'm-cafe' }),
	tx('cafe-8', '2026-08-14', -9000, { categoryId: 'dining', merchantId: 'm-cafe' }),
	// a tax payment: out of the essentials
	tx('tax', '2026-08-15', -300000, { categoryId: 'taxes', merchantId: 'm-irs' }),
	// a one-off, another currency and this month's: none of them count
	tx('sofa', '2026-08-20', -250000, { categoryId: 'groceries', oneOff: true }),
	tx('yen-rent', '2026-08-01', -90000, { categoryId: 'rent', amount: { minor: 90000, currency: 'JPY' } }),
	tx('now', '2026-10-02', -200000, { categoryId: 'rent' }),
]
const ledgerOf = (rows = ROWS) =>
	buildLedger({ transactions: rows, accounts: ACCOUNTS, categories: CATEGORIES, merchants: MERCHANTS, home: 'USD' })
const EXCLUDE = new Set(['tax'])
const input = { ledger: ledgerOf(), categories: CATEGORIES, today: TODAY, exclude: EXCLUDE }

const source = (id: string, minor: number, extra: Partial<IncomeSource> = {}): IncomeSource => ({
	id,
	kind: 'income',
	merchantId: `m-${id}`,
	name: id,
	accountId: 'chk',
	cadence: 'semimonthly',
	anchors: [15, 31],
	expected: usd(minor),
	firstDay: '2026-01-15',
	lastDay: '2026-10-15',
	...extra,
})

describe('runway', () => {
	it('works out the months on the essentials and at the usual spending', () => {
		const ended = source('old', 400000, { endedOn: '2026-10-16', leanSince: '2026-10-16' })
		const runway = runwayOf({ ...input, accounts: ACCOUNTS, sources: [ended], home: 'USD' })
		expect(runway).toEqual({
			// 5,000 + half of 10,000 − 1,000 owed on the card
			liquid: usd(900000),
			essentials: usd(260000),
			// the essentials, 15 a month streaming, 45 the gym and the cafe's 180 over 3 months
			usual: usd(260000 + 1500 + 4500 + 6000),
			otherIncome: usd(0),
			covered: false,
			months: 3.4,
			usualMonths: 3.3,
			until: '2027-01-31',
		})
	})

	it('takes off the other income, and says when it covers the essentials', () => {
		const part = source('part', 50000)
		const runway = runwayOf({ ...input, accounts: ACCOUNTS, sources: [part], home: 'USD' })
		expect(runway).toMatchObject({ otherIncome: usd(100000), months: 5.6, covered: false })
		const covered = runwayOf({ ...input, accounts: ACCOUNTS, sources: [source('big', 150000)], home: 'USD' })
		expect(covered).toMatchObject({ covered: true, otherIncome: usd(300000) })
		expect(covered).not.toHaveProperty('months')
		// an income in another currency, an ignored one and an ended one are not other income
		const left = runwayOf({
			...input,
			accounts: ACCOUNTS,
			sources: [
				source('yen', 150000, { expected: { minor: 150000, currency: 'JPY' } }),
				source('hidden', 150000, { ignored: true }),
				source('gone', 150000, { endedOn: '2026-10-01' }),
			],
			home: 'USD',
		})
		expect(left).toMatchObject({ otherIncome: usd(0), covered: false })
	})

	it('is 0 months with no liquid money', () => {
		const owing = [account('chk', 'checking', 10000), account('card', 'credit-card', 2000000)]
		const runway = runwayOf({ ...input, accounts: owing, sources: [], home: 'USD' })
		expect(runway).toMatchObject({ liquid: usd(-1990000), months: 0, until: TODAY })
	})

	it('needs a complete month of spending', () => {
		const ledger = ledgerOf([tx('now', '2026-10-02', -200000, { categoryId: 'rent' })])
		expect(runwayOf({ ...input, ledger, accounts: ACCOUNTS, sources: [], home: 'USD' })).toEqual({
			reason: 'no-history',
		})
		expect(essentialLines({ ...input, ledger })).toEqual([])
		expect(pauseCandidates({ ...input, ledger })).toEqual([])
	})
})

describe('essentials', () => {
	it('lists each essential category above zero, largest first, the tax rows left out', () => {
		expect(essentialLines(input)).toEqual([
			{ categoryId: 'rent', name: 'Rent', amount: usd(200000) },
			{ categoryId: 'groceries', name: 'Groceries', amount: usd(60000) },
		])
		expect(essentialLines({ ...input, exclude: new Set() })[1]).toEqual({
			categoryId: 'taxes',
			name: 'Taxes',
			amount: usd(100000),
		})
	})
})

describe('what to pause', () => {
	it('lists the merchants outside the essentials in each of the last 3 complete months', () => {
		expect(pauseCandidates(input)).toEqual([
			{ merchantId: 'm-gym', name: 'Gym', amount: usd(4500) },
			{ merchantId: 'm-stream', name: 'Streamly', categoryId: 'subscriptions', amount: usd(1500) },
		])
	})

	it('keeps at most 8, ties by name', () => {
		const names = ['K', 'J', 'I', 'H', 'G', 'F', 'E', 'D', 'C', 'B']
		const merchants = names.map((name) => ({ id: `m-${name}`, name, key: name, rawNames: [name] }))
		const rows = MONTHS.flatMap((month) =>
			names.map((name) => tx(`${name}-${month}`, `${month}-03`, -1000, { merchantId: `m-${name}` }))
		)
		const ledger = buildLedger({
			transactions: rows,
			accounts: ACCOUNTS,
			categories: CATEGORIES,
			merchants,
			home: 'USD',
		})
		expect(pauseCandidates({ ...input, ledger }).map((entry) => entry.name)).toEqual([
			'B',
			'C',
			'D',
			'E',
			'F',
			'G',
			'H',
			'I',
		])
		expect(
			pauseCandidates({
				...input,
				ledger: ledgerOf(ROWS.filter((row) => !row.id.startsWith('stream') && !row.id.startsWith('gym'))),
			})
		).toEqual([])
	})
})
