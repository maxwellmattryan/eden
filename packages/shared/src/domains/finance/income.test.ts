import { describe, expect, it } from 'vitest'
import type { Entity } from '../../data/index.js'
import {
	bandOf,
	detectIncome,
	incomeAverage,
	incomeOps,
	incomeQuestions,
	incomeSignals,
	missedDay,
	monthlyOf,
	nextDayOf,
	taxRowIds,
	thirdCheckMonths,
	type DetectedSource,
} from './income.js'
import { buildLedger } from './ledger.js'
import {
	FINANCE,
	WHOLE,
	type Account,
	type Category,
	type IncomeSource,
	type IncomeSourcePayload,
	type Merchant,
	type TransactionPayload,
} from './types.js'

const TODAY = '2026-10-20'
const usd = (minor: number) => ({ minor, currency: 'USD' })

const ACCOUNTS: Account[] = [{ id: 'chk', name: 'Checking', kind: 'checking', currency: 'USD', share: WHOLE }]
const CATEGORIES: Category[] = [
	{ id: 'cat-taxes', key: 'taxes', name: 'Taxes', group: 'variable', essential: true },
	{ id: 'cat-income', key: 'income', name: 'Income', group: 'income', essential: false },
]
const merchant = (id: string, name: string): Merchant => ({ id, name, key: name.toLowerCase(), rawNames: [name] })
const MERCHANTS = [
	merchant('m-nw', 'Northwind Labs'),
	merchant('m-irs', 'IRS'),
	merchant('m-irs-pay', 'IRS Payments'),
	merchant('m-state', 'State Tax'),
]

function entity<T>(id: string, type: string, payload: T): Entity<T> {
	return {
		id,
		uri: `eden://${type}/${id}`,
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
	}
}

const tx = (id: string, day: string, minor: number, fields: Partial<TransactionPayload> = {}) =>
	entity<TransactionPayload>(id, FINANCE.transaction, {
		accountId: 'chk',
		amount: usd(minor),
		day,
		name: 'NORTHWIND LABS PAYROLL',
		pending: false,
		kind: 'income',
		merchantId: 'm-nw',
		...fields,
	})

/** One paycheck row per day, ids `<prefix>-<n>`. */
const series = (prefix: string, days: string[], minor: number, fields: Partial<TransactionPayload> = {}) =>
	days.map((day, at) => tx(`${prefix}-${at}`, day, minor, fields))

const detect = (rows: Entity<TransactionPayload>[], today = TODAY) =>
	detectIncome({ transactions: rows, merchants: MERCHANTS, categories: CATEGORIES, today })

const WEEKLY = ['2026-09-04', '2026-09-11', '2026-09-18', '2026-09-25', '2026-10-02', '2026-10-09', '2026-10-16']
const BIWEEKLY = ['2026-08-07', '2026-08-21', '2026-09-04', '2026-09-18', '2026-10-02', '2026-10-16']
const SEMIMONTHLY = ['2026-07-15', '2026-07-31', '2026-08-14', '2026-08-31', '2026-09-15', '2026-09-30', '2026-10-15']
const MONTHLY = ['2026-05-20', '2026-06-19', '2026-07-20', '2026-08-20', '2026-09-18', '2026-10-20']

/** A source as the store holds it, from a detected one. */
const sourceOf = (found: DetectedSource, id = 'src', owner: Partial<IncomeSourcePayload> = {}): IncomeSource => {
	const { rowIds: _rows, extras: _extras, points: _points, ...fields } = found
	return { ...fields, ...owner, id }
}

