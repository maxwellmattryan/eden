import { describe, expect, it } from 'vitest'
import type {
	InvestmentsResult,
	ProviderAccount,
	ProviderHolding,
	ProviderInvestmentTransaction,
	ProviderSecurity,
} from '../../api/plaid.js'
import { createEngine, type EngineStorage } from '../../data/engine.js'
import type { Entity } from '../../data/index.js'
import { createIdGenerator } from '../../data/ulid.js'
import { money } from '../../money/index.js'
import { payloadOf } from './accounts.js'
import {
	aged,
	allocationOf,
	carryBasis,
	holdingValue,
	investmentOps,
	investmentsDue,
	investmentsWindow,
	investmentSummary,
	PLAID_INVESTMENTS_SOURCE,
	PRICE_DAYS,
	quantityText,
	roundedMoney,
	timesDecimal,
	withCostBasis,
} from './investments.js'
import { seedData } from './seed.js'
import {
	FINANCE,
	WHOLE,
	type Account,
	type Holding,
	type HoldingPayload,
	type ProviderLink,
	type Security,
	type SecurityPayload,
	type TransactionPayload,
} from './types.js'

function memory(): EngineStorage {
	const map = new Map<string, string>()
	return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => void map.set(key, value) }
}

const DAY = '2026-11-06'
const usd = (minor: number) => money(minor, 'USD')

const providerAccount = (id: string): ProviderAccount => ({
	providerAccountId: id,
	name: id,
	kind: 'investment',
	subtype: 'brokerage',
	currency: 'USD',
	current: null,
	available: null,
})

const security = (fields: Partial<ProviderSecurity> & { securityId: string }): ProviderSecurity => ({
	name: fields.securityId,
	ticker: null,
	kind: 'etf',
	currency: 'USD',
	closePrice: null,
	closePriceAsOf: null,
	...fields,
})

const holding = (fields: Partial<ProviderHolding> & { securityId: string; quantity: string }): ProviderHolding => ({
	providerAccountId: 'acc-brokerage',
	institutionPrice: null,
	institutionPriceAsOf: null,
	institutionValue: null,
	costBasis: null,
	currency: 'USD',
	...fields,
})

const investmentTx = (
	fields: Partial<ProviderInvestmentTransaction> & { id: string; amount: string }
): ProviderInvestmentTransaction => ({
	providerAccountId: 'acc-brokerage',
	securityId: 'sec-vti',
	date: '2026-11-04',
	name: fields.id,
	quantity: null,
	price: null,
	kind: 'buy',
	subtype: 'buy',
	currency: 'USD',
	...fields,
})

const result = (fields: Partial<InvestmentsResult>): InvestmentsResult => ({
	status: 'ok',
	accounts: [providerAccount('acc-brokerage')],
	holdings: [],
	securities: [],
	transactions: [],
	...fields,
})

