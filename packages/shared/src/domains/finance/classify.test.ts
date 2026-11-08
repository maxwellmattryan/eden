import { describe, expect, it } from 'vitest'
import { createEngine, type EngineStorage } from '../../data/engine.js'
import type { BatchOp, Entity } from '../../data/index.js'
import { createIdGenerator } from '../../data/ulid.js'
import { DEFAULT_CATEGORIES, investmentMeaningOf, providerCategoryOf } from './categories.js'
import { classifyOps, classifyPass, fitParts, insideAccount, ruleFor, spendingOf } from './classify.js'
import {
	FINANCE,
	WHOLE,
	type Account,
	type Category,
	type CategoryPayload,
	type Merchant,
	type MerchantPayload,
	type Rule,
	type RulePayload,
	type TransactionPayload,
	type TxPart,
} from './types.js'

const usd = (minor: number) => ({ minor, currency: 'USD' })

const account = (id: string, kind: Account['kind'], currency = 'USD'): Account => ({
	id,
	name: id,
	kind,
	currency,
	share: WHOLE,
})
const ACCOUNTS = [
	account('chk', 'checking'),
	account('sav', 'savings'),
	account('sav2', 'savings'),
	account('card', 'credit-card'),
	account('yen', 'savings', 'JPY'),
	account('brk', 'investment'),
]
const CATEGORIES: Category[] = DEFAULT_CATEGORIES.map((entry) => ({
	...entry,
	id: `cat-${entry.key}`,
	name: entry.key,
}))

const entity = (id: string, payload: TransactionPayload): Entity<TransactionPayload> => ({
	id,
	uri: `eden://transaction/${id}`,
	type: FINANCE.transaction,
	payload,
	createdAt: '',
	updatedAt: '',
	deletedAt: null,
	mirror: false,
	source: 'plaid',
	externalId: id,
	snapshot: null,
	links: [],
})

type Fields = Partial<TransactionPayload> & { id: string; minor: number }
const row = ({ id, minor, ...fields }: Fields) =>
	entity(id, {
		accountId: 'chk',
		amount: usd(minor),
		day: '2026-10-01',
		name: id.toUpperCase(),
		pending: false,
		...fields,
	})

/** One pass over the rows, and each row's payload once its ops are applied. */
function pass(rows: Entity<TransactionPayload>[], extra: { rules?: Rule[]; merchants?: Merchant[] } = {}) {
	let n = 0
	const out = classifyOps({
		rows,
		accounts: ACCOUNTS,
		categories: CATEGORIES,
		rules: extra.rules ?? [],
		merchants: extra.merchants ?? [],
		newId: () => `new-${(n += 1)}`,
	})
	const after = new Map(rows.map((entry) => [entry.id, entry.payload]))
	for (const op of out.ops) if (op.op === 'updateEntity') after.set(op.id, op.payload as TransactionPayload)
	const of = (id: string) => after.get(id)!
	return { ...out, of }
}

const rule = (id: string, payload: RulePayload, updatedAt = '2026-10-01T00:00:00.000Z'): Rule => ({
	...payload,
	id,
	updatedAt,
})
const merchant = (id: string, name: string, vague?: string): Merchant => ({
	id,
	name,
	key: name.toLowerCase(),
	...(vague ? { vague } : {}),
	rawNames: [name],
})