describe('cadence', () => {
	const cases: {
		name: string
		rows: Entity<TransactionPayload>[]
		cadence?: string
		expected?: number
		next?: string
		anchors?: number[]
	}[] = [
		{ name: 'weekly', rows: series('w', WEEKLY, 150000), cadence: 'weekly', expected: 150000, next: '2026-10-23' },
		{
			name: 'biweekly',
			rows: series('b', BIWEEKLY, 150000),
			cadence: 'biweekly',
			expected: 150000,
			next: '2026-10-30',
		},
		{
			name: 'semimonthly',
			rows: series('s', SEMIMONTHLY, 243000),
			cadence: 'semimonthly',
			expected: 243000,
			anchors: [15, 31],
			// the 31st of October is a Saturday: back to Friday
			next: '2026-10-30',
		},
		{
			name: 'monthly',
			rows: series('m', MONTHLY, 500000),
			cadence: 'monthly',
			expected: 500000,
			anchors: [20],
			next: '2026-11-20',
		},
		{
			name: 'irregular, 3 rows',
			rows: series('i', ['2026-03-02', '2026-06-11', '2026-09-25'], 80000),
			cadence: 'irregular',
			expected: 80000,
		},
		{ name: 'nothing for 2 rows', rows: series('two', ['2026-08-03', '2026-09-25'], 80000) },
		{
			// 14 to 16 days apart, but the weekday moves: biweekly does not fit, semimonthly does
			name: 'biweekly days on different weekdays fall back to semimonthly',
			rows: series('d', ['2026-08-03', '2026-08-17', '2026-09-01', '2026-09-15', '2026-10-01', '2026-10-15'], 150000),
			cadence: 'semimonthly',
			expected: 150000,
		},
		{
			// the bonus paid in the 18 Sep deposit makes it an extra row; the cadence still reads with its day
			name: 'a combined bonus deposit keeps the cadence',
			rows: series('c', BIWEEKLY, 150000).map((row) =>
				row.payload.day === '2026-09-18' ? { ...row, payload: { ...row.payload, amount: usd(650000) } } : row
			),
			cadence: 'biweekly',
			expected: 150000,
			next: '2026-10-30',
		},
	]
	for (const entry of cases) {
		it(entry.name, () => {
			const found = detect(entry.rows)
			if (!entry.cadence) {
				expect(found).toEqual([])
				return
			}
			expect(found).toHaveLength(1)
			const [source] = found
			expect(source).toMatchObject({ kind: 'income', merchantId: 'm-nw', name: 'Northwind Labs', accountId: 'chk' })
			expect(source!.cadence).toBe(entry.cadence)
			expect(source!.expected).toEqual(usd(entry.expected!))
			if (entry.next || entry.cadence === 'irregular') expect(source!.nextDay).toBe(entry.next)
			if (entry.anchors) expect(source!.anchors).toEqual(entry.anchors)
		})
	}

	it('groups rows with no merchant by their folded name, and leaves money out and other kinds alone', () => {
		const rows = [
			...series('n', WEEKLY, 90000, { merchantId: undefined, name: 'ACME  Corp — Payroll' }),
			tx('out', '2026-10-01', -90000),
			tx('refund', '2026-10-02', 90000, { kind: 'refund' }),
		]
		const [source, ...rest] = detect(rows)
		expect(rest).toEqual([])
		expect(source).toMatchObject({ cadence: 'weekly', nameKey: 'acme corp payroll', name: 'ACME  Corp — Payroll' })
		expect(source!.merchantId).toBeUndefined()
	})

	it('reads only the last 400 days', () => {
		expect(
			detect(series('old', ['2025-06-01', '2025-07-01', '2025-08-01', '2025-09-01'], 50000), '2026-06-01')
		).toHaveLength(1)
		expect(
			detect(series('old', ['2025-06-01', '2025-07-01', '2025-08-01', '2025-09-01'], 50000), '2026-12-01')
		).toEqual([])
	})
})

