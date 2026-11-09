import { describe, expect, it } from 'vitest'
import type { BatchOp, Entity } from '../../data/index.js'
import {
	budgetIncome,
	budgetMonth,
	draftBudget,
	draftOps,
	lineOps,
	linesOf,
	toPlanOf,
	type BudgetEdit,
	type BudgetIncome,
	type DraftLine,
} from './budget.js'
import { buildLedger } from './ledger.js'
import {
	FINANCE,
	WHOLE,
	type Account,
	type Bill,
	type Budget,
	type BudgetPayload,
	type Category,
	type IncomeSource,
	type RecurringCharge,
	type TransactionPayload,
} from './types.js'

const usd = (minor: number) => ({ minor, currency: 'USD' })
const jpy = (minor: number) => ({ minor, currency: 'JPY' })

const ACCOUNTS: Account[] = [
	{ id: 'chk', name: 'Checking', kind: 'checking', currency: 'USD', share: WHOLE },
	{ id: 'card', name: 'Card', kind: 'credit-card', currency: 'USD', share: WHOLE },
]
const CATEGORIES: Category[] = [
	{ id: 'rent', name: 'Rent', group: 'fixed', essential: true },
	{ id: 'utilities', name: 'Utilities', group: 'fixed', essential: true },
	{ id: 'water', name: 'Water', group: 'fixed', essential: false },
	{ id: 'insurance', name: 'Insurance', group: 'fixed', essential: false },
	{ id: 'subscriptions', name: 'Subscriptions', group: 'fixed', essential: false },
	{ id: 'phone', name: 'Phone', group: 'fixed', essential: false },
	{ id: 'groceries', name: 'Groceries', group: 'variable', essential: true },
	{ id: 'dining', name: 'Dining', group: 'variable', essential: false },
	{ id: 'salary', name: 'Salary', group: 'income', essential: false },
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

const ledgerOf = (rows: Entity<TransactionPayload>[]) =>
	buildLedger({ transactions: rows, accounts: ACCOUNTS, categories: CATEGORIES, merchants: [], home: 'USD' })

let ids = 0
const newId = () => `new-${++ids}`

const row = (
	id: string,
	month: string,
	categoryId: string,
	minor: number,
	extra: Partial<BudgetPayload> = {}
): Budget => ({
	id,
	month,
	categoryId,
	amount: usd(minor),
	by: 'owner',
	...extra,
})

/** The rows as a batch leaves them: creates, updates and deletes, in order. */
function applied(rows: readonly Budget[], ops: readonly BatchOp[]): Budget[] {
	let out = [...rows]
	for (const op of ops) {
		if (op.op === 'createEntity') out.push({ ...(op.input.payload as BudgetPayload), id: op.input.id! })
		else if (op.op === 'updateEntity')
			out = out.map((entry) => (entry.id === op.id ? { ...(op.payload as BudgetPayload), id: op.id } : entry))
		else if (op.op === 'delete') out = out.filter((entry) => `eden://${FINANCE.budget}/${entry.id}` !== op.uri)
		else throw new Error(`unexpected op ${op.op}`)
	}
	return out
}
const byId = (rows: Budget[]) => [...rows].sort((a, b) => (a.id < b.id ? -1 : 1))
/** The edit's inverse puts the rows back exactly. */
function expectInverse(rows: Budget[], edit: BudgetEdit) {
	expect(byId(applied(applied(rows, edit.ops), edit.inverse))).toEqual(byId(rows))
}

describe('budget', () => {
	it('lines carry forward and off removes', () => {
		const rows = [
			row('r1', '2026-09', 'rent', 1000),
			row('r2', '2026-11', 'rent', 1200),
			row('d1', '2026-09', 'dining', 900),
			row('d2', '2026-11', 'dining', 900, { off: true }),
			row('g1', '2026-12', 'groceries', 500),
		]
		const at = (month: string) =>
			linesOf(rows, month)
				.map((line) => `${line.categoryId}:${line.amount.minor}`)
				.sort()
		expect(at('2026-08')).toEqual([])
		expect(at('2026-09')).toEqual(['dining:900', 'rent:1000'])
		expect(at('2026-10')).toEqual(['dining:900', 'rent:1000'])
		expect(at('2026-11')).toEqual(['rent:1200'])
		expect(at('2027-02')).toEqual(['groceries:500', 'rent:1200'])
	})

	it('rollover chain', () => {
		const ledger = ledgerOf([
			tx('d7', '2026-07-10', -8000, { categoryId: 'dining' }),
			tx('d8', '2026-08-10', -15000, { categoryId: 'dining' }),
			tx('d9', '2026-09-10', -5000, { categoryId: 'dining' }),
			tx('d10', '2026-10-10', -1000, { categoryId: 'dining' }),
			tx('d11', '2026-11-10', -4000, { categoryId: 'dining' }),
			tx('g7', '2026-07-10', -1000, { categoryId: 'groceries' }),
		])
		const rows = [
			row('d-jul', '2026-07', 'dining', 10000, { rollover: true }),
			row('d-oct', '2026-10', 'dining', 10000),
			row('d-nov', '2026-11', 'dining', 10000, { rollover: true }),
			row('g-jul', '2026-07', 'groceries', 5000, { rollover: true }),
			row('g-sep', '2026-09', 'groceries', 5000, { off: true }),
			row('g-oct', '2026-10', 'groceries', 5000, { rollover: true }),
		]
		const line = (month: string, categoryId: string) =>
			budgetMonth({ rows, ledger, categories: CATEGORIES, month }).lines.find(
				(entry) => entry.categoryId === categoryId
			)
		// Jul carries 2000 out, Aug overspends to −3000
		expect(line('2026-08', 'dining')).toMatchObject({ carried: usd(2000), available: usd(12000), spent: usd(15000) })
		expect(line('2026-09', 'dining')).toMatchObject({
			carried: usd(-3000),
			available: usd(7000),
			spent: usd(5000),
			left: usd(2000),
			rollover: true,
		})
		// a month without rollover carries nothing in and resets the chain
		expect(line('2026-10', 'dining')).toMatchObject({ carried: usd(0), rollover: false, left: usd(9000) })
		expect(line('2026-11', 'dining')).toMatchObject({ carried: usd(0), available: usd(10000) })
		expect(line('2026-12', 'dining')).toMatchObject({ carried: usd(6000), available: usd(16000) })
		// an off month has no line and resets the carry
		expect(line('2026-08', 'groceries')).toMatchObject({ carried: usd(4000) })
		expect(line('2026-09', 'groceries')).toBeUndefined()
		expect(line('2026-10', 'groceries')).toMatchObject({ carried: usd(0) })
	})

	it('month totals and unbudgeted', () => {
		const ledger = ledgerOf([
			tx('rent', '2026-09-01', -210000, { categoryId: 'rent' }),
			// a net refund: negative spent
			tx('back', '2026-09-03', 2000, { categoryId: 'groceries', kind: 'refund' }),
			tx('loose', '2026-09-05', -4500),
			tx('phone', '2026-09-06', -3000, { categoryId: 'phone' }),
			tx('pay', '2026-09-15', 500000, { categoryId: 'salary', kind: 'income' }),
			tx('other-month', '2026-08-06', -9999, { categoryId: 'phone' }),
		])
		const rows = [row('r', '2026-09', 'rent', 200000), row('g', '2026-09', 'groceries', 50000)]
		const month = budgetMonth({ rows, ledger, categories: CATEGORIES, month: '2026-09' })
		const rent = month.lines.find((line) => line.categoryId === 'rent')!
		expect(rent).toMatchObject({ spent: usd(210000), left: usd(-10000), over: usd(10000), group: 'fixed' })
		const groceries = month.lines.find((line) => line.categoryId === 'groceries')!
		expect(groceries).toMatchObject({ spent: usd(-2000), left: usd(52000), group: 'variable' })
		expect(groceries.over).toBeUndefined()
		expect(month).toMatchObject({
			planned: usd(250000),
			spent: usd(208000),
			left: usd(42000),
			unbudgeted: usd(7500),
			hasOther: false,
		})
		expect(month.groups.fixed.map((line) => line.categoryId)).toEqual(['rent'])
		expect(month.groups.sinking).toEqual([])

		const withYen = ledgerOf([tx('yen', '2026-09-02', -900, { categoryId: 'rent', amount: jpy(-900) })])
		const other = budgetMonth({ rows, ledger: withYen, categories: CATEGORIES, month: '2026-09' })
		expect(other).toMatchObject({ spent: usd(0), unbudgeted: usd(0), hasOther: true })
	})

	it('sinking fund', () => {
		const ledger = ledgerOf([tx('premium', '2026-06-10', -60000, { categoryId: 'insurance' })])
		const sinking = { target: usd(60000), by: '2026-06', every: 6 }
		const rows = [row('i', '2026-01', 'insurance', 10000, { rollover: true, sinking })]
		const at = (month: string, given = rows) =>
			budgetMonth({ rows: given, ledger, categories: CATEGORIES, month }).lines[0]!
		// paid in June, which empties the fund: by moves on to December; Jul and Aug put 10000 each back in
		expect(at('2026-09')).toMatchObject({
			group: 'sinking',
			carried: usd(20000),
			sinking: { target: usd(60000), by: '2026-12', saved: usd(30000), monthly: usd(10000) },
		})
		// ceil: 20000 still needed over April to June
		const odd = [
			row('i', '2026-01', 'insurance', 10000, { rollover: true, sinking: { target: usd(50000), by: '2026-06' } }),
		]
		expect(at('2026-04', odd).sinking).toMatchObject({ by: '2026-06', monthly: usd(6667) })
		// without every, by stays put
		const still = [
			row('i', '2026-01', 'insurance', 10000, { rollover: true, sinking: { ...sinking, every: undefined } }),
		]
		expect(at('2026-09', still).sinking?.by).toBe('2026-06')
		// nothing still needed: no monthly figure
		const full = [
			row('i', '2026-01', 'insurance', 10000, { rollover: true, sinking: { target: usd(30000), by: '2026-05' } }),
		]
		expect(at('2026-05', full).sinking).toMatchObject({ saved: usd(50000) })
		expect(at('2026-05', full).sinking?.monthly).toBeUndefined()
	})

	it('budget income', () => {
		const source = (id: string, cadence: IncomeSource['cadence'], extra: Partial<IncomeSource> = {}): IncomeSource => ({
			id,
			kind: 'income',
			name: id,
			accountId: 'chk',
			cadence,
			expected: usd(100000),
			firstDay: '2026-01-01',
			lastDay: '2026-10-15',
			...extra,
		})
		const income = { monthly: usd(400000), average: { average: usd(350000), months: 3 } }
		const regular = [
			source('a', 'semimonthly'),
			source('b', 'monthly'),
			source('old', 'irregular', { endedOn: '2026-01-01' }),
		]
		expect(budgetIncome({ sources: regular, income, home: 'USD' })).toEqual({ amount: usd(400000), basis: 'paychecks' })
		const irregular = [source('a', 'semimonthly'), source('gig', 'irregular')]
		const average: BudgetIncome = { amount: usd(350000), basis: 'average', months: 3 }
		expect(budgetIncome({ sources: irregular, income, home: 'USD' })).toEqual(average)
		expect(budgetIncome({ sources: [], income, home: 'USD' })).toEqual(average)
		expect(budgetIncome({ sources: irregular, income: { monthly: usd(0) }, home: 'USD' })).toBeUndefined()
		expect(toPlanOf(average, usd(380000))).toEqual(usd(-30000))
		expect(toPlanOf({ amount: usd(400000), basis: 'paychecks' }, usd(380000))).toEqual(usd(20000))
		expect(toPlanOf(undefined, usd(380000))).toBeUndefined()
	})

	describe('draft', () => {
		const HISTORY = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']
		const ROWS = [
			...HISTORY.flatMap((month) => [
				tx(`rent-${month}`, `${month}-01`, -200000, { categoryId: 'rent' }),
				tx(`phone-${month}`, `${month}-04`, -4550, { categoryId: 'phone' }),
				tx(`food-${month}`, `${month}-10`, -60000, { categoryId: 'groceries' }),
				tx(`cafe-${month}`, `${month}-12`, -9000, { categoryId: 'dining' }),
			]),
			tx('food-extra', '2026-07-20', -12345, { categoryId: 'groceries' }),
			tx('food-now', '2026-11-02', -100000, { categoryId: 'groceries' }),
			tx('util-8', '2026-08-20', -9000, { categoryId: 'utilities' }),
			tx('util-9', '2026-09-20', -10000, { categoryId: 'utilities' }),
			tx('util-10', '2026-10-20', -11500, { categoryId: 'utilities' }),
			tx('water-9', '2026-09-25', -6001, { categoryId: 'water' }),
			tx('ins-6', '2026-06-15', -60000, { categoryId: 'insurance' }),
			// this month's, so out of the history
			tx('card-pay', '2026-11-03', -500000, { categoryId: 'dining' }),
			tx('loose-pay', '2026-10-26', -7000),
			tx('pay', '2026-10-15', 500000, { categoryId: 'salary', kind: 'income' }),
		]
		const ledger = ledgerOf(ROWS)
		const paid = (transactionId: string, minor: number, day: string) => ({ transactionId, amount: usd(minor), day })
		const bill = (id: string, fields: Partial<Bill>): Bill => ({
			id,
			payee: id,
			period: '2026-10',
			amount: usd(1000),
			source: 'repeating',
			...fields,
		})
		const BILLS: Bill[] = [
			bill('rent', {
				amount: usd(200000),
				fixed: true,
				repeat: { months: 1 },
				payments: [paid('rent-2026-10', 200000, '2026-10-01')],
			}),
			// an estimated monthly bill: the mean of the last three actual amounts
			bill('util-8', {
				period: '2026-08',
				amount: usd(9000),
				repeat: { months: 1 },
				payments: [paid('util-8', 9000, '2026-08-20')],
			}),
			bill('util-9', {
				period: '2026-09',
				seriesId: 'util-8',
				amount: usd(10000),
				repeat: { months: 1 },
				payments: [paid('util-9', 10000, '2026-09-20')],
			}),
			bill('util-10', {
				period: '2026-10',
				seriesId: 'util-8',
				amount: usd(11500),
				repeat: { months: 1 },
				payments: [paid('util-10', 11500, '2026-10-20')],
			}),
			bill('util-11', {
				period: '2026-11',
				seriesId: 'util-8',
				amount: usd(10000),
				estimate: true,
				repeat: { months: 1 },
			}),
			bill('water', {
				period: '2026-09',
				amount: usd(6001),
				fixed: true,
				repeat: { months: 2 },
				payments: [paid('water-9', 6001, '2026-09-25')],
			}),
			bill('ins-6', {
				period: '2026-06',
				due: '2026-06-15',
				amount: usd(60000),
				fixed: true,
				repeat: { months: 6 },
				payments: [paid('ins-6', 60000, '2026-06-15')],
			}),
			bill('ins-12', {
				period: '2026-12',
				due: '2026-12-15',
				seriesId: 'ins-6',
				amount: usd(60000),
				fixed: true,
				repeat: { months: 6 },
			}),
			// a card statement: its spending counts at the charge
			bill('card', {
				amount: usd(500000),
				fixed: true,
				repeat: { months: 1 },
				accountId: 'card',
				payments: [paid('card-pay', 500000, '2026-11-03')],
			}),
			// no categorised payment: left out
			bill('loose', {
				amount: usd(7000),
				fixed: true,
				repeat: { months: 1 },
				payments: [paid('loose-pay', 7000, '2026-10-26')],
			}),
			bill('never-paid', { amount: usd(8000), fixed: true, repeat: { months: 1 } }),
			// another currency: left out
			bill('yen', {
				amount: jpy(5000),
				fixed: true,
				repeat: { months: 1 },
				payments: [paid('rent-2026-09', 5000, '2026-09-01')],
			}),
		]
		const charge = (
			id: string,
			categoryId: string,
			minor: number,
			extra: Partial<RecurringCharge> = {}
		): RecurringCharge => ({
			id,
			merchantId: `m-${id}`,
			currency: 'USD',
			cadence: 'monthly',
			expected: usd(-minor),
			firstDay: '2026-06-10',
			lastDay: '2026-10-10',
			lastAmount: usd(-minor),
			nextDay: '2026-11-10',
			accountId: 'card',
			categoryId,
			count: 5,
			priceChanges: [],
			...extra,
		})
		const RECURRING = [
			charge('stream', 'subscriptions', 1549),
			charge('billed', 'subscriptions', 999, { billId: 'rent' }),
			charge('lapsed', 'subscriptions', 2000, { nextDay: '2026-06-10' }),
			charge('cancelled', 'subscriptions', 3000, { state: 'cancelled', stateOn: '2026-10-11' }),
			charge('kit', 'dining', 12000),
			charge('top-up', 'groceries', 1000),
			charge('paycheck', 'salary', 5000),
		]
		const draft = (month: string, lean = false) =>
			Object.fromEntries(
				draftBudget({
					ledger,
					categories: CATEGORIES,
					bills: BILLS,
					recurring: RECURRING,
					month,
					today: '2026-11-05',
					lean,
				}).map((line) => [line.categoryId, line])
			)
		const lines = draft('2026-11')

		const cases: [string, string, Partial<DraftLine> | undefined][] = [
			['a monthly fixed bill gives its amount', 'rent', { amount: usd(200000) }],
			['a monthly estimated bill gives estimateOf', 'utilities', { amount: usd(10167) }],
			['a 2-month bill gives half, rounded up', 'water', { amount: usd(3001) }],
			[
				'a 6-month bill gives a sixth and a sinking fund',
				'insurance',
				{ amount: usd(10000), rollover: true, sinking: { target: usd(60000), by: '2026-12', every: 6 } },
			],
			[
				'an active charge gives monthlyCostOf; billed, lapsed and cancelled ones are left out',
				'subscriptions',
				{ amount: usd(1549) },
			],
			['a fixed category with no source gets its history, rounded up', 'phone', { amount: usd(4600) }],
			['a variable category takes its sources over a smaller history', 'dining', { amount: usd(12000) }],
			['a variable category takes its history over smaller sources, rounded up', 'groceries', { amount: usd(62100) }],
			['an income category never gets a line', 'salary', undefined],
		]
		for (const [name, categoryId, expected] of cases)
			it(name, () => {
				if (!expected) expect(lines[categoryId]).toBeUndefined()
				else expect(lines[categoryId]).toEqual({ categoryId, ...expected })
			})

		it('leaves out card statements and bills with no categorised payment', () => {
			// dining would be 500000 with the card statement
			expect(lines.dining?.amount).toEqual(usd(12000))
			expect(Object.keys(lines).sort()).toEqual(
				['dining', 'groceries', 'insurance', 'phone', 'rent', 'subscriptions', 'utilities', 'water'].sort()
			)
		})

		it('dates a settled sinking candidate a cycle on', () => {
			const settledBills = BILLS.map((entry) =>
				entry.id === 'ins-12' ? { ...entry, payments: [paid('ins-6', 60000, '2026-12-01')] } : entry
			)
			const [insurance] = draftBudget({
				ledger,
				categories: CATEGORIES.filter((category) => category.id === 'insurance'),
				bills: settledBills,
				recurring: [],
				month: '2026-11',
				today: '2026-11-05',
				lean: false,
			})
			expect(insurance?.sinking).toEqual({ target: usd(60000), by: '2027-06', every: 6 })
		})

		it('lean draft keeps essentials', () => {
			const lean = draft('2026-12', true)
			expect(Object.keys(lean).sort()).toEqual(['groceries', 'rent', 'utilities'])
			// essentialLines: May to Oct, before today's month
			expect(lean.groceries?.amount).toEqual(usd(62100))
			// the typical month for December reads June to November instead
			expect(draft('2026-12').groceries?.amount).toEqual(usd(68800))
		})
	})

	it('draft ops', () => {
		const rows = [
			row('owner-rent', '2026-11', 'rent', 190000, { by: 'owner' }),
			row('draft-food', '2026-11', 'groceries', 50000, { by: 'draft' }),
			row('oct-phone', '2026-10', 'phone', 4000, { by: 'draft' }),
			row('untouched', '2026-11', 'dining', 9000, { by: 'draft' }),
		]
		const drafted: DraftLine[] = [
			{ categoryId: 'rent', amount: usd(200000) },
			{ categoryId: 'groceries', amount: usd(62100) },
			{ categoryId: 'phone', amount: usd(4600) },
			{
				categoryId: 'insurance',
				amount: usd(10000),
				rollover: true,
				sinking: { target: usd(60000), by: '2026-12', every: 6 },
			},
		]
		ids = 0
		const edit = draftOps(rows, '2026-11', drafted, newId)
		const after = applied(rows, edit.ops)
		// the owner's row is kept, the draft's own is updated, the missing ones are made, the rest left alone
		expect(after.find((entry) => entry.id === 'owner-rent')?.amount).toEqual(usd(190000))
		expect(after.find((entry) => entry.id === 'draft-food')).toEqual(
			row('draft-food', '2026-11', 'groceries', 62100, { by: 'draft' })
		)
		expect(after.find((entry) => entry.id === 'oct-phone')?.amount).toEqual(usd(4000))
		expect(after.find((entry) => entry.id === 'untouched')?.amount).toEqual(usd(9000))
		expect(after.filter((entry) => entry.id.startsWith('new-'))).toEqual([
			row('new-1', '2026-11', 'phone', 4600, { by: 'draft' }),
			row('new-2', '2026-11', 'insurance', 10000, {
				by: 'draft',
				rollover: true,
				sinking: { target: usd(60000), by: '2026-12', every: 6 },
			}),
		])
		expect(edit.saved.map((entry) => entry.id)).toEqual(['draft-food', 'new-1', 'new-2'])
		expectInverse(rows, edit)
		// an empty draft writes nothing
		expect(draftOps(rows, '2026-11', [], newId)).toEqual({ ops: [], inverse: [], saved: [] })
	})

	it('line ops', () => {
		const rows = [
			row('rent', '2026-09', 'rent', 200000),
			row('ins', '2026-09', 'insurance', 10000, {
				rollover: true,
				sinking: { target: usd(60000), by: '2026-12', every: 6 },
				by: 'draft',
			}),
		]
		const save = (change: Partial<Extract<Parameters<typeof lineOps>[2], { kind: 'save' }>>) =>
			lineOps(
				rows,
				'2026-11',
				{ kind: 'save', categoryId: 'rent', amount: usd(1000), rollover: false, ...change },
				newId
			)

		expect(save({ amount: usd(0) })).toEqual({ error: 'budget:amount' })
		expect(save({ amount: undefined })).toEqual({ error: 'budget:amount' })
		expect(save({ categoryId: undefined })).toEqual({ error: 'budget:category' })
		expect(save({ sinking: { target: usd(0), by: '2027-01' } })).toEqual({ error: 'budget:target' })

		ids = 0
		// a new month's row for a line carried from September
		const edited = save({ amount: usd(210000) }) as BudgetEdit
		expect(edited.saved).toEqual([row('new-1', '2026-11', 'rent', 210000)])
		expectInverse(rows, edited)

		// a sinking line forces rollover, and keeps every while the target is unchanged
		const sinking = save({
			categoryId: 'insurance',
			amount: usd(12000),
			sinking: { target: usd(60000), by: '2027-06' },
		})
		expect((sinking as BudgetEdit).saved[0]).toMatchObject({
			rollover: true,
			sinking: { target: usd(60000), by: '2027-06', every: 6 },
			by: 'owner',
		})
		const retarget = save({
			categoryId: 'insurance',
			amount: usd(12000),
			sinking: { target: usd(70000), by: '2027-06' },
		})
		expect((retarget as BudgetEdit).saved[0]?.sinking).toEqual({ target: usd(70000), by: '2027-06' })

		// an existing row for the month is updated in place
		const same = lineOps(
			rows,
			'2026-09',
			{ kind: 'save', categoryId: 'rent', amount: usd(205000), rollover: true },
			newId
		) as BudgetEdit
		expect(same.saved).toEqual([row('rent', '2026-09', 'rent', 205000, { rollover: true })])
		expectInverse(rows, same)

		// remove writes off for the month
		const removed = lineOps(rows, '2026-11', { kind: 'remove', categoryId: 'rent' }, newId) as BudgetEdit
		const after = applied(rows, removed.ops)
		expect(linesOf(after, '2026-11').map((entry) => entry.categoryId)).toEqual(['insurance'])
		expect(
			linesOf(after, '2026-10')
				.map((entry) => entry.categoryId)
				.sort()
		).toEqual(['insurance', 'rent'])
		expect(removed.saved[0]).toMatchObject({ month: '2026-11', categoryId: 'rent', off: true, by: 'owner' })
		expectInverse(rows, removed)
		// nothing to remove
		expect(lineOps(rows, '2026-11', { kind: 'remove', categoryId: 'dining' }, newId)).toBeUndefined()
	})
})
