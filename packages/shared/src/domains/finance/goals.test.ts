import { describe, expect, it } from 'vitest'
import type { BatchOp, Entity } from '../../data/index.js'
import {
	closeGoalOps,
	coversOf,
	deleteGoalOps,
	emergencyTarget,
	essentialsOf,
	goalErrors,
	goalMonthly,
	goalPassOps,
	goalsOf,
	monthsLeft,
	moveGoalOps,
	paceOf,
	rateOps,
	rebuildOps,
	reopenGoalOps,
	saveGoalOps,
	savedOf,
	savingsRateOf,
	startFromHereOps,
	type GoalDraft,
	type GoalEdit,
	type GoalError,
} from './goals.js'
import { buildLedger } from './ledger.js'
import {
	FINANCE,
	WHOLE,
	type Account,
	type Category,
	type SavingsGoal,
	type SavingsGoalPayload,
	type TransactionPayload,
} from './types.js'

const TODAY = '2026-11-08'
const usd = (minor: number) => ({ minor, currency: 'USD' })
const jpy = (minor: number) => ({ minor, currency: 'JPY' })

const account = (id: string, kind: Account['kind'], minor: number, extra: Partial<Account> = {}): Account => ({
	id,
	name: id,
	kind,
	currency: 'USD',
	share: WHOLE,
	balance: usd(minor),
	...extra,
})
const SAV = account('sav', 'savings', 1200000)
const ACCOUNTS: Account[] = [
	account('chk', 'checking', 500000),
	SAV,
	account('card', 'credit-card', 100000),
	account('old', 'savings', 900000, { closedOn: '2026-01-01' }),
	account('yen', 'savings', 100000, { currency: 'JPY', balance: jpy(100000) }),
]
const withBalance = (minor: number, extra: Partial<Account> = {}) =>
	ACCOUNTS.map((entry) => (entry.id === 'sav' ? { ...entry, balance: usd(minor), ...extra } : entry))