describe('finance classification', () => {
	it('maps provider categories', () => {
		const cases: [string | undefined, ReturnType<typeof providerCategoryOf>][] = [
			['FOOD_AND_DRINK_GROCERIES', { kind: 'purchase', key: 'groceries', transferLike: false }],
			['FOOD_AND_DRINK_RESTAURANT', { kind: 'purchase', key: 'dining', transferLike: false }],
			['FOOD_AND_DRINK_COFFEE', { kind: 'purchase', key: 'dining', transferLike: false }],
			['RENT_AND_UTILITIES_TELEPHONE', { kind: 'purchase', key: 'phone', transferLike: false }],
			['RENT_AND_UTILITIES_RENT', { kind: 'purchase', key: 'rent', transferLike: false }],
			['RENT_AND_UTILITIES_GAS_AND_ELECTRICITY', { kind: 'purchase', key: 'utilities', transferLike: false }],
			['GENERAL_MERCHANDISE_SPORTING_GOODS', { kind: 'purchase', key: 'shopping', transferLike: false }],
			['TRANSPORTATION_GAS', { kind: 'purchase', key: 'transport', transferLike: false }],
			['GENERAL_SERVICES_INSURANCE', { kind: 'purchase', key: 'insurance', transferLike: false }],
			[
				'GENERAL_SERVICES_ACCOUNTING_AND_FINANCIAL_PLANNING',
				{ kind: 'purchase', key: 'services', transferLike: false },
			],
			['GOVERNMENT_AND_NON_PROFIT_DONATIONS', { kind: 'purchase', key: 'gifts', transferLike: false }],
			['GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT', { kind: 'purchase', key: 'taxes', transferLike: false }],
			['BANK_FEES_INTEREST_CHARGE', { kind: 'interest-charged', key: 'fees', transferLike: false }],
			['BANK_FEES_ATM_FEES', { kind: 'fee', key: 'fees', transferLike: false }],
			['INCOME_WAGES', { kind: 'income', key: 'income', transferLike: false }],
			['INCOME_DIVIDENDS', { kind: 'dividend', key: 'income', transferLike: false }],
			['INCOME_INTEREST_EARNED', { kind: 'interest-earned', key: 'income', transferLike: false }],
			['LOAN_PAYMENTS_CREDIT_CARD_PAYMENT', { kind: 'card-payment', transferLike: true }],
			['LOAN_PAYMENTS_CAR_PAYMENT', { kind: 'transfer', key: 'debt', transferLike: true }],
			['TRANSFER_OUT_SAVINGS', { kind: 'transfer', transferLike: true }],
			['TRANSFER_IN_ACCOUNT_TRANSFER', { kind: 'transfer', transferLike: true }],
			['SOMETHING_NEW', { transferLike: false }],
			[undefined, { transferLike: false }],
		]
		for (const [code, meaning] of cases) expect(providerCategoryOf(code), String(code)).toEqual(meaning)

		const { of } = pass([
			row({ id: 'groceries', minor: -4210, merchantName: 'Safeway', providerCategory: 'FOOD_AND_DRINK_GROCERIES' }),
			row({
				id: 'back',
				minor: 1200,
				merchantName: 'Safeway',
				providerCategory: 'FOOD_AND_DRINK_GROCERIES',
				day: '2026-09-01',
			}),
			row({ id: 'interest', minor: -1999, providerCategory: 'BANK_FEES_INTEREST_CHARGE' }),
			row({ id: 'atm', minor: -300, providerCategory: 'BANK_FEES_ATM_FEES' }),
			row({ id: 'pay', minor: 250000, providerCategory: 'INCOME_WAGES' }),
			row({ id: 'odd-out', minor: -999, providerCategory: 'SOMETHING_NEW' }),
			row({ id: 'odd-in', minor: 999 }),
		])
		expect(of('groceries')).toMatchObject({ kind: 'purchase', categoryId: 'cat-groceries', categoryBy: 'provider' })
		// a money-in row with a spending category is a refund in it (the purchase is after it, so no link)
		expect(of('back')).toMatchObject({ kind: 'refund', categoryId: 'cat-groceries', categoryBy: 'provider' })
		expect(of('back').refundOf).toBeUndefined()
		expect(of('interest')).toMatchObject({ kind: 'interest-charged', categoryId: 'cat-fees' })
		expect(of('atm')).toMatchObject({ kind: 'fee', categoryId: 'cat-fees' })
		expect(of('pay')).toMatchObject({ kind: 'income', categoryId: 'cat-income' })
		expect(of('odd-out')).toMatchObject({ kind: 'purchase' })
		expect(of('odd-in')).toMatchObject({ kind: 'refund' })
		for (const id of ['odd-out', 'odd-in']) expect(of(id).categoryId, id).toBeUndefined()
	})

	it('pairs transfers between own accounts', () => {
		const out = 'TRANSFER_OUT_SAVINGS'
		const into = 'TRANSFER_IN_SAVINGS'
		const card = 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT'
		const { of } = pass([
			row({ id: 'to-savings', minor: -50000, day: '2026-10-01', providerCategory: out }),
			row({ id: 'at-savings', minor: 50000, day: '2026-10-03', accountId: 'sav', providerCategory: into }),
			row({ id: 'pay-card', minor: -118000, day: '2026-10-05', providerCategory: card }),
			row({ id: 'card-paid', minor: 118000, day: '2026-10-06', accountId: 'card', providerCategory: card }),
			// no pair: amounts that do not cancel, four days apart, the same account, another currency
			row({ id: 'off-a', minor: -10000, providerCategory: out }),
			row({ id: 'off-b', minor: 9999, accountId: 'sav', providerCategory: into }),
			row({ id: 'late-a', minor: -20000, day: '2026-10-01', providerCategory: out }),
			row({ id: 'late-b', minor: 20000, day: '2026-10-05', accountId: 'sav', providerCategory: into }),
			row({ id: 'same-a', minor: -30000, providerCategory: out }),
			row({ id: 'same-b', minor: 30000, providerCategory: into }),
			row({ id: 'usd', minor: -40000, providerCategory: out }),
			entity('jpy', {
				...row({ id: 'jpy', minor: 0 }).payload,
				accountId: 'yen',
				amount: { minor: 40000, currency: 'JPY' },
			}),
			// three candidates for one partner: the nearest by day
			row({ id: 'many', minor: -70000, day: '2026-10-10', providerCategory: out }),
			row({ id: 'gap-3', minor: 70000, day: '2026-10-07', accountId: 'sav', providerCategory: into }),
			row({ id: 'gap-2', minor: 70000, day: '2026-10-12', accountId: 'sav2', providerCategory: into }),
			row({ id: 'gap-1', minor: 70000, day: '2026-10-11', accountId: 'sav', providerCategory: into }),
		])
		for (const [a, b, kind] of [
			['to-savings', 'at-savings', 'transfer'],
			['pay-card', 'card-paid', 'card-payment'],
			['many', 'gap-1', 'transfer'],
		] as const) {
			expect(of(a), a).toMatchObject({ kind, transferId: b })
			expect(of(b), b).toMatchObject({ kind, transferId: a })
			for (const id of [a, b]) {
				expect(of(id).categoryId, id).toBeUndefined()
				expect(spendingOf(of(id)), id).toEqual([])
			}
		}
		for (const id of ['off-a', 'off-b', 'late-a', 'late-b', 'same-a', 'same-b', 'usd', 'jpy', 'gap-2', 'gap-3'])
			expect(of(id).transferId, id).toBeUndefined()
	})

	it('vague merchants and unpaired transfers', () => {
		const { of, merchants } = pass([
			row({
				id: 'to-ally',
				minor: -100000,
				name: 'ONLINE TRANSFER TO ALLY',
				providerCategory: 'TRANSFER_OUT_ACCOUNT_TRANSFER',
			}),
			row({
				id: 'zelle',
				minor: -2500,
				name: 'Zelle payment to John Smith Conf# 1234567',
				providerCategory: 'TRANSFER_OUT_ACCOUNT_TRANSFER',
			}),
			row({ id: 'zelle-own', minor: -30000, day: '2026-10-02', name: 'Zelle transfer to Ana Lee' }),
			row({ id: 'own-deposit', minor: 30000, day: '2026-10-03', accountId: 'sav', name: 'DEPOSIT' }),
		])
		expect(of('to-ally')).toMatchObject({ kind: 'transfer' })
		expect(of('to-ally').transferId).toBeUndefined()
		expect(spendingOf(of('to-ally'))).toEqual([])

		const zelle = merchants.find((entry) => entry.vague === 'Zelle')!
		expect(zelle).toMatchObject({ name: 'Zelle', key: 'zelle' })
		expect(of('zelle')).toMatchObject({
			kind: 'purchase',
			merchantId: zelle.id,
			counterparty: 'john smith',
			review: 'vague',
		})
		expect(of('zelle').categoryId).toBeUndefined()
		expect(spendingOf(of('zelle'))).toEqual([{ amount: usd(-2500), oneOff: false, pending: false }])

		// one merchant row per brand
		expect(of('zelle-own').merchantId).toBe(zelle.id)
		expect(of('zelle-own')).toMatchObject({ kind: 'transfer', transferId: 'own-deposit' })
		expect(of('zelle-own').review).toBeUndefined()
	})

	it('refunds take the original category', () => {
		const rules = [rule('r-outlet', { categoryId: 'cat-gifts', merchantId: 'm-outlet' })]
		const merchants = [merchant('m-outlet', 'Outlet')]
		const { of } = pass(
			[
				row({
					id: 'rei',
					minor: -12000,
					day: '2026-10-01',
					name: 'REI #123',
					providerCategory: 'GENERAL_MERCHANDISE_SPORTING_GOODS',
				}),
				row({
					id: 'rei-older',
					minor: -6000,
					day: '2026-09-01',
					name: 'REI #123',
					providerCategory: 'GENERAL_MERCHANDISE_SPORTING_GOODS',
				}),
				row({ id: 'rei-back', minor: 5499, day: '2026-10-11', name: 'REI #123' }),
				// bigger than every purchase at the merchant, or only a purchase after it: no link
				row({
					id: 'target',
					minor: -1000,
					day: '2026-10-01',
					merchantName: 'Target',
					providerCategory: 'FOOD_AND_DRINK_GROCERIES',
				}),
				row({
					id: 'target-back',
					minor: 2000,
					day: '2026-10-05',
					merchantName: 'Target',
					providerCategory: 'GENERAL_MERCHANDISE_SUPERSTORES',
				}),
				row({
					id: 'outlet-back',
					minor: 1500,
					day: '2026-10-05',
					merchantName: 'Outlet',
					providerCategory: 'GENERAL_MERCHANDISE_SUPERSTORES',
				}),
				row({ id: 'outlet', minor: -9000, day: '2026-10-06', merchantName: 'Outlet' }),
			],
			{ rules, merchants }
		)
		expect(of('rei')).toMatchObject({ kind: 'purchase', categoryId: 'cat-shopping' })
		expect(of('rei-back')).toMatchObject({
			kind: 'refund',
			refundOf: 'rei',
			categoryId: 'cat-shopping',
			categoryBy: 'refund',
		})
		expect(spendingOf(of('rei-back'))).toEqual([
			{ categoryId: 'cat-shopping', amount: usd(5499), oneOff: false, pending: false },
		])
		expect(of('target-back').refundOf).toBeUndefined()
		expect(of('target-back')).toMatchObject({ kind: 'refund', categoryId: 'cat-shopping', categoryBy: 'provider' })
		expect(of('outlet-back').refundOf).toBeUndefined()
		expect(of('outlet-back')).toMatchObject({ kind: 'refund', categoryId: 'cat-gifts', categoryBy: 'rule' })
	})

	it('category precedence', () => {
		const merchants = [
			merchant('m-blue', 'Blue Bottle'),
			merchant('m-venmo', 'Venmo', 'Venmo'),
			merchant('m-zelle', 'Zelle', 'Zelle'),
		]
		const rules = [
			rule('r-blue', { categoryId: 'cat-groceries', merchantId: 'm-blue' }),
			rule('r-venmo-jane', { categoryId: 'cat-gifts', merchantId: 'm-venmo', counterparty: 'jane doe' }),
			rule('r-venmo', { categoryId: 'cat-services', merchantId: 'm-venmo' }),
			rule('r-jane', { categoryId: 'cat-rent', counterparty: 'jane doe' }),
			// a rule on a category that is gone is never used
			rule('r-gone', { categoryId: 'cat-deleted', merchantId: 'm-blue' }, '2026-12-01T00:00:00.000Z'),
		]
		const { of } = pass(
			[
				row({
					id: 'owned',
					minor: -800,
					merchantName: 'Blue Bottle',
					providerCategory: 'FOOD_AND_DRINK_COFFEE',
					categoryId: 'cat-travel',
					categoryBy: 'owner',
				}),
				row({ id: 'ruled', minor: -650, merchantName: 'Blue Bottle', providerCategory: 'FOOD_AND_DRINK_COFFEE' }),
				row({ id: 'jane', minor: -4000, name: 'VENMO PAYMENT JANE DOE' }),
				row({ id: 'bob', minor: -4000, name: 'VENMO PAYMENT BOB ROSS' }),
				row({ id: 'zelle-jane', minor: -4000, name: 'Zelle payment to Jane Doe' }),
			],
			{ rules, merchants }
		)
		expect(of('owned')).toMatchObject({ categoryId: 'cat-travel', categoryBy: 'owner' })
		expect(of('ruled')).toMatchObject({ categoryId: 'cat-groceries', categoryBy: 'rule' })
		expect(of('jane')).toMatchObject({ categoryId: 'cat-gifts', categoryBy: 'rule' })
		expect(of('bob')).toMatchObject({ categoryId: 'cat-services', categoryBy: 'rule' })
		expect(of('zelle-jane')).toMatchObject({ categoryId: 'cat-rent', categoryBy: 'rule', merchantId: 'm-zelle' })
		for (const id of ['jane', 'bob', 'zelle-jane']) expect(of(id).review, id).toBeUndefined()

		// ties go to the most recently updated rule
		const older = rule('a', { categoryId: 'cat-groceries', merchantId: 'm-blue' }, '2026-10-01T00:00:00.000Z')
		const newer = rule('b', { categoryId: 'cat-dining', merchantId: 'm-blue' }, '2026-10-02T00:00:00.000Z')
		expect(ruleFor([newer, older], 'm-blue', undefined)?.id).toBe('b')
		expect(ruleFor([older, newer], 'm-blue', undefined)?.id).toBe('b')
		expect(ruleFor([older], 'm-other', undefined)).toBeUndefined()
	})

	it('fits parts to a new amount', () => {
		const parts: TxPart[] = [
			{ amount: usd(-6000), categoryId: 'cat-groceries' },
			{ amount: usd(-4000), categoryId: 'cat-home', note: 'lamp' },
		]
		expect(fitParts(parts, usd(-10000))).toEqual({ parts })
		expect(fitParts(parts, usd(-9000))).toEqual({ parts: [{ ...parts[0], amount: usd(-5000) }, parts[1]] })
		expect(fitParts(parts, usd(-11000))).toEqual({ parts: [{ ...parts[0], amount: usd(-7000) }, parts[1]] })
		// the largest part would be zero or flip: the split goes and its category stays
		expect(fitParts(parts, usd(-4000))).toEqual({ dropped: parts[0] })
		expect(fitParts(parts, usd(-3000))).toEqual({ dropped: parts[0] })

		const { of } = pass([
			row({ id: 'fits', minor: -9000, parts, reimbursable: usd(9500) }),
			row({ id: 'flips', minor: -3000, parts }),
		])
		expect(of('fits').parts!.map((part) => part.amount.minor)).toEqual([-5000, -4000])
		expect(of('fits').reimbursable).toEqual(usd(9000))
		expect(of('flips').parts).toBeUndefined()
		expect(of('flips')).toMatchObject({ categoryId: 'cat-groceries', categoryBy: 'owner' })
	})

	it('a second pass writes nothing', () => {
		const engine = createEngine(memory())
		const newId = createIdGenerator()
		const rows: TransactionPayload[] = [
			{ ...row({ id: 'a', minor: -50000, providerCategory: 'TRANSFER_OUT_SAVINGS' }).payload },
			{ ...row({ id: 'b', minor: 50000, accountId: 'sav', day: '2026-10-02' }).payload },
			{ ...row({ id: 'c', minor: -12000, name: 'REI #1', providerCategory: 'GENERAL_MERCHANDISE' }).payload },
			{ ...row({ id: 'd', minor: 4000, name: 'REI #1', day: '2026-10-04' }).payload },
			{ ...row({ id: 'e', minor: -2500, name: 'Zelle payment to John Smith' }).payload },
			{ ...row({ id: 'f', minor: -1500, name: 'SQ *BLUE BOTTLE', providerCategory: 'FOOD_AND_DRINK_COFFEE' }).payload },
			{ ...row({ id: 'g', minor: 250000, name: 'ACME PAYROLL', providerCategory: 'INCOME_WAGES' }).payload },
			{ ...row({ id: 'h', minor: -9000, parts: [{ amount: usd(-6000) }, { amount: usd(-4000) }] }).payload },
		]
		engine.applyBatch(
			rows.map((payload): BatchOp => ({ op: 'createEntity', input: { type: FINANCE.transaction, payload } }))
		)
		const run = () => {
			const out = classifyPass({
				transactions: engine.queryEntities<TransactionPayload>({ type: FINANCE.transaction }),
				categories: engine.queryEntities<CategoryPayload>({ type: FINANCE.category, includeDeleted: true }),
				rules: engine.queryEntities<RulePayload>({ type: FINANCE.rule }),
				merchants: engine.queryEntities<MerchantPayload>({ type: FINANCE.merchant }),
				accounts: ACCOUNTS,
				name: (key) => `name:${key}`,
				newId,
			})
			if (out.ops.length) engine.applyBatch(out.ops)
			return out
		}
		const first = run()
		expect(first.ops.length).toBeGreaterThan(0)
		const categories = engine.queryEntities<CategoryPayload>({ type: FINANCE.category })
		expect(categories).toHaveLength(DEFAULT_CATEGORIES.length)
		expect(categories.find((entry) => entry.payload.key === 'groceries')?.payload).toEqual({
			key: 'groceries',
			name: 'name:groceries',
			group: 'variable',
			essential: true,
		})
		const transactions = engine.queryEntities<TransactionPayload>({ type: FINANCE.transaction })
		for (const entry of transactions) expect(entry.payload.kind).toBeDefined()

		expect(run().ops).toEqual([])
		expect(engine.queryEntities({ type: FINANCE.category })).toHaveLength(DEFAULT_CATEGORIES.length)

		// one category that ever existed, even deleted, stops the defaults
		const other = createEngine(memory())
		const id = newId()
		other.applyBatch([
			{
				op: 'createEntity',
				input: { id, type: FINANCE.category, payload: { name: 'Mine', group: 'variable', essential: false } },
			},
			{ op: 'delete', uri: `eden://${FINANCE.category}/${id}` },
		])
		const seeded = classifyPass({
			transactions: [],
			categories: other.queryEntities<CategoryPayload>({ type: FINANCE.category, includeDeleted: true }),
			rules: [],
			merchants: [],
			accounts: [],
			name: (key) => key,
			newId,
		})
		expect(seeded.ops).toEqual([])
		expect(seeded.categories).toEqual([])
	})
})