describe('next day and third checks', () => {
	it('reads the anchors, with the last day as 31, clamped and moved back to Friday', () => {
		// 29 May is a Friday standing in for Sunday the 31st: within 3 days of the month's end, so the last day
		const [source] = detect(series('l', ['2026-05-29', '2026-06-30', '2026-07-31', '2026-08-31', '2026-09-30'], 1))
		expect(source).toMatchObject({ cadence: 'monthly', anchors: [31], nextDay: '2026-10-30' })

		// the 15th of February 2026 is a Sunday, the 28th a Saturday
		expect(nextDayOf('semimonthly', [15, 31], '2026-02-13')).toBe('2026-02-27')
		expect(nextDayOf('semimonthly', [15, 31], '2026-02-27')).toBe('2026-03-13')
		expect(nextDayOf('semimonthly', [15, 31], '2026-03-31')).toBe('2026-04-15')
		expect(nextDayOf('monthly', [31], '2026-03-31')).toBe('2026-04-30')
		expect(nextDayOf('monthly', [20], '2026-10-20')).toBe('2026-11-20')
		expect(nextDayOf('weekly', undefined, '2026-10-16')).toBe('2026-10-23')
		expect(nextDayOf('biweekly', undefined, '2026-10-16')).toBe('2026-10-30')
		expect(nextDayOf('yearly', undefined, '2024-02-29')).toBe('2025-02-28')
		expect(nextDayOf('irregular', undefined, '2026-10-16')).toBeUndefined()
	})

	it('keeps the 1st and the 15th as two anchors', () => {
		const days = ['2026-07-01', '2026-07-15', '2026-08-03', '2026-08-14', '2026-09-01', '2026-09-15', '2026-10-01']
		const [source] = detect(series('f', days, 200000))
		expect(source).toMatchObject({ cadence: 'semimonthly', anchors: [1, 15], nextDay: '2026-10-15' })
	})

	it('lists the months with a third biweekly paycheck, this month and the 11 after it', () => {
		const [source] = detect(series('b', BIWEEKLY, 150000))
		expect(thirdCheckMonths(source!, TODAY)).toEqual(['2026-10', '2027-04'])
		const [semi] = detect(series('s', SEMIMONTHLY, 243000))
		expect(thirdCheckMonths(semi!, TODAY)).toEqual([])
	})
})

describe('tax', () => {
	const rows = [
		...series('w', WEEKLY, 150000),
		// a refund from the employer's merchant is still never part of its paychecks
		tx('nw-refund', '2026-10-09', 900000, { providerCategory: 'INCOME_TAX_REFUND' }),
		tx('irs-1', '2025-04-10', 184000, { merchantId: 'm-irs', name: 'IRS TREAS 310 TAX REF' }),
		tx('irs-2', '2026-04-14', 184500, { merchantId: 'm-irs', name: 'IRS TREAS 310 TAX REF' }),
		tx('pay', '2026-04-15', -320000, {
			merchantId: 'm-irs-pay',
			kind: 'purchase',
			name: 'IRS USATAXPYMT',
			providerCategory: 'GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT',
		}),
		tx('state', '2025-09-15', -50000, { merchantId: 'm-state', kind: 'purchase', categoryId: 'cat-taxes' }),
		tx('old', '2025-03-02', -10000, { merchantId: 'm-old', kind: 'purchase', categoryId: 'cat-taxes' }),
	]
	const found = detect(rows)
	const of = (kind: string, merchantId: string) =>
		found.find((source) => source.kind === kind && source.merchantId === merchantId)

	it('keeps refunds and payments as yearly sources with next-year days', () => {
		expect(of('tax-refund', 'm-irs')).toMatchObject({
			cadence: 'yearly',
			expected: usd(184500),
			nextDay: '2027-04-14',
			rowIds: ['irs-1', 'irs-2'],
		})
		expect(of('tax-payment', 'm-irs-pay')).toMatchObject({
			cadence: 'yearly',
			expected: usd(-320000),
			nextDay: '2027-04-15',
		})
		// a year on is within 60 days before today, so it stays
		expect(of('tax-payment', 'm-state')).toMatchObject({ expected: usd(-50000), nextDay: '2026-09-15' })
		// 29 Feb becomes 28 Feb, moved on a year at a time
		expect(of('tax-payment', 'm-old')).toMatchObject({ nextDay: '2027-03-02' })
		const leap = tx('leap', '2024-02-29', -10000, { merchantId: 'm-leap', kind: 'purchase', categoryId: 'cat-taxes' })
		expect(detect([leap], '2026-03-10')[0]).toMatchObject({ kind: 'tax-payment', nextDay: '2026-02-28' })
		// older than 800 days: not read
		expect(detect([leap], TODAY)).toEqual([])
		expect(of('tax-refund', 'm-nw')).toMatchObject({ rowIds: ['nw-refund'], expected: usd(900000) })
	})

	it('never counts them as paychecks, extra rows, bonuses or in the average', () => {
		const pay = of('income', 'm-nw')!
		expect(pay).toMatchObject({ cadence: 'weekly', expected: usd(150000), extras: [] })
		expect(pay.rowIds).not.toContain('nw-refund')
		const sources = found.map((source, at) => sourceOf(source, `s${at}`))
		expect(incomeQuestions(sources, found, TODAY)).toEqual([])
		const ledger = buildLedger({
			transactions: rows,
			accounts: ACCOUNTS,
			categories: CATEGORIES,
			merchants: MERCHANTS,
			home: 'USD',
		})
		const exclude = taxRowIds(found)
		expect([...exclude].sort()).toEqual(['irs-1', 'irs-2', 'nw-refund', 'old', 'pay', 'state'])
		// September's four weekly paychecks over the three months back to July, the first with rows
		const average = incomeAverage(ledger, { month: '2026-10', exclude })
		expect(average).toEqual({ average: usd(200000), months: 3 })
	})
})

