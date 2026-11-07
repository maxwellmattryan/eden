import { describe, expect, it } from 'vitest'
import { createEngine, type EngineStorage } from '../../data/engine.js'
import type { BatchOp, Entity } from '../../data/index.js'
import { createIdGenerator } from '../../data/ulid.js'
import { classifyPass, spendingOf } from './classify.js'
import {
	mergeMerchantOps,
	oneOffOps,
	recategoriseOps,
	reimbursableOps,
	repaymentOps,
	splitOps,
	unlinkRepaymentOps,
} from './edits.js'
import {
	FINANCE,
	WHOLE,
	type Account,
	type CategoryPayload,
	type Merchant,
	type MerchantPayload,
	type Rule,
	type RulePayload,
	type TransactionPayload,
	type TxPart,
} from './types.js'

const usd = (minor: number) => ({ minor, currency: 'USD' })
const NOW = '2026-11-06T15:00:00.000Z'
const ACCOUNTS: Account[] = [
	{ id: 'chk', name: 'Checking', kind: 'checking', currency: 'USD', share: WHOLE },
	{ id: 'sav', name: 'Savings', kind: 'savings', currency: 'USD', share: WHOLE },
]

function memory(): EngineStorage {
	const map = new Map<string, string>()
	return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => void map.set(key, value) }
}

type Fields = Partial<TransactionPayload> & { id: string; minor: number }

/** An engine with the rows written and classified once, as after a sync. */
function setup(rows: Fields[]) {
	const engine = createEngine(memory())
	const newId = createIdGenerator()
	const ids = new Map<string, string>()
	engine.applyBatch(
		rows.map(({ id, minor, ...fields }): BatchOp => {
			ids.set(id, newId())
			const payload: TransactionPayload = {
				accountId: 'chk',
				amount: usd(minor),
				day: '2026-10-01',
				name: id.toUpperCase(),
				pending: false,
				...fields,
			}
			return { op: 'createEntity', input: { id: ids.get(id)!, type: FINANCE.transaction, payload } }
		})
	)
	const read = () => ({
		transactions: engine.queryEntities<TransactionPayload>({ type: FINANCE.transaction }),
		categories: engine.queryEntities<CategoryPayload>({ type: FINANCE.category, includeDeleted: true }),
		rules: engine.queryEntities<RulePayload>({ type: FINANCE.rule }),
		merchants: engine.queryEntities<MerchantPayload>({ type: FINANCE.merchant }),
		accounts: ACCOUNTS,
		name: (key: string) => key,
		newId,
	})
	const classify = () => {
		const out = classifyPass(read())
		if (out.ops.length) engine.applyBatch(out.ops)
		return out
	}
	classify()
	const row = (id: string) =>
		engine.queryEntities<TransactionPayload>({ type: FINANCE.transaction, ids: [ids.get(id)!] })[0]!
	const all = () => engine.queryEntities<TransactionPayload>({ type: FINANCE.transaction })
	const rules = (): Rule[] =>
		engine
			.queryEntities<RulePayload>({ type: FINANCE.rule })
			.map((entry) => ({ ...entry.payload, id: entry.id, updatedAt: entry.updatedAt }))
	const merchants = (): Merchant[] =>
		engine
			.queryEntities<MerchantPayload>({ type: FINANCE.merchant })
			.map((entry) => ({ ...entry.payload, id: entry.id }))
	const category = (key: string) =>
		engine.queryEntities<CategoryPayload>({ type: FINANCE.category }).find((entry) => entry.payload.key === key)!.id
	const ctx = () => ({ rows: all(), merchants: merchants(), rules: rules(), newId, nowIso: NOW })
	return { engine, newId, row, all, rules, merchants, category, ctx, classify }
}

const payloads = (rows: Entity<TransactionPayload>[]) => JSON.stringify(rows.map((entry) => [entry.id, entry.payload]))