describe('investments', () => {
	type Investment = NonNullable<TransactionPayload['investment']>
	const inv = (id: string, minor: number, investment: Investment, fields: Partial<TransactionPayload> = {}) =>
		row({ id, minor, accountId: 'brk', name: `${investment.type} VTI`, investment, ...fields })

	it('maps investment types and subtypes', () => {
		const cases: [string, string | undefined, ReturnType<typeof investmentMeaningOf>][] = [
			['buy', 'buy', { kind: 'investment-buy', transferLike: false }],
			['buy', 'dividend reinvestment', { kind: 'investment-buy', transferLike: false }],
			['sell', 'sell', { kind: 'investment-sell', transferLike: false }],
			['cash', 'dividend', { kind: 'dividend', key: 'income', transferLike: false }],
			['cash', 'qualified dividend', { kind: 'dividend', key: 'income', transferLike: false }],
			['cash', 'long-term capital gain', { kind: 'dividend', key: 'income', transferLike: false }],
			['cash', 'interest', { kind: 'interest-earned', key: 'income', transferLike: false }],
			['fee', 'management fee', { kind: 'fee', key: 'fees', transferLike: false }],
			['transfer', 'transfer', { kind: 'transfer', transferLike: true }],
			['cash', 'deposit', { kind: 'transfer', transferLike: true }],
			['cash', 'withdrawal', { kind: 'transfer', transferLike: true }],
			['cash', 'contribution', { kind: 'transfer', transferLike: true }],
			['cash', 'distribution', { kind: 'transfer', transferLike: true }],
			['cash', 'tax', { kind: 'transfer', transferLike: false }],
			['cancel', undefined, { kind: 'transfer', transferLike: false }],
		]
		for (const [type, subtype, meaning] of cases)
			expect(investmentMeaningOf(type, subtype), `${type} ${subtype}`).toEqual(meaning)
	})

	it('gives investment rows their kinds, no merchant, and categories only to dividends, interest and fees', () => {
		const rows = [
			inv('buy', -57200, { type: 'buy', subtype: 'buy', securityId: 'vti' }),
			inv('sell', 30000, { type: 'sell', subtype: 'sell', securityId: 'vti' }),
			inv('div', 1842, { type: 'cash', subtype: 'dividend', securityId: 'vti' }),
			inv('int', 312, { type: 'cash', subtype: 'interest' }),
			inv('fee', -500, { type: 'fee', subtype: 'account fee' }),
			inv('odd', -100, { type: 'cancel' }),
		]
		const { of, merchants } = pass(rows)
		expect(merchants).toEqual([])
		const kinds = Object.fromEntries(rows.map((entry) => [entry.id, [of(entry.id).kind, of(entry.id).categoryId]]))
		expect(kinds).toEqual({
			buy: ['investment-buy', undefined],
			sell: ['investment-sell', undefined],
			div: ['dividend', 'cat-income'],
			int: ['interest-earned', 'cat-income'],
			fee: ['fee', 'cat-fees'],
			odd: ['transfer', undefined],
		})
		for (const entry of rows) expect(of(entry.id).merchantId).toBeUndefined()
		expect(spendingOf(of('buy'))).toEqual([])
		expect(spendingOf(of('sell'))).toEqual([])
		expect(insideAccount(of('buy'))).toBe(true)
		expect(insideAccount(of('div'))).toBe(false)
	})

	it("pairs a brokerage deposit with checking's transfer out, never a buy", () => {
		const rows = [
			row({ id: 'out', minor: -100000, day: '2026-10-01', providerCategory: 'TRANSFER_OUT_ACCOUNT_TRANSFER' }),
			inv('dep', 100000, { type: 'cash', subtype: 'deposit' }, { day: '2026-10-02' }),
			// a buy of the same size on the same day stays a buy
			row({ id: 'in', minor: 57200, day: '2026-10-05', providerCategory: 'TRANSFER_IN_ACCOUNT_TRANSFER' }),
			inv('buy', -57200, { type: 'buy', subtype: 'buy', securityId: 'vti' }, { day: '2026-10-05' }),
		]
		const { of } = pass(rows)
		expect(of('out').transferId).toBe('dep')
		expect(of('dep').transferId).toBe('out')
		expect(of('dep').kind).toBe('transfer')
		expect(of('buy').transferId).toBeUndefined()
		expect(of('buy').kind).toBe('investment-buy')
	})

	it('marks a dividend reinvested by the matching reinvestment buy, smallest gap first, one buy each', () => {
		const vti = (subtype: string) => ({ type: 'buy', subtype, securityId: 'vti' })
		const rows = [
			inv('div1', 1842, { type: 'cash', subtype: 'dividend', securityId: 'vti' }, { day: '2026-10-01' }),
			inv('div2', 1842, { type: 'cash', subtype: 'dividend', securityId: 'vti' }, { day: '2026-10-03' }),
			inv('re1', -1842, vti('dividend reinvestment'), { day: '2026-10-03' }),
			// another security, an ordinary buy, a gap of four days: none reinvests
			inv('div3', 500, { type: 'cash', subtype: 'dividend', securityId: 'schd' }, { day: '2026-10-01' }),
			inv('re-other', -500, vti('dividend reinvestment'), { day: '2026-10-01' }),
			inv('div4', 700, { type: 'cash', subtype: 'dividend', securityId: 'vti' }, { day: '2026-10-01' }),
			inv('plain', -700, vti('buy'), { day: '2026-10-01' }),
			inv('div5', 900, { type: 'cash', subtype: 'interest', securityId: 'vti' }, { day: '2026-10-01' }),
			inv('late', -900, vti('interest reinvestment'), { day: '2026-10-05' }),
		]
		const first = pass(rows)
		expect(first.of('div2').reinvested).toBe('re1')
		expect(first.of('div1').reinvested).toBeUndefined()
		for (const id of ['div3', 'div4', 'div5']) expect(first.of(id).reinvested, id).toBeUndefined()
		expect(insideAccount(first.of('div2'))).toBe(true)
		expect(insideAccount(first.of('div1'))).toBe(false)

		// idempotent: a second pass over the first one's result writes nothing
		const again = rows.map((entry) => ({ ...entry, payload: first.of(entry.id) }))
		expect(pass(again).ops).toEqual([])

		// the buy gone, the mark goes with it
		const without = again.filter((entry) => entry.id !== 're1')
		expect(pass(without).of('div2').reinvested).toBeUndefined()
	})
})

function memory(): EngineStorage {
	const map = new Map<string, string>()
	return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => void map.set(key, value) }
}