describe('late', () => {
	const [semi] = detect(series('s', SEMIMONTHLY.slice(0, 6), 243000))
	const source = sourceOf(semi!)

	it('reports the latest missed day once its grace has passed', () => {
		// paid through 30 Sep: the 15 Oct paycheck is due, with 3 days' grace
		expect(source.nextDay).toBe('2026-10-15')
		expect(missedDay(source, '2026-10-18')).toBeUndefined()
		expect(missedDay(source, '2026-10-19')).toBe('2026-10-15')
		expect(missedDay(source, '2026-11-02')).toBe('2026-10-15')
		expect(missedDay(source, '2026-11-03')).toBe('2026-10-30')

		const [weekly] = detect(series('w', WEEKLY.slice(0, 5), 150000))
		const week = sourceOf(weekly!)
		expect(week.nextDay).toBe('2026-10-09')
		// 2 days' grace for weekly
		expect(missedDay(week, '2026-10-11')).toBeUndefined()
		expect(missedDay(week, '2026-10-12')).toBe('2026-10-09')
		expect(missedDay(week, TODAY)).toBe('2026-10-16')
	})

	it('says nothing for an ended, hidden or irregular source, or for the day said to be just late', () => {
		expect(missedDay({ ...source, endedOn: '2026-10-16' }, TODAY)).toBeUndefined()
		expect(missedDay({ ...source, ignored: true }, TODAY)).toBeUndefined()
		const [odd] = detect(series('i', ['2026-03-02', '2026-06-11', '2026-09-25'], 80000))
		expect(odd!.cadence).toBe('irregular')
		expect(missedDay(sourceOf(odd!), '2027-06-01')).toBeUndefined()

		expect(incomeQuestions([source], [semi!], TODAY)).toEqual([{ kind: 'late', sourceId: 'src', day: '2026-10-15' }])
		expect(incomeQuestions([{ ...source, lateOk: '2026-10-15' }], [semi!], TODAY)).toEqual([])
		// a later missed day asks again
		expect(incomeQuestions([{ ...source, lateOk: '2026-10-15' }], [semi!], '2026-11-04')).toEqual([
			{ kind: 'late', sourceId: 'src', day: '2026-10-30' },
		])
	})

	it('keys the signal by the source and the day', () => {
		const questions = incomeQuestions([source], [semi!], TODAY)
		expect(incomeSignals(questions, [], [source], TODAY, (day) => `on ${day}`)).toEqual([
			{
				name: 'finance.paycheck-late',
				payload: { uris: ['eden://income-source/src'], employer: 'Northwind Labs', day: 'on 2026-10-15' },
				dedupeKey: 'src:2026-10-15',
			},
		])
	})

	it('asks about the earliest missed day first', () => {
		const [weekly] = detect(series('w', WEEKLY.slice(0, 5), 150000, { merchantId: 'm-other' }))
		const week = sourceOf(weekly!, 'week')
		const asked = incomeQuestions([week, source], [weekly!, semi!], TODAY)
		expect(asked.map((question) => question.kind === 'late' && question.day)).toEqual(['2026-10-15', '2026-10-16'])
	})
})