describe('finance edits', () => {
	it('fixing a category remembers it', () => {
		const s = setup([
			{ id: 'cafe', minor: -650, name: 'SQ *BLUE BOTTLE', providerCategory: 'FOOD_AND_DRINK_COFFEE' },
			{ id: 'cafe-2', minor: -700, name: 'SQ *BLUE BOTTLE', providerCategory: 'FOOD_AND_DRINK_COFFEE' },
			{ id: 'cafe-owned', minor: -900, name: 'SQ *BLUE BOTTLE' },
			{ id: 'elsewhere', minor: -650, name: 'PEETS', providerCategory: 'FOOD_AND_DRINK_COFFEE' },
			{ id: 'jane', minor: -4000, name: 'VENMO PAYMENT JANE DOE' },
			{ id: 'jane-2', minor: -3000, name: 'VENMO PAYMENT JANE DOE' },
			{ id: 'bob', minor: -2000, name: 'VENMO PAYMENT BOB ROSS' },
			{ id: 'paypal', minor: -1000, name: 'PAYPAL TRANSFER' },
		])
		const groceries = s.category('groceries')
		const gifts = s.category('gifts')
		const home = s.category('home')
		// the owner's category on one Blue Bottle row, which stays
		const owned = s.row('cafe-owned')
		s.engine.applyBatch(recategoriseOps(owned, home, false, s.ctx()).ops)
		const before = payloads(s.all())

		const fix = recategoriseOps(s.row('cafe'), groceries, true, s.ctx())
		expect(fix.created).toBe(true)
		s.engine.applyBatch(fix.ops)
		expect(s.rules()).toEqual([
			expect.objectContaining({
				categoryId: groceries,
				merchantId: s.row('cafe').payload.merchantId,
				learnedFrom: s.row('cafe').id,
			}),
		])
		expect(s.rules()[0]!.counterparty).toBeUndefined()
		expect(s.row('cafe').payload).toMatchObject({ categoryId: groceries, categoryBy: 'owner' })
		expect(s.row('cafe-2').payload).toMatchObject({ categoryId: groceries, categoryBy: 'rule' })
		expect(s.row('cafe-owned').payload).toMatchObject({ categoryId: home, categoryBy: 'owner' })
		expect(s.row('elsewhere').payload.categoryId).toBe(s.category('dining'))
		// the next pass agrees with what the rule did
		expect(s.classify().ops).toEqual([])

		// the one undo takes back the row, the rule and the rows it recategorised
		s.engine.applyBatch(fix.inverse)
		expect(s.rules()).toEqual([])
		expect(payloads(s.all())).toBe(before)

		// a vague merchant's rule is the merchant and the person
		const vague = recategoriseOps(s.row('jane'), gifts, true, s.ctx())
		s.engine.applyBatch(vague.ops)
		expect(vague.rule).toMatchObject({ categoryId: gifts, counterparty: 'jane doe' })
		expect(s.row('jane-2').payload).toMatchObject({ categoryId: gifts, categoryBy: 'rule' })
		expect(s.row('jane-2').payload.review).toBeUndefined()
		expect(s.row('bob').payload.categoryId).toBeUndefined()
		expect(s.row('bob').payload.review).toBe('vague')

		// a vague row with no person makes no rule
		const none = recategoriseOps(s.row('paypal'), gifts, true, s.ctx())
		expect(none.rule).toBeUndefined()
		expect(none.ops).toHaveLength(1)
	})

	it('splits', () => {
		const s = setup([{ id: 'costco', minor: -10000, name: 'COSTCO' }])
		const row = s.row('costco')
		const part = (minor: number, extra: Partial<TxPart> = {}): TxPart => ({ amount: usd(minor), ...extra })
		const cases: [TxPart[], string][] = [
			[[part(-10000)], 'split:too-few'],
			[Array.from({ length: 21 }, () => part(-10000 / 20)), 'split:too-many'],
			[[part(-6000), part(-3000)], 'split:sum'],
			[[part(-11000), part(1000)], 'split:sign'],
			[[part(-6000), { amount: { minor: -4000, currency: 'EUR' } }], 'split:currency'],
			[[part(-10000), part(0)], 'split:zero'],
			[[part(-6000), part(-4000, { note: 'x'.repeat(201) })], 'split:note'],
		]
		for (const [parts, error] of cases) expect(splitOps(row, parts), error).toEqual({ error })

		const groceries = s.category('groceries')
		const home = s.category('home')
		const ok = splitOps(row, [
			part(-6000, { categoryId: groceries }),
			part(-4000, { categoryId: home, note: ' lamp ' }),
		])
		if ('error' in ok) throw new Error(ok.error)
		s.engine.applyBatch(ok.ops)
		const split = s.row('costco').payload
		expect(split.parts).toEqual([
			{ amount: usd(-6000), categoryId: groceries },
			{ amount: usd(-4000), categoryId: home, note: 'lamp' },
		])
		expect(spendingOf(split)).toEqual([
			{ categoryId: groceries, amount: usd(-6000), oneOff: false, pending: false },
			{ categoryId: home, amount: usd(-4000), oneOff: false, pending: false },
		])
		expect(s.classify().ops).toEqual([])
	})

	it('reimbursements and one-offs', () => {
		const s = setup([
			{ id: 'dinner', minor: -12000, name: 'NOPA', providerCategory: 'FOOD_AND_DRINK_RESTAURANT' },
			{ id: 'payback', minor: 6000, day: '2026-10-03', name: 'VENMO PAYMENT ANA LEE' },
			{ id: 'to-savings', minor: -5000, providerCategory: 'TRANSFER_OUT_SAVINGS' },
			{ id: 'at-savings', minor: 5000, accountId: 'sav', providerCategory: 'TRANSFER_IN_SAVINGS' },
			{ id: 'yen', minor: 6000, amount: { minor: 6000, currency: 'JPY' } },
		])
		const dinner = s.row('dinner')
		for (const [amount, error] of [
			[usd(0), 'reimbursable:zero'],
			[usd(-100), 'reimbursable:zero'],
			[usd(12001), 'reimbursable:too-much'],
			[{ minor: 100, currency: 'EUR' }, 'reimbursable:currency'],
		] as const)
			expect(reimbursableOps(dinner, amount), error).toEqual({ error })
		expect(reimbursableOps(s.row('payback'), usd(100))).toEqual({ error: 'reimbursable:money-in' })

		expect(repaymentOps(dinner, s.row('payback'))).toEqual({ error: 'repayment:not-reimbursable' })
		const owed = reimbursableOps(dinner, usd(6000))
		if ('error' in owed) throw new Error(owed.error)
		s.engine.applyBatch(owed.ops)
		const original = s.row('dinner')
		expect(original.payload.reimbursable).toEqual(usd(6000))
		expect(repaymentOps(original, s.row('to-savings'))).toEqual({ error: 'repayment:money-out' })
		expect(repaymentOps(original, s.row('yen'))).toEqual({ error: 'repayment:currency' })
		expect(repaymentOps(original, s.row('at-savings'))).toEqual({ error: 'repayment:paired' })

		const linked = repaymentOps(original, s.row('payback'))
		if ('error' in linked) throw new Error(linked.error)
		s.engine.applyBatch(linked.ops)
		const dining = s.category('dining')
		expect(s.row('payback').payload).toMatchObject({
			kind: 'refund',
			repays: original.id,
			categoryId: dining,
			categoryBy: 'refund',
		})
		expect(s.row('payback').payload.review).toBeUndefined()
		// the repayment nets against the original's category, and is never income
		const net = [...spendingOf(s.row('dinner').payload), ...spendingOf(s.row('payback').payload)]
		expect(net.every((entry) => entry.categoryId === dining)).toBe(true)
		expect(net.reduce((sum, entry) => sum + entry.amount.minor, 0)).toBe(-6000)
		expect(s.classify().ops).toEqual([])

		const unlinked = unlinkRepaymentOps(s.row('payback'))!
		s.engine.applyBatch(unlinked.ops)
		expect(s.row('payback').payload.repays).toBeUndefined()
		s.engine.applyBatch(unlinked.inverse)
		expect(s.row('payback').payload.repays).toBe(original.id)

		const oneOff = oneOffOps(s.row('dinner'), true)!
		s.engine.applyBatch(oneOff.ops)
		expect(spendingOf(s.row('dinner').payload).map((entry) => entry.oneOff)).toEqual([true])
		expect(oneOffOps(s.row('dinner'), true)).toBeUndefined()
		s.engine.applyBatch(oneOff.inverse)
		expect(spendingOf(s.row('dinner').payload).map((entry) => entry.oneOff)).toEqual([false])
	})

	it('merges merchants', () => {
		const s = setup([
			{ id: 'short', minor: -500, merchantName: 'Blue Bottle' },
			{ id: 'long', minor: -600, merchantName: 'Blue Bottle Coffee' },
			{ id: 'long-2', minor: -700, merchantName: 'Blue Bottle Coffee' },
		])
		const into = s.merchants().find((entry) => entry.name === 'Blue Bottle')!
		const from = s.merchants().find((entry) => entry.name === 'Blue Bottle Coffee')!
		const fix = recategoriseOps(s.row('long'), s.category('dining'), true, s.ctx())
		s.engine.applyBatch(fix.ops)
		const before = payloads(s.all())

		const merge = mergeMerchantOps(into, [from], s.all(), s.rules())!
		s.engine.applyBatch(merge.ops)
		expect(s.merchants().map((entry) => entry.id)).toEqual([into.id])
		expect(s.merchants()[0]!.rawNames).toEqual(['Blue Bottle', 'Blue Bottle Coffee'])
		for (const id of ['short', 'long', 'long-2']) expect(s.row(id).payload.merchantId, id).toBe(into.id)
		expect(s.rules().map((entry) => entry.merchantId)).toEqual([into.id])

		s.engine.applyBatch(merge.inverse)
		expect(
			s
				.merchants()
				.map((entry) => entry.id)
				.sort()
		).toEqual([into.id, from.id].sort())
		expect(s.merchants().find((entry) => entry.id === into.id)!.rawNames).toEqual(['Blue Bottle'])
		expect(s.rules().map((entry) => entry.merchantId)).toEqual([from.id])
		expect(payloads(s.all())).toBe(before)

		// merged again, the pass finds the merged names at the merchant they went to
		s.engine.applyBatch(merge.ops)
		expect(s.classify().ops.filter((op) => op.op === 'createEntity')).toEqual([])
		for (const id of ['short', 'long', 'long-2']) expect(s.row(id).payload.merchantId, id).toBe(into.id)
	})
})