function setup() {
	const engine = createEngine(memory())
	const newId = createIdGenerator()
	let link: ProviderLink = { id: newId(), provider: 'plaid', institution: { name: 'M1' }, status: 'ok' }
	const account = (fields: Partial<Account> & { providerAccountId?: string }): Account => ({
		id: newId(),
		name: 'Brokerage',
		kind: 'investment',
		currency: 'USD',
		linkId: link.id,
		share: WHOLE,
		...fields,
	})
	const brokerage = account({ providerAccountId: 'acc-brokerage' })
	const closed = account({ providerAccountId: 'acc-closed', closedOn: '2026-10-01' })
	let accounts: Account[] = [brokerage, closed]
	engine.applyBatch([
		{ op: 'createEntity', input: { id: link.id, type: FINANCE.link, payload: payloadOf(link) } },
		...accounts.map((entry) => ({
			op: 'createEntity' as const,
			input: { id: entry.id, type: FINANCE.account, payload: payloadOf(entry) },
		})),
	])

	const rows = () => ({
		holdings: engine.queryEntities({ type: FINANCE.holding, includeDeleted: true }) as Entity<HoldingPayload>[],
		securities: engine.queryEntities({ type: FINANCE.security }) as Entity<SecurityPayload>[],
		transactions: engine.queryEntities({
			type: FINANCE.transaction,
			source: PLAID_INVESTMENTS_SOURCE,
		}) as Entity<TransactionPayload>[],
	})
	const live = () => rows().holdings.filter((row) => !row.deletedAt)
	const ops = (read: InvestmentsResult, day = DAY) => {
		const held = rows()
		return investmentOps({
			link,
			accounts,
			holdings: held.holdings,
			securities: held.securities,
			existingTransactions: new Map(held.transactions.map((row) => [row.externalId!, row])),
			result: read,
			day,
			newId,
		})
	}
	const run = (read: InvestmentsResult, day = DAY) => {
		const out = ops(read, day)
		for (const chunk of out.chunks) engine.applyBatch(chunk)
		link = out.link
		return out
	}
	const setAccounts = (next: Account[]) => {
		const known = new Set(accounts.map((entry) => entry.id))
		engine.applyBatch(
			next.map((entry) =>
				known.has(entry.id)
					? { op: 'updateEntity' as const, id: entry.id, payload: payloadOf(entry) }
					: { op: 'createEntity' as const, input: { id: entry.id, type: FINANCE.account, payload: payloadOf(entry) } }
			)
		)
		accounts = next
	}
	return { engine, newId, brokerage, closed, account, rows, live, ops, run, setAccounts, link: () => link }
}

const VTI = security({
	securityId: 'sec-vti',
	name: 'Vanguard Total',
	ticker: 'VTI',
	closePrice: '286',
	closePriceAsOf: DAY,
})
const SCHD = security({ securityId: 'sec-schd', name: 'Schwab Dividend', ticker: 'SCHD', closePrice: '27.31' })

