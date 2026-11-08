import { describe, expect, it } from 'vitest'
import { createEngine, type EngineStorage } from '../../data/engine.js'
import { toUri, type BatchOp, type Entity } from '../../data/index.js'
import { createIdGenerator } from '../../data/ulid.js'
import { addDays } from '../../dates/index.js'
import { DEFAULT_CATEGORIES } from './categories.js'
import { addMonthsClamped } from './bills.js'
import { classifyPass } from './classify.js'
import {
	recurringBillDraft,
	billOfferOps,
	chargedAfterCancel,
	linkBillOps,
	monthlyCostOf,
	offersBill,
	overlapsOf,
	recurringOps,
	recurringStateOps,
	recurringTotals,
	statusOf,
	withUpdates,
} from './recurring.js'
import { chunked } from './sync.js'
import {
	FINANCE,
	type Category,
	type CategoryPayload,
	type Merchant,
	type MerchantPayload,
	type RecurringCharge,
	type RecurringPayload,
	type RulePayload,
	type TransactionPayload,
} from './types.js'

const usd = (minor: number) => ({ minor, currency: 'USD' })
const jpy = (minor: number) => ({ minor, currency: 'JPY' })

function entity<T>(type: string, id: string, payload: T): Entity<T> {
	return {
		id,
		uri: toUri(type, id),
		type,
		payload,
		createdAt: '',
		updatedAt: '',
		deletedAt: null,
		mirror: false,
		source: null,
		externalId: null,
		snapshot: null,
		links: [],
	} as unknown as Entity<T>
}

type Options = Partial<TransactionPayload> & { currency?: string }
const tx = (id: string, day: string, minor: number, { currency = 'USD', ...fields }: Options = {}) =>
	entity<TransactionPayload>(FINANCE.transaction, id, {
		accountId: 'card',
		amount: { minor, currency },
		day,
		name: id,
		pending: false,
		kind: 'purchase',
		merchantId: 'm-netflix',
		categoryId: 'cat-subscriptions',
		...fields,
	})

/** A series' rows, `<prefix>-00`, `<prefix>-01`…, one amount for all or one per day. */
const rows = (prefix: string, days: readonly string[], amounts: number | readonly number[], options: Options = {}) =>
	days.map((day, at) =>
		tx(`${prefix}-${String(at).padStart(2, '0')}`, day, typeof amounts === 'number' ? amounts : amounts[at]!, options)
	)
const monthly = (start: string, count: number) => Array.from({ length: count }, (_, at) => addMonthsClamped(start, at))
const every = (start: string, days: number, count: number) =>
	Array.from({ length: count }, (_, at) => addDays(start, days * at))

interface World {
	rows: Entity<TransactionPayload>[]
	charges: Entity<RecurringPayload>[]
}

/** The ops written to an in-memory world, as the data layer would. */
function applyOps(world: World, ops: readonly BatchOp[]): World {
	let txs = [...world.rows]
	let charges = [...world.charges]
	for (const op of ops) {
		if (op.op === 'createEntity')
			charges.push(entity(FINANCE.recurring, op.input.id!, op.input.payload as RecurringPayload))
		else if (op.op === 'updateEntity') {
			txs = txs.map((row) => (row.id === op.id ? { ...row, payload: op.payload as TransactionPayload } : row))
			charges = charges.map((row) => (row.id === op.id ? { ...row, payload: op.payload as RecurringPayload } : row))
		} else if (op.op === 'delete') charges = charges.filter((row) => row.uri !== op.uri)
	}
	return { rows: txs, charges }
}

function ids(prefix = 'r') {
	let next = 0
	return () => `${prefix}${String((next += 1)).padStart(3, '0')}`
}

/** One pass over a world, and the world after its ops. */
function pass(world: World, newId = ids()) {
	const out = recurringOps({ rows: world.rows, charges: world.charges, newId })
	return { out, world: applyOps(world, out.ops) }
}
const fresh = (txs: Entity<TransactionPayload>[]): World => ({ rows: txs, charges: [] })
const idsOf = (world: World, prefix: string) =>
	world.rows.filter((row) => row.id.startsWith(`${prefix}-`)).map((row) => row.payload.recurringId)