describe('bonus and new', () => {
	const today = '2026-10-20'

	it('asks about a posted extra row of the last 30 days, the whole row when it stands alone', () => {
		const rows = [...series('b', BIWEEKLY, 150000), tx('bonus', '2026-10-09', 500000)]
		const found = detect(rows, today)
		expect(found[0]!.extras).toEqual([
			{ rowId: 'bonus', amount: usd(500000), day: '2026-10-09', combined: false, pending: false },
		])
		const source = sourceOf(found[0]!)
		expect(incomeQuestions([source], found, today)).toEqual([
			{ kind: 'bonus', sourceId: 'src', rowId: 'bonus', amount: usd(500000), day: '2026-10-09', combined: false },
		])
		// an ended source still asks (severance counts)
		expect(incomeQuestions([{ ...source, endedOn: '2026-10-17' }], found, today)).toHaveLength(1)
		expect(incomeQuestions([{ ...source, handled: ['bonus'] }], found, today)).toEqual([])
		const bonuses = (questions: ReturnType<typeof incomeQuestions>) =>
			questions.filter((question) => question.kind === 'bonus')
		expect(bonuses(incomeQuestions([source], found, '2026-11-09'))).toEqual([])
		const pending = detect([...series('b', BIWEEKLY, 150000), tx('bonus', '2026-10-09', 500000, { pending: true })])
		expect(incomeQuestions([sourceOf(pending[0]!)], pending, today)).toEqual([])
		expect(incomeSignals(incomeQuestions([source], found, today), [], [source], today)).toEqual([
			{
				name: 'finance.bonus',
				payload: { uris: ['eden://income-source/src'], employer: 'Northwind Labs', day: '2026-10-09' },
				dedupeKey: 'bonus',
			},
		])
	})

	it('asks about the extra part of a combined deposit', () => {
		const rows = series('c', BIWEEKLY, 150000).map((row) =>
			row.payload.day === '2026-10-16' ? { ...row, payload: { ...row.payload, amount: usd(650000) } } : row
		)
		const found = detect(rows, today)
		expect(found[0]!.cadence).toBe('biweekly')
		expect(incomeQuestions([sourceOf(found[0]!)], found, today)).toEqual([
			{ kind: 'bonus', sourceId: 'src', rowId: 'c-5', amount: usd(500000), day: '2026-10-16', combined: true },
		])
	})

	it('signals a new paycheck only when it is created with its first day within 100 days', () => {
		let n = 0
		const newId = () => `id-${(n += 1)}`
		const recent = detect(series('b', BIWEEKLY, 150000), today)
		const made = incomeOps(recent, [], newId)
		expect(made.created).toEqual(['id-1'])
		expect(incomeSignals([], made.created, made.sources, today)).toEqual([
			{
				name: 'finance.income-new',
				payload: { uris: ['eden://income-source/id-1'], employer: 'Northwind Labs', day: '2026-08-07' },
				dedupeKey: 'id-1:new',
			},
		])
		// a first link with a long history does not announce an old job
		const old = detect(series('o', ['2025-11-03', '2025-12-01', '2026-01-02', '2026-02-02', '2026-03-02'], 1), today)
		const oldMade = incomeOps(old, [], newId)
		expect(oldMade.created).toHaveLength(1)
		expect(incomeSignals([], oldMade.created, oldMade.sources, today)).toEqual([])
		// and an update is never new
		const again = incomeOps(
			recent,
			made.sources.map((source) => entity(source.id, FINANCE.income, source)),
			newId
		)
		expect(again.created).toEqual([])
	})

	it('asks about a new paycheck during lean mode only', () => {
		const old = sourceOf(detect(series('b', BIWEEKLY, 150000))[0]!, 'old', {
			endedOn: '2026-09-01',
			leanSince: '2026-09-01',
		})
		const fresh = sourceOf(
			detect(series('n', ['2026-09-25', '2026-10-02', '2026-10-09', '2026-10-16'], 90000, { merchantId: 'm-new' }))[0]!,
			'fresh'
		)
		expect(incomeQuestions([old, fresh], [], today)).toEqual([{ kind: 'new', sourceId: 'fresh' }])
		expect(incomeQuestions([old, { ...fresh, seenNew: true }], [], today)).toEqual([])
		expect(incomeQuestions([{ ...old, leanSince: undefined }, fresh], [], today)).toEqual([])
	})
})