describe('investment read', () => {
	it('upserts securities and keeps one close a day, a same-day read replacing it', () => {
		const t = setup()
		t.run(result({ securities: [VTI, SCHD] }))
		const find = (id: string) => t.rows().securities.find((row) => row.externalId === id)
		let vti = find('sec-vti')
		expect(vti!.payload).toEqual({
			name: 'Vanguard Total',
			ticker: 'VTI',
			type: 'etf',
			currency: 'USD',
			prices: [{ day: DAY, price: '286' }],
		})
		expect(vti!.externalId).toBe('sec-vti')
		// a close with no day of its own is the read's day
		expect(find('sec-schd')!.payload.prices).toEqual([{ day: DAY, price: '27.31' }])

		t.run(result({ securities: [{ ...VTI, closePrice: '287.5' }] }))
		vti = find('sec-vti')
		expect(vti!.payload.prices).toEqual([{ day: DAY, price: '287.5' }])
		expect(t.rows().securities).toHaveLength(2)

		t.run(result({ securities: [{ ...VTI, closePrice: '288', closePriceAsOf: '2026-11-07' }] }), '2026-11-07')
		vti = find('sec-vti')
		expect(vti!.payload.prices).toEqual([
			{ day: DAY, price: '287.5' },
			{ day: '2026-11-07', price: '288' },
		])
		expect(find('sec-schd')!.payload.prices).toHaveLength(1)

		// Plaid's type names are mapped
		t.run(
			result({
				securities: [
					security({ securityId: 'sec-fund', kind: 'mutual fund' }),
					security({ securityId: 'sec-bond', kind: 'fixed income' }),
					security({ securityId: 'sec-loan', kind: 'loan' }),
					security({ securityId: 'sec-odd', kind: 'warrant' }),
				],
			}),
			'2026-11-07'
		)
		const types = Object.fromEntries(t.rows().securities.map((row) => [row.externalId, row.payload.type]))
		expect(types).toMatchObject({
			'sec-fund': 'mutual-fund',
			'sec-bond': 'fixed-income',
			'sec-loan': 'other',
			'sec-odd': 'other',
		})
	})

	it(`keeps at most ${PRICE_DAYS} closes, dropping the oldest`, () => {
		const t = setup()
		const prices = Array.from({ length: PRICE_DAYS }, (_, at) => ({
			day: new Date(Date.UTC(2020, 0, 1) + at * 86400000).toISOString().slice(0, 10),
			price: '1',
		}))
		t.engine.applyBatch([
			{
				op: 'createEntity',
				input: {
					type: FINANCE.security,
					source: 'plaid',
					externalId: 'sec-vti',
					payload: { name: 'VTI', type: 'etf', prices },
				},
			},
		])
		t.run(result({ securities: [VTI] }))
		const kept = t.rows().securities[0]!.payload.prices
		expect(kept).toHaveLength(PRICE_DAYS)
		expect(kept.at(-1)).toEqual({ day: DAY, price: '286' })
		expect(kept[0]!.day).toBe(prices[1]!.day)
	})

	it('upserts holdings per account and security, and tombstones one missing from a reported account', () => {
		const t = setup()
		const read = result({
			securities: [VTI, SCHD],
			holdings: [
				holding({ securityId: 'sec-vti', quantity: '21.4', institutionValue: '6120.35', costBasis: '5210' }),
				holding({ securityId: 'sec-schd', quantity: '88.25', institutionPrice: '27.31' }),
			],
		})
		const first = t.run(read)
		expect(first.holdings).toHaveLength(2)
		const live = t.live()
		expect(live.map((row) => row.externalId).sort()).toEqual(['acc-brokerage:sec-schd', 'acc-brokerage:sec-vti'])
		const vti = live.find((row) => row.externalId === 'acc-brokerage:sec-vti')!
		const vtiSecurity = t.rows().securities.find((row) => row.externalId === 'sec-vti')!
		expect(vti.payload).toEqual({
			accountId: t.brokerage.id,
			securityId: vtiSecurity.id,
			quantity: '21.4',
			currency: 'USD',
			value: usd(612035),
			pricedOn: DAY,
			costBasis: usd(521000),
			costBasisBy: 'provider',
		})

		// a replay writes nothing, and the link took the day once
		expect(t.link().investmentsReadOn).toBe(DAY)
		expect(t.ops(read).chunks).toEqual([])

		// SCHD sold: tombstoned; VTI's quantity moved: updated in place
		const next = t.run(
			result({
				securities: [VTI],
				holdings: [holding({ securityId: 'sec-vti', quantity: '22', institutionValue: '6292' })],
			})
		)
		expect(next.removedHoldings).toHaveLength(1)
		expect(t.live().map((row) => row.externalId)).toEqual(['acc-brokerage:sec-vti'])
		expect(t.live()[0]!.id).toBe(vti.id)
		expect(t.live()[0]!.payload.quantity).toBe('22')

		// an account Plaid did not report keeps its holdings
		const other = t.run(result({ accounts: [], holdings: [], securities: [] }))
		expect(other.removedHoldings).toEqual([])
		expect(t.live()).toHaveLength(1)
	})

	it('skips closed accounts, accounts with no row, and holdings with no ISO currency', () => {
		const t = setup()
		const out = t.run(
			result({
				accounts: [providerAccount('acc-brokerage'), providerAccount('acc-closed'), providerAccount('acc-unknown')],
				securities: [VTI],
				holdings: [
					holding({ providerAccountId: 'acc-closed', securityId: 'sec-vti', quantity: '1', institutionValue: '286' }),
					holding({ providerAccountId: 'acc-unknown', securityId: 'sec-vti', quantity: '1', institutionValue: '286' }),
					holding({ securityId: 'sec-vti', quantity: '1', institutionValue: '286', currency: null }),
				],
				transactions: [
					investmentTx({ id: 'it-closed', providerAccountId: 'acc-closed', amount: '286' }),
					investmentTx({ id: 'it-unknown', providerAccountId: 'acc-unknown', amount: '286' }),
				],
			})
		)
		expect(t.live()).toEqual([])
		expect(t.rows().transactions).toEqual([])
		expect(out.skipped).toEqual(['finance:unsupported-currency'])
	})

	it('answers none: only the day is written', () => {
		const t = setup()
		const out = t.run({ status: 'none', accounts: [], holdings: [], securities: [], transactions: [] })
		expect(out.chunks.flat()).toEqual([{ op: 'updateEntity', id: t.link().id, payload: payloadOf(t.link()) }])
		expect(t.link().investmentsReadOn).toBe(DAY)
	})
})