describe('recurring charges', () => {
	it('detects cadences', () => {
		const cases: {
			name: string
			txs: Entity<TransactionPayload>[]
			expect?: Partial<RecurringPayload>
		}[] = [
			{
				name: 'weekly',
				txs: rows('w', every('2026-01-05', 7, 4), -999),
				expect: { cadence: 'weekly', firstDay: '2026-01-05', lastDay: '2026-01-26', nextDay: '2026-02-02', count: 4 },
			},
			{
				name: 'biweekly',
				txs: rows('b', every('2026-01-02', 14, 3), -2500),
				expect: { cadence: 'biweekly', firstDay: '2026-01-02', lastDay: '2026-01-30', nextDay: '2026-02-13', count: 3 },
			},
			{
				name: 'monthly, Jan 31 to Feb 28',
				txs: rows('m', ['2025-11-30', '2025-12-31', '2026-01-31'], -1549),
				expect: { cadence: 'monthly', firstDay: '2025-11-30', lastDay: '2026-01-31', nextDay: '2026-02-28', count: 3 },
			},
			{
				name: 'quarterly',
				txs: rows('q', ['2025-03-15', '2025-06-15', '2025-09-15'], -4500),
				expect: {
					cadence: 'quarterly',
					firstDay: '2025-03-15',
					lastDay: '2025-09-15',
					nextDay: '2025-12-15',
					count: 3,
				},
			},
			{
				name: 'yearly',
				txs: rows('y', ['2024-05-01', '2025-05-01'], -9900),
				expect: { cadence: 'yearly', firstDay: '2024-05-01', lastDay: '2025-05-01', nextDay: '2026-05-01', count: 2 },
			},
			{ name: 'one charge short', txs: rows('s', monthly('2026-01-10', 2), -1549) },
			{
				name: 'two intervals outside the window',
				txs: rows('o', ['2026-01-01', '2026-01-31', '2026-03-02', '2026-04-16', '2026-05-31'], -1549),
			},
			{
				name: 'pending',
				txs: rows('p', monthly('2026-01-10', 4), -1549, { pending: true, recurringId: 'gone' }),
			},
			{ name: 'one-off', txs: rows('n', monthly('2026-01-10', 4), -1549, { oneOff: true }) },
			{ name: 'money in', txs: rows('i', monthly('2026-01-10', 4), 1549, { kind: 'refund' }) },
			{ name: 'transfer', txs: rows('t', monthly('2026-01-10', 4), -1549, { kind: 'transfer' }) },
			{ name: 'no merchant', txs: rows('x', monthly('2026-01-10', 4), -1549, { merchantId: undefined }) },
		]
		for (const entry of cases) {
			// the last charge's account and category are the row's
			const txs = entry.txs.map((row, at) =>
				at === entry.txs.length - 1
					? { ...row, payload: { ...row.payload, accountId: 'card2', categoryId: 'cat-streaming' } }
					: row
			)
			const { out, world } = pass(fresh(txs))
			const prefix = txs[0]!.id.split('-')[0]!
			if (!entry.expect) {
				expect(out.charges, entry.name).toEqual([])
				expect(idsOf(world, prefix), entry.name).toEqual(txs.map(() => undefined))
				continue
			}
			expect(out.charges, entry.name).toHaveLength(1)
			const charge = out.charges[0]!
			expect(charge, entry.name).toMatchObject({ ...entry.expect, accountId: 'card2', categoryId: 'cat-streaming' })
			expect(idsOf(world, prefix), entry.name).toEqual(txs.map(() => charge.id))
		}
	})

	it('splits series', () => {
		const days = monthly('2026-01-03', 3)
		const cases: { name: string; txs: Entity<TransactionPayload>[]; groups: string[][] }[] = [
			{
				name: 'two prices at one merchant',
				txs: [
					...rows('a', days, -299, { merchantId: 'm-apple' }),
					...rows('b', days, -1099, { merchantId: 'm-apple' }),
				],
				groups: [['a'], ['b']],
			},
			{
				name: 'same price two days apart',
				txs: [
					...rows('a', days, -1549),
					...rows(
						'b',
						days.map((day) => addDays(day, 2)),
						-1549
					),
				],
				groups: [['a'], ['b']],
			},
			{
				name: 'a vague merchant, two people',
				txs: [
					...rows('a', days, -5000, { merchantId: 'm-venmo', counterparty: 'alice' }),
					...rows('b', days, -5000, { merchantId: 'm-venmo', counterparty: 'bob' }),
				],
				groups: [['a'], ['b']],
			},
			{
				name: 'two currencies',
				txs: [...rows('a', days, -999), ...rows('b', days, -1500, { currency: 'JPY' })],
				groups: [['a'], ['b']],
			},
		]
		for (const entry of cases) {
			const { out, world } = pass(fresh(entry.txs))
			expect(out.charges, entry.name).toHaveLength(entry.groups.length)
			const seen = new Set<string>()
			for (const [prefix] of entry.groups) {
				const named = new Set(idsOf(world, prefix!))
				expect(named.size, entry.name).toBe(1)
				const [id] = [...named]
				expect(id, entry.name).toBeDefined()
				expect(seen.has(id!), entry.name).toBe(false)
				seen.add(id!)
			}
		}
		const venmo = pass(fresh(cases[2]!.txs))
			.out.charges.map((charge) => charge.counterparty)
			.sort()
		expect(venmo).toEqual(['alice', 'bob'])
		const currencies = pass(fresh(cases[3]!.txs))
			.out.charges.map((charge) => charge.currency)
			.sort()
		expect(currencies).toEqual(['JPY', 'USD'])
	})

	it('fixed and variable amounts', () => {
		const fixedDays = monthly('2026-01-15', 4)
		const fixed = pass(fresh(rows('f', fixedDays, [-1549, -1549, -1549, -1799]))).out.charges[0]!
		expect(fixed.variable).toBeUndefined()
		expect(fixed.priceChanges).toEqual([{ day: fixedDays[3], from: usd(-1549), to: usd(-1799) }])
		expect(fixed.expected).toEqual(usd(-1799))
		expect(fixed.lastAmount).toEqual(usd(-1799))

		const variable = pass(fresh(rows('v', monthly('2026-01-15', 4), [-5000, -6200, -5400, -4800]))).out.charges[0]!
		expect(variable).toMatchObject({ variable: true, priceChanges: [], expected: usd(-5400), cadence: 'monthly' })

		// 13 changes early on, then six intervals at one price: fixed, and only the newest 12 kept
		const longDays = monthly('2024-01-15', 20)
		const amounts = longDays.map((_, at) => (at <= 13 ? -1000 - (at % 2) * 10 : -1010))
		const long = pass(fresh(rows('l', longDays, amounts))).out.charges[0]!
		expect(long.variable).toBeUndefined()
		expect(long.priceChanges).toHaveLength(12)
		expect(long.priceChanges[0]!.day).toBe(longDays[2])
		expect(long.priceChanges.at(-1)!.day).toBe(longDays[13])
	})

	it('keeps rows across passes', () => {
		const days = monthly('2026-01-15', 4)
		const first = pass(fresh(rows('n', days.slice(0, 3), -1549)))
		expect(first.out.ops.length).toBeGreaterThan(0)
		// a second pass over the first one's result writes nothing
		expect(pass(first.world).out.ops).toEqual([])

		// the owner kept it, and a new charge comes: same row, owner fields as they were
		const [row] = first.world.charges
		const kept = applyOps(first.world, [
			{ op: 'updateEntity', id: row!.id, payload: { ...row!.payload, state: 'kept', stateOn: '2026-03-20' } },
		])
		const next = pass({ ...kept, rows: [...kept.rows, tx('n-03', days[3]!, -1549)] })
		expect(next.out.ops.filter((op) => op.op === 'createEntity')).toEqual([])
		expect(next.world.charges).toHaveLength(1)
		expect(next.world.charges[0]).toMatchObject({
			id: row!.id,
			payload: { count: 4, lastDay: days[3], state: 'kept', stateOn: '2026-03-20' },
		})
		expect(idsOf(next.world, 'n')).toEqual([row!.id, row!.id, row!.id, row!.id])

		// a row no series takes: deleted with no owner fields, kept as it is when the owner cancelled it
		const orphan = (id: string, fields: Partial<RecurringPayload> = {}) =>
			entity<RecurringPayload>(FINANCE.recurring, id, { ...row!.payload, merchantId: 'm-gone', ...fields })
		const gone = orphan('r-gone')
		const cancelled = orphan('r-cancelled', { state: 'cancelled', stateOn: '2026-01-01' })
		const swept = pass({ rows: next.world.rows, charges: [...next.world.charges, gone, cancelled] })
		expect(swept.out.ops).toEqual([{ op: 'delete', uri: toUri(FINANCE.recurring, 'r-gone') }])
		expect(swept.out.charges.map((charge) => charge.id)).toEqual([row!.id, 'r-cancelled'].sort())
		expect(swept.world.charges.find((entry) => entry.id === 'r-cancelled')).toEqual(cancelled)

		// a merchant merge: the series keeps the row its charges name most
		const merged = [
			...rows('a', days.slice(0, 3), -1549, { recurringId: 'r-b' }),
			...rows('b', monthly('2026-04-15', 2), -1549, { recurringId: 'r-a' }),
		]
		const before = [orphan('r-a', { merchantId: 'm-old' }), orphan('r-b')]
		const after = pass({ rows: merged, charges: before })
		expect(after.out.charges.map((charge) => charge.id)).toEqual(['r-b'])
		expect(after.out.ops.at(-1)).toEqual({ op: 'delete', uri: toUri(FINANCE.recurring, 'r-a') })
		expect(new Set([...idsOf(after.world, 'a'), ...idsOf(after.world, 'b')])).toEqual(new Set(['r-b']))
	})

	it('price rises', () => {
		const days = monthly('2026-01-15', 4)
		const cases: {
			name: string
			amounts: number[]
			next: number
			owner?: Partial<RecurringPayload>
			rises: boolean
		}[] = [
			{ name: 'a dearer charge', amounts: [-1549, -1549, -1549], next: -1799, rises: true },
			{ name: 'a cheaper charge', amounts: [-1549, -1549, -1549], next: -1299, rises: false },
			{ name: 'a variable series', amounts: [-5000, -6200, -5400], next: -6000, rises: false },
			{
				name: 'a cancelled row',
				amounts: [-1549, -1549, -1549],
				next: -1799,
				owner: { state: 'cancelled', stateOn: '2026-03-20' },
				rises: false,
			},
			{
				name: 'a dismissed row',
				amounts: [-1549, -1549, -1549],
				next: -1799,
				owner: { state: 'dismissed', stateOn: '2026-03-20' },
				rises: false,
			},
		]
		for (const entry of cases) {
			const first = pass(fresh(rows('n', days.slice(0, 3), entry.amounts)))
			expect(first.out.rises, entry.name).toEqual([])
			const [row] = first.world.charges
			const world = entry.owner
				? applyOps(first.world, [{ op: 'updateEntity', id: row!.id, payload: { ...row!.payload, ...entry.owner } }])
				: first.world
			const second = pass({ ...world, rows: [...world.rows, tx('n-03', days[3]!, entry.next)] })
			expect(second.out.rises, entry.name).toEqual(entry.rises ? [{ id: row!.id, day: days[3] }] : [])
			// and a pass over that result says nothing again
			expect(pass(second.world).out.rises, entry.name).toEqual([])
		}
		// a newly found series with a rise in its history never signals
		const created = pass(fresh(rows('h', days, [-1549, -1549, -1549, -1799])))
		expect(created.out.charges[0]!.priceChanges).toHaveLength(1)
		expect(created.out.rises).toEqual([])
	})

	it('derived helpers', () => {
		const base: RecurringCharge = {
			id: 'a',
			merchantId: 'm-netflix',
			currency: 'USD',
			cadence: 'monthly',
			expected: usd(-1549),
			firstDay: '2026-08-10',
			lastDay: '2026-10-10',
			lastAmount: usd(-1549),
			nextDay: '2026-11-10',
			accountId: 'card',
			categoryId: 'cat-subscriptions',
			count: 3,
			priceChanges: [],
		}
		const at = (fields: Partial<RecurringCharge>): RecurringCharge => ({ ...base, ...fields })
		const TODAY = '2026-11-15'

		const statuses: [Partial<RecurringCharge>, string, string][] = [
			[{}, '2026-11-20', 'active'],
			[{}, '2026-11-21', 'lapsed'],
			[{ state: 'cancelled', stateOn: '2026-11-01' }, TODAY, 'cancelled'],
			[{ state: 'dismissed', stateOn: '2026-11-01' }, TODAY, 'dismissed'],
			[{ state: 'kept', stateOn: '2026-11-01' }, TODAY, 'active'],
		]
		for (const [fields, today, status] of statuses) expect(statusOf(at(fields), today)).toBe(status)

		const cancels: [Partial<RecurringCharge>, boolean][] = [
			[{ state: 'cancelled', stateOn: '2026-10-01' }, true],
			[{ state: 'cancelled', stateOn: '2026-10-10' }, false],
			[{ state: 'kept', stateOn: '2026-10-01' }, false],
		]
		for (const [fields, after] of cancels) expect(chargedAfterCancel(at(fields))).toBe(after)

		const costs: [Partial<RecurringCharge>, number][] = [
			[{ cadence: 'weekly', expected: usd(-1000) }, 4333],
			[{ cadence: 'biweekly', expected: usd(-1000) }, 2167],
			[{ cadence: 'monthly', expected: usd(-1549) }, 1549],
			[{ cadence: 'quarterly', expected: usd(-3000) }, 1000],
			[{ cadence: 'yearly', expected: usd(-1206) }, 101],
			[{ cadence: 'yearly', expected: usd(-1194) }, 100],
		]
		for (const [fields, minor] of costs) expect(monthlyCostOf(at(fields))).toEqual(usd(minor))

		const charges = [
			at({ id: 'a' }),
			at({ id: 'b', cadence: 'yearly', expected: usd(-12000), nextDay: '2027-05-01' }),
			at({ id: 'c', nextDay: '2026-10-01' }),
			at({ id: 'd', state: 'cancelled', stateOn: '2026-11-01' }),
			at({ id: 'e', state: 'dismissed', stateOn: '2026-11-01' }),
			at({ id: 'f', currency: 'JPY', expected: jpy(-1500) }),
			at({ id: 'g', currency: 'JPY', expected: jpy(-3000), merchantId: 'm-other' }),
		]
		expect(recurringTotals(charges, 'USD', TODAY)).toEqual({ monthly: usd(2549), count: 4, left: [jpy(4500)] })

		const overlaps = [
			at({ id: 'a' }),
			at({ id: 'b', accountId: 'card2', expected: usd(-1599) }),
			at({ id: 'c', cadence: 'yearly', nextDay: '2027-05-01' }),
			at({ id: 'd', nextDay: '2026-10-01' }),
			at({ id: 'e', merchantId: 'm-other' }),
		]
		expect(overlapsOf(overlaps, TODAY)).toEqual([['a', 'b']])
		expect(overlapsOf([overlaps[0]!, overlaps[2]!, overlaps[3]!], TODAY)).toEqual([])

		const categories: Category[] = DEFAULT_CATEGORIES.map((entry) => ({
			...entry,
			id: `cat-${entry.key}`,
			name: entry.key,
		}))
		const offers: [Partial<RecurringCharge>, boolean][] = [
			[{}, true],
			[{ cadence: 'weekly', nextDay: '2026-11-17' }, false],
			[{ categoryId: 'cat-groceries' }, false],
			[{ billOffer: 'declined' }, false],
			[{ billId: 'bill-1' }, false],
			[{ nextDay: '2026-10-01' }, false],
		]
		for (const [fields, offered] of offers) expect(offersBill(at(fields), categories, TODAY)).toBe(offered)

		const merchants: Merchant[] = [{ id: 'm-netflix', name: 'Netflix', key: 'netflix', rawNames: ['Netflix'] }]
		expect(recurringBillDraft(at({}), merchants)).toEqual({
			recurringId: 'a',
			merchantId: 'm-netflix',
			payee: 'Netflix',
			cadence: 'monthly',
			amount: usd(1549),
			nextDay: '2026-11-10',
			accountId: 'card',
			categoryId: 'cat-subscriptions',
		})
		expect(recurringBillDraft(at({ merchantId: 'm-venmo', counterparty: 'alice' }), merchants).payee).toBe('alice')
	})

	it('owner answers', () => {
		const first = pass(fresh(rows('n', monthly('2026-01-15', 3), -1549)))
		const row = first.world.charges[0]!
		const charge: RecurringCharge = { ...row.payload, id: row.id }
		const TODAY = '2026-04-01'

		const cancelled = recurringStateOps(charge, 'cancelled', TODAY)!
		expect(cancelled.ops).toEqual([
			{ op: 'updateEntity', id: row.id, payload: { ...row.payload, state: 'cancelled', stateOn: TODAY } },
		])
		expect(cancelled.inverse).toEqual([{ op: 'updateEntity', id: row.id, payload: row.payload }])
		expect(recurringStateOps(cancelled.charge, 'cancelled', '2026-05-01')).toBeUndefined()
		expect(recurringStateOps(charge, undefined, TODAY)).toBeUndefined()
		const cleared = recurringStateOps(cancelled.charge, undefined, TODAY)!
		expect(cleared.ops).toEqual([{ op: 'updateEntity', id: row.id, payload: row.payload }])

		const declined = billOfferOps(charge, true)!
		expect(declined.ops).toEqual([
			{ op: 'updateEntity', id: row.id, payload: { ...row.payload, billOffer: 'declined' } },
		])
		expect(declined.inverse).toEqual([{ op: 'updateEntity', id: row.id, payload: row.payload }])
		expect(billOfferOps(declined.charge, true)).toBeUndefined()
		expect(billOfferOps(charge, false)).toBeUndefined()

		const linked = linkBillOps(charge, 'bill-1')!
		expect(linked.ops).toEqual([{ op: 'updateEntity', id: row.id, payload: { ...row.payload, billId: 'bill-1' } }])
		expect(linked.inverse).toEqual([{ op: 'updateEntity', id: row.id, payload: row.payload }])
		expect(linkBillOps(linked.charge, 'bill-1')).toBeUndefined()
		expect(linkBillOps(charge, undefined)).toBeUndefined()

		// a later pass keeps all of it
		let answered = cancelled.charge
		for (const make of [(c: RecurringCharge) => billOfferOps(c, true), (c: RecurringCharge) => linkBillOps(c, 'b')]) {
			answered = make(answered)!.charge
		}
		const { id: _id, ...payload } = answered
		const world = applyOps(first.world, [{ op: 'updateEntity', id: row.id, payload }])
		const later = pass({ ...world, rows: [...world.rows, tx('n-03', '2026-04-15', -1549)] })
		expect(later.world.charges[0]!.payload).toMatchObject({
			state: 'cancelled',
			stateOn: TODAY,
			billOffer: 'declined',
			billId: 'b',
			count: 4,
		})
		expect(chargedAfterCancel({ ...later.world.charges[0]!.payload })).toBe(true)
	})

	it('runs after the classification pass on the engine', () => {
		const engine = createEngine(memory())
		const newId = createIdGenerator()
		const days = monthly('2026-07-03', 4)
		engine.applyBatch(
			days.map((day) => ({
				op: 'createEntity' as const,
				input: {
					id: newId(),
					type: FINANCE.transaction,
					payload: {
						accountId: 'card',
						amount: usd(-1549),
						day,
						name: 'NETFLIX.COM',
						merchantName: 'Netflix',
						pending: false,
					} satisfies TransactionPayload,
				},
			}))
		)
		expect(pipeline(engine, newId).length).toBeGreaterThan(0)
		const charges = engine.queryEntities<RecurringPayload>({ type: FINANCE.recurring })
		expect(charges).toHaveLength(1)
		expect(charges[0]!.payload).toMatchObject({ cadence: 'monthly', count: 4, lastDay: days[3] })
		const txs = engine.queryEntities<TransactionPayload>({ type: FINANCE.transaction })
		expect(txs.map((row) => row.payload.recurringId)).toEqual(txs.map(() => charges[0]!.id))
		expect(pipeline(engine, newId)).toEqual([])
	})
})

function memory(): EngineStorage {
	const map = new Map<string, string>()
	return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => void map.set(key, value) }
}

/** The store's `#classify` over the engine: the classification pass, then the recurring pass on its result in memory. */
function pipeline(engine: ReturnType<typeof createEngine>, newId: () => string): BatchOp[] {
	const transactions = engine.queryEntities<TransactionPayload>({ type: FINANCE.transaction })
	const out = classifyPass({
		transactions,
		categories: engine.queryEntities<CategoryPayload>({ type: FINANCE.category, includeDeleted: true }),
		rules: engine.queryEntities<RulePayload>({ type: FINANCE.rule }),
		merchants: engine.queryEntities<MerchantPayload>({ type: FINANCE.merchant }),
		accounts: [],
		name: (key) => key,
		newId,
	})
	for (const ops of chunked(out.ops)) engine.applyBatch(ops)
	const found = recurringOps({
		rows: withUpdates(transactions, out.ops),
		charges: engine.queryEntities<RecurringPayload>({ type: FINANCE.recurring }),
		newId,
	})
	for (const ops of chunked(found.ops)) engine.applyBatch(ops)
	return [...out.ops, ...found.ops]
}