describe('ops', () => {
	let n = 0
	const newId = () => `id-${(n += 1)}`
	const rowsOf = (sources: IncomeSource[]) =>
		sources.map(({ id, ...payload }) => entity<IncomeSourcePayload>(id, FINANCE.income, payload))

	it('creates, then writes nothing the second time', () => {
		const found = detect([...series('w', WEEKLY, 150000), ...series('m', MONTHLY, 1, { merchantId: 'm-irs' })])
		const first = incomeOps(found, [], newId)
		expect(first.ops.map((op) => op.op)).toEqual(['createEntity', 'createEntity'])
		expect(first.created).toHaveLength(2)
		const second = incomeOps(found, rowsOf(first.sources), newId)
		expect(second.ops).toEqual([])
		expect(second.created).toEqual([])
	})

	it('updates a changed source and keeps the owner keys', () => {
		const before = detect(series('w', WEEKLY.slice(0, 6), 150000))
		const made = incomeOps(before, [], newId)
		const held = rowsOf(made.sources.map((source) => ({ ...source, endedOn: '2026-10-12', handled: ['x'] })))
		const after = detect(series('w', WEEKLY, 150000))
		const out = incomeOps(after, held, newId)
		expect(out.ops).toHaveLength(1)
		const op = out.ops[0]!
		expect(op.op).toBe('updateEntity')
		expect(op.op === 'updateEntity' && op.payload).toMatchObject({
			lastDay: '2026-10-16',
			nextDay: '2026-10-23',
			endedOn: '2026-10-12',
			handled: ['x'],
		})
	})

	it('deletes a source with no rows left unless the owner answered something on it', () => {
		const made = incomeOps(detect(series('w', WEEKLY, 150000)), [], newId).sources
		const plain = incomeOps([], rowsOf(made), newId)
		expect(plain.ops).toEqual([{ op: 'delete', uri: `eden://income-source/${made[0]!.id}` }])
		expect(plain.sources).toEqual([])
		const answered = incomeOps([], rowsOf(made.map((source) => ({ ...source, lateOk: '2026-10-16' }))), newId)
		expect(answered.ops).toEqual([])
		expect(answered.sources).toHaveLength(1)
	})

	const STUB = {
		day: '2026-10-16',
		deductions: [{ name: 'Medical', kind: 'medical' as const, amount: { minor: 9000, currency: 'USD' } }],
		importId: 'fi-1',
	}

	it('keeps a pay stub’s deductions when it updates a source (#85)', () => {
		const made = incomeOps(detect(series('w', WEEKLY.slice(0, 6), 150000)), [], newId)
		const held = rowsOf(made.sources.map((source) => ({ ...source, payStub: STUB })))
		const out = incomeOps(detect(series('w', WEEKLY, 150000)), held, newId)
		expect(out.ops).toHaveLength(1)
		const op = out.ops[0]!
		expect(op.op === 'updateEntity' && op.payload).toMatchObject({ lastDay: '2026-10-16', payStub: STUB })
		expect(out.sources[0]!.payStub).toEqual(STUB)
	})

	it('keeps a source with no rows left when its only owner key is its pay stub', () => {
		const made = incomeOps(detect(series('w', WEEKLY, 150000)), [], newId).sources
		const out = incomeOps([], rowsOf(made.map((source) => ({ ...source, payStub: STUB }))), newId)
		expect(out.ops).toEqual([])
		expect(out.sources).toHaveLength(1)
	})
})