describe('value', () => {
	it('rounds a decimal half away from zero to the currency', () => {
		expect(roundedMoney('6120.355', 'USD')).toEqual(usd(612036))
		expect(roundedMoney('6120.354', 'USD')).toEqual(usd(612035))
		expect(roundedMoney('-0.005', 'USD')).toEqual(usd(-1))
		expect(roundedMoney('12', 'USD')).toEqual(usd(1200))
		expect(roundedMoney('84000.5', 'JPY')).toEqual(money(84001, 'JPY'))
		expect(roundedMoney('-84000.5', 'JPY')).toEqual(money(-84001, 'JPY'))
		expect(roundedMoney('84000.49', 'JPY')).toEqual(money(84000, 'JPY'))
		for (const bad of ['', '1e5', '12.', 'abc', '1,000']) expect(roundedMoney(bad, 'USD'), bad).toBeUndefined()
		expect(roundedMoney('1', 'XYZ')).toBeUndefined()
		expect(timesDecimal('88.25', '27.31', 'USD')).toEqual(usd(241011))
		expect(timesDecimal('3', '333.5', 'JPY')).toEqual(money(1001, 'JPY'))
		expect(timesDecimal('0.0412', '63000', 'USD')).toEqual(usd(259560))
		expect(timesDecimal('x', '1', 'USD')).toBeUndefined()
		expect(quantityText('21.40')).toBe('21.4')
		expect(quantityText('100.000')).toBe('100')
		expect(quantityText('0.0412')).toBe('0.0412')
	})

	it("takes Plaid's value, then quantity × price, then the owner's, else unpriced", () => {
		const t = setup()
		t.run(
			result({
				securities: [VTI, SCHD, security({ securityId: 'sec-stable', name: 'Stable Value', kind: 'other' })],
				holdings: [
					holding({ securityId: 'sec-vti', quantity: '21.4', institutionValue: '6120.345' }),
					holding({ securityId: 'sec-schd', quantity: '88.25', institutionPrice: '27.31' }),
					holding({ securityId: 'sec-stable', quantity: '1850' }),
				],
			})
		)
		const securities = new Map(t.rows().securities.map((row) => [row.id, { ...row.payload, id: row.id } as Security]))
		const byExternal = (id: string) => {
			const row = t.live().find((entry) => entry.externalId === id)!
			return { holding: { ...row.payload, id: row.id } as Holding, security: securities.get(row.payload.securityId) }
		}
		const vti = byExternal('acc-brokerage:sec-vti')
		expect(holdingValue(vti.holding, vti.security)).toEqual({ value: usd(612035), on: DAY, by: 'provider' })
		const schd = byExternal('acc-brokerage:sec-schd')
		expect(holdingValue(schd.holding, schd.security)).toEqual({ value: usd(241011), on: DAY, by: 'price' })
		expect(holdingValue({ ...schd.holding, value: undefined, pricedOn: '2026-11-05' })).toEqual({
			value: usd(241011),
			on: '2026-11-05',
			by: 'price',
		})
		// with no price of its own, the security's latest close
		expect(holdingValue({ ...schd.holding, value: undefined, price: undefined }, schd.security)).toEqual({
			value: usd(241011),
			on: DAY,
			by: 'price',
		})
		const stable = byExternal('acc-brokerage:sec-stable')
		expect(holdingValue(stable.holding, stable.security)).toBeUndefined()
		const typed = { ...stable.holding, typedValue: { value: usd(200000), on: '2026-07-09' } }
		expect(holdingValue(typed, stable.security)).toEqual({ value: usd(200000), on: '2026-07-09', by: 'owner' })
		// JPY
		const yen: HoldingPayload = { accountId: 'a', securityId: 's', quantity: '3', currency: 'JPY', price: '333.5' }
		expect(holdingValue(yen)?.value).toEqual(money(1001, 'JPY'))
	})
})