const CATEGORIES: Category[] = [
	{ id: 'rent', name: 'Rent', group: 'fixed', essential: true },
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

const ledgerOf = (rows: Entity<TransactionPayload>[], accounts: Account[] = ACCOUNTS) =>
	buildLedger({ transactions: rows, accounts, categories: CATEGORIES, merchants: [], home: 'USD' })

/** August to October: 300.00 into savings each month, 5,000.00 paid in and 1,500.00 of rent out of checking. */
const MONTHS = ['2026-08', '2026-09', '2026-10']
const HISTORY = MONTHS.flatMap((month) => [
	tx(`in-${month}`, `${month}-05`, 30000, { accountId: 'sav', kind: 'transfer' }),
	tx(`pay-${month}`, `${month}-01`, 500000, { kind: 'income', categoryId: 'salary' }),
	tx(`rent-${month}`, `${month}-03`, -150000, { categoryId: 'rent' }),
])
// this month is not complete, so it never counts
const NOW = [tx('in-now', '2026-11-02', 999900, { accountId: 'sav', kind: 'transfer' })]
const LEDGER = ledgerOf([...HISTORY, ...NOW])
const EMPTY = ledgerOf([])

const goal = (id: string, accountId: string, target: number, extra: Partial<SavingsGoalPayload> = {}): SavingsGoal => ({
	id,
	kind: 'target',
	name: id,
	accountId,
	target: usd(target),
	order: 0,
	...extra,
})
/** A goal as the sheet would hand it back, with the changes made. */
const draftOf = ({ id, kind, name, accountId, target, months, by }: SavingsGoal, change: Partial<GoalDraft> = {}) =>
	({ id, kind: kind as GoalDraft['kind'], name, accountId, target, months, by, ...change }) satisfies GoalDraft
const EF = goal('ef', 'sav', 1000000, { kind: 'emergency', name: 'Emergency fund', months: 6, order: 0 })
const CAR = goal('car', 'sav', 800000, { name: 'Car', order: 1 })

const viewOf = (goals: SavingsGoal[], accounts: Account[] = ACCOUNTS, ledger = LEDGER) =>
	goalsOf({ goals, accounts, ledger, categories: CATEGORIES, today: TODAY, home: 'USD' })
const rowOf = (goals: SavingsGoal[], id: string, accounts: Account[] = ACCOUNTS, ledger = LEDGER) =>
	viewOf(goals, accounts, ledger)
		.groups.flatMap((group) => group.rows)
		.find((row) => row.goal.id === id)!
const minorOf = (saved: Map<string, { minor: number }>) =>
	Object.fromEntries([...saved].map(([id, amount]) => [id, amount.minor]))

let ids = 0
const newId = () => `new-${++ids}`

/** The rows as a batch leaves them: creates, updates, deletes and restores, in order. */
function applied(rows: readonly SavingsGoal[], ops: readonly BatchOp[], gone = new Map<string, SavingsGoal>()) {
	let out = [...rows]
	const uri = (row: SavingsGoal) => `eden://${FINANCE.goal}/${row.id}`
	for (const op of ops) {
		if (op.op === 'createEntity') out.push({ ...(op.input.payload as SavingsGoalPayload), id: op.input.id! })
		else if (op.op === 'updateEntity')
			out = out.map((entry) => (entry.id === op.id ? { ...(op.payload as SavingsGoalPayload), id: op.id } : entry))
		else if (op.op === 'delete') {
			const row = out.find((entry) => uri(entry) === op.uri)
			if (row) gone.set(op.uri, row)
			out = out.filter((entry) => entry !== row)
		} else if (op.op === 'restore') {
			const row = gone.get(op.uri)
			if (!row) throw new Error(`nothing to restore at ${op.uri}`)
			out.push(row)
		} else throw new Error(`unexpected op ${op.op}`)
	}
	return out
}
const byId = (rows: SavingsGoal[]) => [...rows].sort((a, b) => (a.id < b.id ? -1 : 1))
/** The edit's inverse puts the rows back exactly. */
function expectInverse(rows: SavingsGoal[], edit: GoalEdit | undefined) {
	expect(edit).toBeDefined()
	const gone = new Map<string, SavingsGoal>()
	expect(byId(applied(applied(rows, edit!.ops, gone), edit!.inverse, gone))).toEqual(byId(rows))
}
const after = (rows: SavingsGoal[], edit: GoalEdit | object | undefined) => applied(rows, (edit as GoalEdit).ops)

describe('goals', () => {
	it('earmarks split one balance in order', () => {
		expect(minorOf(savedOf([EF, CAR], ACCOUNTS))).toEqual({ ef: 1000000, car: 200000 })
		const view = viewOf([EF, CAR])
		expect(view.groups).toHaveLength(1)
		expect(view.groups[0]!.notEarmarked).toBeUndefined()
		// the order decides who fills first
		expect(minorOf(savedOf([{ ...EF, order: 2 }, CAR], ACCOUNTS))).toEqual({ ef: 400000, car: 800000 })
		// what no goal holds is not earmarked
		expect(viewOf([EF, CAR], withBalance(2000000)).groups[0]!.notEarmarked).toEqual(usd(200000))
		// a withdrawal reaches the last goal first
		expect(minorOf(savedOf([EF, CAR], withBalance(1100000)))).toEqual({ ef: 1000000, car: 100000 })
	})

	it("the owner's share applies", () => {
		expect(minorOf(savedOf([EF, CAR], withBalance(1200000, { share: 5000 })))).toEqual({ ef: 600000, car: 0 })
	})

	it('a debt account is refused', () => {
		const draft: GoalDraft = { kind: 'target', name: 'Car', accountId: 'card', target: usd(800000) }
		expect(goalErrors(draft, { accounts: ACCOUNTS })).toEqual(['goal:account'])
		expect(saveGoalOps([], ACCOUNTS, draft, TODAY, newId)).toEqual({ error: 'goal:account' })
		// a goal left in one holds nothing
		expect(minorOf(savedOf([goal('g', 'card', 50000)], ACCOUNTS))).toEqual({ g: 0 })
	})

	it('monthly recalculates when the date slips', () => {
		const balance = withBalance(200000)
		expect(monthsLeft('2026-11', '2027-04')).toBe(6)
		expect(rowOf([{ ...CAR, by: '2027-04' }], 'car', balance).monthly).toEqual(usd(100000))
		expect(rowOf([{ ...CAR, by: '2027-10' }], 'car', balance).monthly).toEqual(usd(50000))
		// rounded up to a cent
		expect(rowOf([{ ...CAR, target: usd(800001), by: '2027-04' }], 'car', balance).monthly).toEqual(usd(100001))
		// this month alone asks all of it
		expect(rowOf([{ ...CAR, by: '2026-11' }], 'car', balance).monthly).toEqual(usd(600000))
	})

	it('past its date', () => {
		const past = rowOf([{ ...CAR, by: '2026-10' }], 'car', withBalance(200000))
		expect(past).toMatchObject({ past: true, reached: false, behind: false })
		expect(past.monthly).toBeUndefined()
		// a reached goal has no monthly, past or not
		const reached = rowOf([{ ...CAR, by: '2026-10' }], 'car', withBalance(900000))
		expect(reached).toMatchObject({ reached: true, past: false, left: usd(0) })
		expect(reached.monthly).toBeUndefined()
	})

	it('JPY rounds to whole yen', () => {
		const yen = goal('trip', 'yen', 0, { target: jpy(200000), by: '2027-01' })
		const row = rowOf([yen], 'trip')
		expect(row.saved).toEqual(jpy(100000))
		expect(row.monthly).toEqual(jpy(33334))
		expect(goalMonthly(jpy(100000), 3)).toEqual(jpy(33334))
		// a goal in another currency stays out of the totals
		const view = viewOf([yen, CAR])
		expect(view.totals.left).toEqual(['JPY'])
		expect(view.totals.saved).toEqual(usd(800000))
	})

	it('reach month at the recent pace', () => {
		// 300.00 a month over August to October; November's deposit is not a complete month
		expect(paceOf(LEDGER, SAV, TODAY)).toEqual(usd(30000))
		// 12,000.00 owned, 18,000.00 of targets up to the car: 6,000.00 at 300.00 is 20 months
		const car = rowOf([EF, CAR], 'car')
		expect(car).toMatchObject({ reachMonth: '2028-07', behind: false })
		// the emergency fund is reached already
		expect(rowOf([EF, CAR], 'ef').reachMonth).toBeUndefined()
		// at the owner's share
		expect(paceOf(LEDGER, { ...SAV, share: 5000 }, TODAY)).toEqual(usd(15000))
	})

	it('behind when the pace misses the date', () => {
		expect(rowOf([EF, { ...CAR, by: '2027-12' }], 'car')).toMatchObject({ reachMonth: '2028-07', behind: true })
		expect(rowOf([EF, { ...CAR, by: '2028-12' }], 'car')).toMatchObject({ reachMonth: '2028-07', behind: false })
	})

	it('no pace without growth or history', () => {
		expect(paceOf(EMPTY, SAV, TODAY)).toBeUndefined()
		expect(rowOf([EF, CAR], 'car', ACCOUNTS, EMPTY).reachMonth).toBeUndefined()
		const shrinking = ledgerOf(
			MONTHS.map((month) => tx(`out-${month}`, `${month}-05`, -20000, { accountId: 'sav', kind: 'transfer' }))
		)
		expect(paceOf(shrinking, SAV, TODAY)).toEqual(usd(-20000))
		expect(rowOf([EF, CAR], 'car', ACCOUNTS, shrinking).reachMonth).toBeUndefined()
		// a closed account's goal holds nothing and reads no pace, dip or monthly
		const closed = rowOf([goal('g', 'old', 50000, { by: '2027-01', high: { amount: usd(50000), day: TODAY } })], 'g')
		expect(closed).toMatchObject({ accountState: 'closed', saved: usd(0) })
		expect([closed.monthly, closed.reachMonth, closed.dip]).toEqual([undefined, undefined, undefined])
		expect(rowOf([goal('g', 'gone', 50000)], 'g').accountState).toBe('gone')
	})

	it('emergency target from essentials', () => {
		// rent is the one essential: 1,500.00 a month over the three complete months
		const essentials = essentialsOf({ ledger: LEDGER, categories: CATEGORIES, today: TODAY })
		expect(essentials).toEqual(usd(150000))
		expect(emergencyTarget(essentials!, 6)).toEqual(usd(900000))
		expect(viewOf([EF]).essentials).toEqual(usd(150000))
		// no essentials history, no sizing
		expect(essentialsOf({ ledger: EMPTY, categories: CATEGORIES, today: TODAY })).toBeUndefined()
		expect(viewOf([EF], ACCOUNTS, EMPTY).essentials).toBeUndefined()
	})

	it('covers months rounded down', () => {
		// 10,000.00 over 1,500.00 is 6.67 months
		expect(rowOf([EF, CAR], 'ef').covers).toBe(6.6)
		expect(coversOf(usd(299999), usd(100000))).toBe(2.9)
		expect(rowOf([EF], 'ef', ACCOUNTS, EMPTY).covers).toBeUndefined()
		// a target goal has none
		expect(rowOf([EF, CAR], 'car').covers).toBeUndefined()
	})

	it('one open emergency fund', () => {
		const second: GoalDraft = { kind: 'emergency', name: 'Another', accountId: 'chk', target: usd(1000), months: 6 }
		expect(goalErrors(second, { accounts: ACCOUNTS, goals: [EF] })).toEqual(['goal:emergency'])
		expect(saveGoalOps([EF], ACCOUNTS, second, TODAY, newId)).toEqual({ error: 'goal:emergency' })
		// editing the one there is fine
		expect(goalErrors({ ...second, id: 'ef' }, { accounts: ACCOUNTS, goals: [EF] })).toEqual([])
		// a closed one does not count, and reopening it while another is open does nothing
		const closed = { ...EF, id: 'ef-old', closedOn: '2026-01-01', closedAs: 'closed' as const }
		expect(goalErrors(second, { accounts: ACCOUNTS, goals: [closed] })).toEqual([])
		expect(reopenGoalOps([EF, closed], ACCOUNTS, 'ef-old', TODAY)).toBeUndefined()
		expect(viewOf([EF]).emergencyOpen).toBe(true)
		expect(viewOf([closed]).emergencyOpen).toBe(false)
	})

	it('savings rate over the span and per month', () => {
		const october = [tx('dining', '2026-10-12', -100000, { categoryId: 'dining' })]
		const rate = savingsRateOf(ledgerOf([...HISTORY, ...NOW, ...october]), TODAY)!
		// 15,000.00 in, 5,500.00 spent: 63.3%
		expect(rate.rate).toBe(63)
		expect(rate.income).toEqual(usd(1500000))
		expect(rate.spending).toEqual(usd(550000))
		expect(rate.months).toEqual([
			{ month: '2026-08', rate: 70 },
			{ month: '2026-09', rate: 70 },
			{ month: '2026-10', rate: 50 },
		])
		// one-off income counts
		const bonus = [tx('bonus', '2026-09-20', 500000, { kind: 'income', oneOff: true })]
		expect(savingsRateOf(ledgerOf([...HISTORY, ...bonus]), TODAY)!.months[1]).toEqual({ month: '2026-09', rate: 85 })
	})

	it('negative rate', () => {
		const splurge = [tx('splurge', '2026-10-12', -800000, { categoryId: 'dining' })]
		const rate = savingsRateOf(ledgerOf([...HISTORY, ...splurge]), TODAY)!
		expect(rate.months[2]).toEqual({ month: '2026-10', rate: -90 })
		// 15,000.00 in, 12,500.00 spent: 16.7%
		expect(rate.rate).toBe(17)
		const worse = [tx('worse', '2026-09-12', -1600000, { categoryId: 'dining' })]
		expect(savingsRateOf(ledgerOf([...HISTORY, ...splurge, ...worse]), TODAY)!.rate).toBe(-90)
	})

	it('tax refunds left out', () => {
		const refund = [
			tx('refund', '2026-09-20', 300000, { kind: 'income', name: 'IRS TREAS 310 TAX REF' }),
			tx('state', '2026-10-20', 100000, { kind: 'income', name: 'State of Somewhere' }),
		]
		const rate = savingsRateOf(ledgerOf([...HISTORY, ...refund]), TODAY, new Set(['state']))!
		expect(rate.income).toEqual(usd(1500000))
		expect(rate.rate).toBe(70)
	})

	it('no income, no rate', () => {
		const spending = ledgerOf(
			MONTHS.map((month) => tx(`rent-${month}`, `${month}-03`, -150000, { categoryId: 'rent' }))
		)
		const rate = savingsRateOf(spending, TODAY)!
		expect(rate.rate).toBeUndefined()
		expect(rate.months.map((month) => month.rate)).toEqual([undefined, undefined, undefined])
		expect(savingsRateOf(EMPTY, TODAY)).toBeUndefined()
	})

	it('pass raises the high-water mark', () => {
		const owned = { ...CAR, by: '2027-06', high: { amount: usd(100000), day: '2026-10-01' } }
		const fresh = { ...EF }
		const closed = goal('g', 'old', 50000)
		const rows = [fresh, owned, closed]
		const edit = goalPassOps(rows, ACCOUNTS, TODAY)
		expect(edit.saved).toEqual([
			{ ...EF, high: { amount: usd(1000000), day: TODAY } },
			{ ...owned, high: { amount: usd(200000), day: TODAY } },
		])
		expectInverse(rows, edit)
		// a second pass finds nothing to do, and a lower balance never lowers the mark
		const now = after(rows, edit)
		expect(goalPassOps(now, ACCOUNTS, TODAY).ops).toEqual([])
		expect(goalPassOps(now, withBalance(1000000), TODAY).ops).toEqual([])
	})

	it('a dip under 1% is not shown', () => {
		const held = { ...EF, high: { amount: usd(1000000), day: '2026-10-01' } }
		expect(rowOf([held], 'ef', withBalance(990001)).dip).toBeUndefined()
		expect(rowOf([held], 'ef', withBalance(990000)).dip).toEqual({
			amount: usd(10000),
			from: usd(1000000),
			day: '2026-10-01',
		})
		// at least one minor unit on a tiny target
		const tiny = goal('tiny', 'sav', 50, { high: { amount: usd(50), day: '2026-10-01' } })
		expect(rowOf([tiny], 'tiny', withBalance(49)).dip?.amount).toEqual(usd(1))
	})

	it('rebuild monthly', () => {
		const held = { ...EF, high: { amount: usd(1000000), day: '2026-10-01' } }
		expect(rowOf([held], 'ef', withBalance(900000)).rebuildMonthly).toBeUndefined()
		const planned = after([held], rebuildOps([held], 'ef', '2027-04'))
		expect(planned[0]!.rebuildBy).toBe('2027-04')
		// 1,000.00 over November to April
		expect(rowOf(planned, 'ef', withBalance(900000)).rebuildMonthly).toEqual(usd(16667))
		expectInverse([held], rebuildOps([held], 'ef', '2027-04'))
		expect(after(planned, rebuildOps(planned, 'ef', undefined))[0]!.rebuildBy).toBeUndefined()
	})

	it('rebuild cleared when made whole', () => {
		const planned = { ...EF, rebuildBy: '2027-04', high: { amount: usd(1000000), day: '2026-10-01' } }
		expect(goalPassOps([planned], withBalance(900000), TODAY).ops).toEqual([])
		const whole = goalPassOps([planned], withBalance(1000000), TODAY)
		expect(whole.saved).toEqual([{ ...EF, high: { amount: usd(1000000), day: '2026-10-01' } }])
		expect(rowOf(after([planned], whole), 'ef', withBalance(1000000)).dip).toBeUndefined()
	})

	it('start from here', () => {
		const planned = { ...EF, rebuildBy: '2027-04', high: { amount: usd(1000000), day: '2026-10-01' } }
		const edit = startFromHereOps([planned], withBalance(900000), 'ef', TODAY)
		expect(edit!.saved).toEqual([{ ...EF, high: { amount: usd(900000), day: TODAY } }])
		expect(rowOf(after([planned], edit), 'ef', withBalance(900000)).dip).toBeUndefined()
	})

	it('owner changes reset the high-water marks', () => {
		const high = (amount: number) => ({ high: { amount: usd(amount), day: '2026-10-01' } })
		const rows = [
			{ ...EF, ...high(1000000) },
			{ ...CAR, ...high(200000), rebuildBy: '2027-04' },
		]
		const dips = (next: SavingsGoal[]) =>
			viewOf(next)
				.groups.flatMap((group) => group.rows)
				.filter((row) => row.dip)
				.map((row) => row.goal.id)
		const check = (edit: GoalEdit | object | undefined) => {
			const next = after(rows, edit)
			expect(dips(next)).toEqual([])
			const saved = savedOf(next, ACCOUNTS)
			for (const row of next.filter((entry) => !entry.closedOn)) {
				expect(row.rebuildBy).toBeUndefined()
				expect(row.high?.amount).toEqual(saved.get(row.id))
			}
			return next
		}
		// moving the car up takes 8,000.00 from the emergency fund's earmark
		const moved = check(moveGoalOps(rows, ACCOUNTS, 'car', 'up', TODAY))
		expect(moved.find((row) => row.id === 'ef')!.high).toEqual({ amount: usd(400000), day: TODAY })
		// a larger first target leaves the car with nothing
		check(saveGoalOps(rows, ACCOUNTS, draftOf(EF, { target: usd(1200000) }), TODAY, newId))
		// closing, deleting or reopening the first goal moves the car's earmark
		check(closeGoalOps(rows, ACCOUNTS, 'ef', 'closed', TODAY))
		check(deleteGoalOps(rows, ACCOUNTS, 'ef', TODAY))
		const shut = after(rows, closeGoalOps(rows, ACCOUNTS, 'car', 'bought', TODAY))
		const reopened = after(shut, reopenGoalOps(shut, ACCOUNTS, 'car', TODAY))
		expect(dips(reopened)).toEqual([])
		// a new goal in the account
		check(
			saveGoalOps(rows, ACCOUNTS, { kind: 'target', name: 'Bike', accountId: 'sav', target: usd(1000) }, TODAY, newId)
		)
		// a change of name or date alone keeps the marks
		const renamed = saveGoalOps(
			rows,
			ACCOUNTS,
			draftOf(CAR, { name: 'New car', by: '2027-06' }),
			TODAY,
			newId
		) as GoalEdit
		expect(renamed.saved).toEqual([{ ...rows[1], name: 'New car', by: '2027-06' }])
	})

	it('bought closes and frees the earmark', () => {
		const rows = [EF, CAR]
		const edit = closeGoalOps(rows, ACCOUNTS, 'ef', 'bought', TODAY)
		const next = after(rows, edit)
		expect(next.find((row) => row.id === 'ef')).toMatchObject({ closedOn: TODAY, closedAs: 'bought' })
		const view = viewOf(next)
		expect(view.done.map((row) => row.id)).toEqual(['ef'])
		expect(rowOf(next, 'car').saved).toEqual(usd(800000))
		expect(view.groups[0]!.notEarmarked).toEqual(usd(400000))
		expectInverse(rows, edit)
		// Done lists the newest first and is empty with nothing closed
		const older = { ...CAR, closedOn: '2026-02-01', closedAs: 'closed' as const }
		expect(viewOf([...next.filter((row) => row.id !== 'car'), older]).done.map((row) => row.id)).toEqual(['ef', 'car'])
		expect(viewOf(rows).done).toEqual([])
	})

	it('reopen goes last', () => {
		const rows = after([EF, CAR], closeGoalOps([EF, CAR], ACCOUNTS, 'ef', 'bought', TODAY))
		const edit = reopenGoalOps(rows, ACCOUNTS, 'ef', TODAY)
		const next = after(rows, edit)
		const ef = next.find((row) => row.id === 'ef')!
		expect(ef.closedOn).toBeUndefined()
		expect(ef.closedAs).toBeUndefined()
		expect(ef.order).toBe(2)
		expect(minorOf(savedOf(next, ACCOUNTS))).toEqual({ ef: 400000, car: 800000 })
		expectInverse(rows, edit)
		// an open goal is not reopened
		expect(reopenGoalOps(next, ACCOUNTS, 'ef', TODAY)).toBeUndefined()
	})

	const DRAFT: GoalDraft = { kind: 'target', name: 'Car', accountId: 'sav', target: usd(800000) }
	it.each<[string, GoalDraft | { kind: 'rate'; rate?: number }, GoalError[]]>([
		['a whole draft', DRAFT, []],
		['an empty name', { ...DRAFT, name: '  ' }, ['goal:name']],
		['a name over 60', { ...DRAFT, name: 'x'.repeat(61) }, ['goal:name']],
		['a name of 60', { ...DRAFT, name: 'x'.repeat(60) }, []],
		['no account', { ...DRAFT, accountId: undefined }, ['goal:account']],
		['a closed account', { ...DRAFT, accountId: 'old' }, ['goal:account']],
		['a gone account', { ...DRAFT, accountId: 'gone' }, ['goal:account']],
		['a debt', { ...DRAFT, accountId: 'card' }, ['goal:account']],
		['no target', { ...DRAFT, target: undefined }, ['goal:target']],
		['a zero target', { ...DRAFT, target: usd(0) }, ['goal:target']],
		['a target in another currency', { ...DRAFT, target: jpy(1000) }, ['goal:target']],
		['everything', { kind: 'emergency' }, ['goal:name', 'goal:account', 'goal:target', 'goal:months']],
		['months of 0', { ...DRAFT, kind: 'emergency', months: 0 }, ['goal:months']],
		['months of 13', { ...DRAFT, kind: 'emergency', months: 13 }, ['goal:months']],
		['months of 12', { ...DRAFT, kind: 'emergency', months: 12 }, []],
		['a rate of 0', { kind: 'rate', rate: 0 }, ['goal:rate']],
		['a rate of 100', { kind: 'rate', rate: 100 }, ['goal:rate']],
		['a rate of 2.5', { kind: 'rate', rate: 2.5 }, ['goal:rate']],
		['no rate', { kind: 'rate' }, ['goal:rate']],
		['a rate of 20', { kind: 'rate', rate: 20 }, []],
	])('goal errors: %s', (_name, draft, codes) => {
		expect(goalErrors(draft, { accounts: ACCOUNTS })).toEqual(codes)
		// a refused save writes nothing
		if (codes.length && draft.kind !== 'rate')
			expect(saveGoalOps([], ACCOUNTS, draft, TODAY, newId)).toEqual({ error: codes[0] })
		if (codes.length && draft.kind === 'rate')
			expect(rateOps([], draft.rate ?? Number.NaN, newId)).toEqual({ error: 'goal:rate' })
	})

	it('ops and inverses round-trip', () => {
		const rate = { id: 'rate', kind: 'rate' as const, rate: 2000 }
		const closed = { ...goal('old-car', 'sav', 300000), order: 2, closedOn: '2026-05-01', closedAs: 'bought' as const }
		const rows: SavingsGoal[] = [
			{ ...EF, high: { amount: usd(1000000), day: '2026-10-01' } },
			{ ...CAR, high: { amount: usd(300000), day: '2026-10-01' } },
			closed,
			rate,
		]
		ids = 0
		const created = saveGoalOps(rows, ACCOUNTS, { ...DRAFT, name: 'Bike', by: '2027-03' }, TODAY, newId) as GoalEdit
		expect(created.saved.find((row) => row.id === 'new-1')).toMatchObject({ name: 'Bike', order: 2, by: '2027-03' })
		const edits: [string, GoalEdit | object | undefined][] = [
			['save new', created],
			['save edit', saveGoalOps(rows, ACCOUNTS, draftOf(CAR, { accountId: 'chk' }), TODAY, newId)],
			['move', moveGoalOps(rows, ACCOUNTS, 'ef', 'down', TODAY)],
			['close', closeGoalOps(rows, ACCOUNTS, 'car', 'closed', TODAY)],
			['mark bought', closeGoalOps(rows, ACCOUNTS, 'car', 'bought', TODAY)],
			['reopen', reopenGoalOps(rows, ACCOUNTS, 'old-car', TODAY)],
			['delete open', deleteGoalOps(rows, ACCOUNTS, 'ef', TODAY)],
			['delete closed', deleteGoalOps(rows, ACCOUNTS, 'old-car', TODAY)],
			['plan rebuild', rebuildOps(rows, 'car', '2027-05')],
			['start from here', startFromHereOps(rows, ACCOUNTS, 'car', TODAY)],
			['change rate', rateOps(rows, 25, newId)],
			['remove rate', rateOps(rows, undefined, newId)],
			['set rate', rateOps([EF], 30, newId)],
		]
		for (const [name, edit] of edits) {
			expect(edit, name).toBeDefined()
			expect('error' in edit!, name).toBe(false)
			const base = name === 'set rate' ? [EF] : rows
			expectInverse(base, edit as GoalEdit)
		}
		// the ends of the order and an unchanged rate write nothing
		expect(moveGoalOps(rows, ACCOUNTS, 'ef', 'up', TODAY)).toBeUndefined()
		expect(moveGoalOps(rows, ACCOUNTS, 'car', 'down', TODAY)).toBeUndefined()
		expect(rateOps(rows, 20, newId)).toBeUndefined()
		expect(rateOps([EF], undefined, newId)).toBeUndefined()
		// one rate at most: setting it again changes the one there
		expect((rateOps(rows, 25, newId) as GoalEdit).saved).toEqual([{ ...rate, rate: 2500 }])
	})
})