describe('average and band', () => {
	const month = (at: string) => [`2026-${at}-15`, `2026-${at}-30`]
	const rows = [
		...series('s', [...month('07'), ...month('08'), ...month('09')], 243000),
		tx('one-off', '2026-08-20', 100000, { oneOff: true }),
		tx('yen', '2026-08-21', 50000, { amount: { minor: 50000, currency: 'JPY' }, merchantId: 'm-yen' }),
		tx('now', '2026-10-15', 243000),
	]
	const ledger = buildLedger({
		transactions: rows,
		accounts: ACCOUNTS,
		categories: CATEGORIES,
		merchants: MERCHANTS,
		home: 'USD',
	})
	const base: IncomeSource = {
		id: 'src',
		kind: 'income',
		merchantId: 'm-nw',
		name: 'Northwind Labs',
		accountId: 'chk',
		cadence: 'semimonthly',
		anchors: [15, 31],
		expected: usd(243000),
		firstDay: '2026-07-15',
		lastDay: '2026-10-15',
	}

	it('averages the complete months among the last 3, one-offs and other currencies left out', () => {
		expect(incomeAverage(ledger, { month: '2026-10' })).toEqual({ average: usd(486000), months: 3 })
		// two complete months since the first: the mean is over them
		expect(incomeAverage(ledger, { month: '2026-09' })).toEqual({ average: usd(486000), months: 2 })
		expect(incomeAverage(ledger, { month: '2026-07' })).toBeUndefined()
	})

	it('works out the monthly equivalents', () => {
		const of = (cadence: IncomeSource['cadence'], minor: number) =>
			monthlyOf({ ...base, cadence, expected: usd(minor) }, ledger, TODAY)
		expect(of('weekly', 100000)).toEqual(usd(433333))
		expect(of('biweekly', 150000)).toEqual(usd(325000))
		expect(of('semimonthly', 243000)).toEqual(usd(486000))
		expect(of('monthly', 500000)).toEqual(usd(500000))
		// an irregular source: its rows over the last 3 complete months ÷ 3 (the one-off is one of them)
		expect(of('irregular', 1)).toEqual(usd(Math.round((243000 * 6 + 100000) / 3)))
	})

	it('writes the band in steps of 1,000, with its confidence', () => {
		expect(bandOf([base], ledger, 'USD', TODAY)).toEqual({ value: '4000-5000 USD', confidence: 0.9 })
		expect(bandOf([{ ...base, cadence: 'irregular' }], ledger, 'USD', TODAY)).toEqual({
			value: '5000-6000 USD',
			confidence: 0.6,
		})
		expect(bandOf([{ ...base, endedOn: '2026-10-16' }], ledger, 'USD', TODAY)).toBeUndefined()
		expect(bandOf([{ ...base, ignored: true }], ledger, 'USD', TODAY)).toBeUndefined()
		expect(bandOf([{ ...base, kind: 'tax-refund', cadence: 'yearly' }], ledger, 'USD', TODAY)).toBeUndefined()
		expect(bandOf([], ledger, 'USD', TODAY)).toBeUndefined()
	})

	it('steps by 100,000 for a currency with no decimals, and leaves other currencies out', () => {
		const yen = buildLedger({ transactions: [], accounts: [], categories: [], merchants: [], home: 'JPY' })
		const pay: IncomeSource = { ...base, cadence: 'monthly', expected: { minor: 350000, currency: 'JPY' } }
		expect(bandOf([pay], yen, 'JPY', TODAY)).toEqual({ value: '300000-400000 JPY', confidence: 0.9 })
		expect(bandOf([pay], ledger, 'USD', TODAY)).toBeUndefined()
	})
})