describe('cost basis', () => {
	it("writes Plaid's basis as the provider's, and the owner's survives every later read", () => {
		const t = setup()
		const read = result({
			securities: [VTI],
			holdings: [holding({ securityId: 'sec-vti', quantity: '21.4', institutionValue: '6120.35', costBasis: '5210' })],
		})
		t.run(read)
		const row = t.live()[0]!
		const owned = withCostBasis({ ...row.payload, id: row.id }, usd(500000))
		t.engine.applyBatch([{ op: 'updateEntity', id: row.id, payload: payloadOf(owned) }])
		t.run(read, '2026-11-07')
		expect(t.live()[0]!.payload.costBasis).toEqual(usd(500000))
		expect(t.live()[0]!.payload.costBasisBy).toBe('owner')
		// cleared, Plaid's comes back with the next read
		const cleared = withCostBasis({ ...t.live()[0]!.payload, id: row.id }, undefined)
		t.engine.applyBatch([{ op: 'updateEntity', id: row.id, payload: payloadOf(cleared) }])
		t.run(read, '2026-11-08')
		expect(t.live()[0]!.payload.costBasisBy).toBe('provider')
	})

	it("carries a replaced account's basis by quantity, tombstoned or not, by security or ticker", () => {
		const t = setup()
		// A held 10 VTI for 1,000.00, read and then sold off (tombstoned)
		t.run(
			result({
				securities: [VTI],
				holdings: [holding({ securityId: 'sec-vti', quantity: '10', institutionValue: '2860', costBasis: '1000' })],
			})
		)
		t.run(result({ securities: [VTI], holdings: [] }), '2026-11-07')
		expect(t.live()).toEqual([])
		// B replaces A and holds 4 of the same security, with no basis
		const b = t.account({ providerAccountId: 'acc-new', replaces: t.brokerage.id })
		t.setAccounts([{ ...t.brokerage, closedOn: '2026-11-07' }, t.closed, b])
		t.run(
			result({
				accounts: [providerAccount('acc-new')],
				securities: [VTI],
				holdings: [
					holding({ providerAccountId: 'acc-new', securityId: 'sec-vti', quantity: '4', institutionValue: '1144' }),
				],
			}),
			'2026-11-08'
		)
		const carried = t.live()[0]!.payload
		expect(carried.costBasis).toEqual(usd(40000))
		expect(carried.costBasisBy).toBe('carried')

		// a Plaid basis replaces a carried one
		t.run(
			result({
				accounts: [providerAccount('acc-new')],
				securities: [VTI],
				holdings: [
					holding({
						providerAccountId: 'acc-new',
						securityId: 'sec-vti',
						quantity: '4',
						institutionValue: '1144',
						costBasis: '450',
					}),
				],
			}),
			'2026-11-09'
		)
		expect(t.live()[0]!.payload.costBasis).toEqual(usd(45000))
		expect(t.live()[0]!.payload.costBasisBy).toBe('provider')
	})

	it('carries by ticker, rounds half away from zero, and never when B holds more than A', () => {
		const a: Account = { id: 'a', name: 'Old', kind: 'investment', currency: 'USD', share: WHOLE }
		const b: Account = { ...a, id: 'b', name: 'New', replaces: 'a' }
		const securities = new Map<string, Security>([
			['s-old', { id: 's-old', name: 'VTI', ticker: 'vti', type: 'etf', prices: [] }],
			['s-new', { id: 's-new', name: 'VTI', ticker: 'VTI', type: 'etf', prices: [] }],
		])
		const previous: Holding[] = [
			{ id: 'h-a', accountId: 'a', securityId: 's-old', quantity: '7', currency: 'USD', costBasis: usd(10000) },
		]
		const mine = (quantity: string): Holding => ({
			id: 'h-b',
			accountId: 'b',
			securityId: 's-new',
			quantity,
			currency: 'USD',
		})
		// 100.00 × 3/7 = 42.857… → 42.86
		expect(carryBasis(mine('3'), b, previous, securities).costBasis).toEqual(usd(4286))
		expect(carryBasis(mine('7.000'), b, previous, securities).costBasis).toEqual(usd(10000))
		expect(carryBasis(mine('7.5'), b, previous, securities).costBasis).toBeUndefined()
		expect(carryBasis(mine('3'), a, previous, securities).costBasis).toBeUndefined()
		const owned = { ...mine('3'), costBasis: usd(1), costBasisBy: 'owner' as const }
		expect(carryBasis(owned, b, previous, securities)).toBe(owned)
		// the owner's typed basis carries like any other
		const typed = [{ ...previous[0]!, costBasisBy: 'owner' as const }]
		expect(carryBasis(mine('7'), b, typed, securities).costBasisBy).toBe('carried')
	})
})

describe('investment transactions', () => {
	it('creates and updates rows by provider id, negated, posted, with the investment key; zero amounts are not written', () => {
		const t = setup()
		const read = result({
			securities: [VTI],
			transactions: [
				investmentTx({ id: 'it-buy', amount: '572', quantity: '2', price: '286' }),
				investmentTx({ id: 'it-div', amount: '-18.42', kind: 'cash', subtype: 'dividend' }),
				investmentTx({ id: 'it-split', amount: '0', kind: 'transfer', subtype: 'stock split', quantity: '10' }),
			],
		})
		t.run(read)
		const rows = t.rows().transactions
		expect(rows.map((row) => row.externalId).sort()).toEqual(['it-buy', 'it-div'])
		const vtiId = t.rows().securities[0]!.id
		const buy = rows.find((row) => row.externalId === 'it-buy')!
		expect(buy.source).toBe(PLAID_INVESTMENTS_SOURCE)
		expect(buy.payload).toEqual({
			accountId: t.brokerage.id,
			amount: usd(-57200),
			day: '2026-11-04',
			name: 'it-buy',
			pending: false,
			investment: { type: 'buy', subtype: 'buy', securityId: vtiId, quantity: '2', price: '286' },
		})
		expect(rows.find((row) => row.externalId === 'it-div')!.payload.amount).toEqual(usd(1842))

		// the pass's and the owner's keys stay; the provider's change
		t.engine.applyBatch([
			{ op: 'updateEntity', id: buy.id, payload: { ...buy.payload, kind: 'investment-buy', notes: 'monthly' } },
		])
		t.run(
			result({
				securities: [VTI],
				transactions: [investmentTx({ id: 'it-buy', amount: '574', name: 'BUY VTI', quantity: '2' })],
			}),
			'2026-11-07'
		)
		const updated = t.rows().transactions.find((row) => row.externalId === 'it-buy')!
		expect(updated.id).toBe(buy.id)
		expect(updated.payload).toEqual({
			accountId: t.brokerage.id,
			amount: usd(-57400),
			day: '2026-11-04',
			name: 'BUY VTI',
			pending: false,
			investment: { type: 'buy', subtype: 'buy', securityId: vtiId, quantity: '2' },
			kind: 'investment-buy',
			notes: 'monthly',
		})
		expect(t.ops(result({ securities: [VTI], transactions: [] }), '2026-11-07').chunks).toEqual([])
	})
})

describe('allocation', () => {
	const account = (id: string, fields: Partial<Account> = {}): Account => ({
		id,
		name: id,
		kind: 'investment',
		currency: 'USD',
		share: WHOLE,
		...fields,
	})
	const sec = (id: string, type: Security['type']): Security => ({ id, name: id, type, prices: [] })
	const hold = (accountId: string, securityId: string, value?: ReturnType<typeof money>): Holding => ({
		id: `${accountId}-${securityId}`,
		accountId,
		securityId,
		quantity: '1',
		currency: value?.currency ?? 'USD',
		...(value ? { value } : {}),
	})

	it('sums each class in the home currency at the account share, with basis points adding to exactly 100%', () => {
		const out = allocationOf({
			accounts: [account('a'), account('half', { share: 5000 }), account('gone', { closedOn: '2026-01-01' })],
			securities: [
				sec('vti', 'etf'),
				sec('fund', 'mutual-fund'),
				sec('aapl', 'equity'),
				sec('bond', 'fixed-income'),
				sec('usd', 'cash'),
				sec('btc', 'cryptocurrency'),
				sec('opt', 'derivative'),
				sec('jp', 'equity'),
				sec('stable', 'other'),
			],
			holdings: [
				hold('a', 'vti', usd(10000)),
				hold('a', 'fund', usd(10000)),
				hold('half', 'aapl', usd(20000)),
				hold('a', 'bond', usd(10000)),
				hold('a', 'usd', usd(10000)),
				hold('a', 'btc', usd(10000)),
				hold('a', 'opt', usd(10000)),
				hold('a', 'jp', money(84000, 'JPY')),
				hold('a', 'stable'),
				hold('gone', 'vti', usd(99999)),
			],
			home: 'USD',
		})
		// largest remainder: the five of 1428.57 take the three points left before funds' 2857.14 does
		expect(out.classes.map((entry) => [entry.id, entry.value.minor, entry.share])).toEqual([
			['funds', 20000, 2857],
			['stocks', 10000, 1429],
			['bonds', 10000, 1429],
			['cash', 10000, 1429],
			['crypto', 10000, 1428],
			['other', 10000, 1428],
		])
		expect(out.classes.reduce((sum, entry) => sum + entry.share, 0)).toBe(WHOLE)
		expect(out.total).toEqual(usd(70000))
		expect(out.left).toEqual([money(84000, 'JPY')])
		expect(out.unpriced).toBe(1)

		const thirds = allocationOf({
			accounts: [account('a')],
			securities: [sec('x', 'etf'), sec('y', 'equity'), sec('z', 'cash')],
			holdings: [hold('a', 'x', usd(1)), hold('a', 'y', usd(1)), hold('a', 'z', usd(1))],
			home: 'USD',
		})
		expect(thirds.classes.map((entry) => entry.share)).toEqual([3334, 3333, 3333])
		expect(allocationOf({ accounts: [], securities: [], holdings: [], home: 'USD' }).classes).toEqual([])
	})
})

describe('schedule and aging', () => {
	it('ages a value only past 90 days', () => {
		expect(aged('2026-08-08', '2026-11-06')).toBe(false)
		expect(aged('2026-08-07', '2026-11-06')).toBe(true)
		expect(aged('2026-11-06', '2026-11-06')).toBe(false)
		expect(aged('', '2026-11-06')).toBe(false)
	})

	it('is due once a day for a live Plaid link with an open brokerage or retirement account', () => {
		const link: ProviderLink = { id: 'l', provider: 'plaid', institution: { name: 'M1' }, status: 'ok' }
		const account = (fields: Partial<Account>): Account => ({
			id: 'a',
			name: 'A',
			kind: 'investment',
			currency: 'USD',
			linkId: 'l',
			share: WHOLE,
			...fields,
		})
		expect(investmentsDue(link, [account({})], DAY)).toBe(true)
		expect(investmentsDue(link, [account({ kind: 'retirement' })], DAY)).toBe(true)
		expect(investmentsDue({ ...link, status: 'error' }, [account({})], DAY)).toBe(true)
		expect(investmentsDue({ ...link, investmentsReadOn: '2026-11-05' }, [account({})], DAY)).toBe(true)
		expect(investmentsDue({ ...link, investmentsReadOn: DAY }, [account({})], DAY)).toBe(false)
		expect(investmentsDue(link, [account({ kind: 'checking' })], DAY)).toBe(false)
		expect(investmentsDue(link, [account({ closedOn: '2026-11-01' })], DAY)).toBe(false)
		expect(investmentsDue(link, [account({ linkId: 'other' })], DAY)).toBe(false)
		expect(investmentsDue({ ...link, status: 'needs-reauth' }, [account({})], DAY)).toBe(false)
	})

	it('reads 730 days back the first time, then from 30 days before the last read', () => {
		const link: ProviderLink = { id: 'l', provider: 'plaid', institution: { name: 'M1' }, status: 'ok' }
		expect(investmentsWindow(link, DAY)).toEqual({ start: '2024-11-06', end: DAY })
		expect(investmentsWindow({ ...link, investmentsReadOn: '2026-11-05' }, DAY)).toEqual({
			start: '2026-10-06',
			end: DAY,
		})
	})
})

describe('investmentSummary', () => {
	it("ages a coin priced from a close more than 7 days old, and keeps 90 days for an owner's value (D-204)", () => {
		const link: ProviderLink = { id: 'l', provider: 'coinbase', institution: { name: 'Coinbase' }, status: 'ok' }
		const account: Account = {
			id: 'a',
			name: 'Coinbase',
			kind: 'investment',
			currency: 'USD',
			linkId: 'l',
			share: WHOLE,
		}
		const coin = (id: string, type: Security['type'], day: string): Security => ({
			id,
			name: id,
			ticker: id.toUpperCase(),
			type,
			currency: 'USD',
			prices: [{ day, price: '100' }],
		})
		const hold = (securityId: string, fields: Partial<Holding> = {}): Holding => ({
			id: securityId,
			accountId: 'a',
			securityId,
			quantity: '1',
			currency: 'USD',
			...fields,
		})
		const summary = investmentSummary({
			holdings: [
				hold('btc'),
				hold('eth'),
				hold('vti'),
				hold('foo', { typedValue: { value: usd(500), on: '2026-09-01' } }),
				hold('bar', { typedValue: { value: usd(500), on: '2026-07-01' } }),
			],
			securities: [
				coin('btc', 'cryptocurrency', '2026-10-29'),
				coin('eth', 'cryptocurrency', '2026-10-31'),
				coin('vti', 'etf', '2026-10-01'),
				{ id: 'foo', name: 'foo', type: 'cryptocurrency', prices: [] },
				{ id: 'bar', name: 'bar', type: 'cryptocurrency', prices: [] },
			],
			accounts: [account],
			links: [link],
			home: 'USD',
			today: DAY,
			now: Date.parse(`${DAY}T12:00:00Z`),
		})
		const aged = Object.fromEntries(summary.groups[0]!.rows.map((row) => [row.security!.id, row.aged]))
		expect(aged).toEqual({ btc: true, eth: false, vti: false, foo: false, bar: true })
	})
})

describe('the sample', () => {
	it("gives M1 and Fidelity holdings that add up to each account's balance", () => {
		const now = Date.parse('2026-09-30T15:00:00Z')
		const data = seedData(now)
		const securities = new Map(data.securities!.map((entry) => [entry.id, entry]))
		for (const id of ['a-m1', 'a-401k']) {
			const account = data.accounts.find((entry) => entry.id === id)!
			const sum = data
				.holdings!.filter((entry) => entry.accountId === id)
				.reduce((total, entry) => total + holdingValue(entry, securities.get(entry.securityId))!.value.minor, 0)
			expect(sum, id).toBe(account.balance!.minor)
		}
		const summary = investmentSummary({
			...data,
			holdings: data.holdings!,
			securities: data.securities!,
			home: 'USD',
			today: '2026-09-30',
			now,
		})
		expect(summary.groups.map((group) => group.account.id)).toEqual(['a-401k', 'a-m1'])
		expect(summary.value).toEqual(usd(964055 + 2138840))
		expect(summary.withoutBasis).toBe(1)
		const stable = summary.groups[0]!.rows.find((row) => row.security?.id === 'sec-stable')!
		expect(stable.aged).toBe(true)
		expect(stable.ownerValued).toBe(true)
		expect(summary.allocation.classes.map((entry) => entry.id)).toEqual(['funds', 'other', 'cash'])
		expect(summary.allocation.classes.reduce((sum, entry) => sum + entry.share, 0)).toBe(WHOLE)
	})
})
