import { describe, expect, it } from 'vitest'
import { newId, toUri, type BatchOp, type Entity } from '../../data/index.js'
import { addDays } from '../../dates/index.js'
import { spendingOf } from './classify.js'
import {
	buildLedger,
	LedgerQueryError,
	parseSearch,
	periodOf,
	queryLedger,
	rollupOf,
	touchedTransactions,
	typicalOf,
	type Ledger,
	type LedgerQuery,
	type PeriodPreset,
	type TxFilter,
} from './ledger.js'
import { FINANCE, WHOLE, type Account, type Category, type Merchant, type TransactionPayload } from './types.js'

const usd = (minor: number) => ({ minor, currency: 'USD' })
const jpy = (minor: number) => ({ minor, currency: 'JPY' })

const account = (id: string, kind: Account['kind'], linkId?: string, currency = 'USD'): Account => ({
	id,
	name: id,
	kind,
	currency,
	share: WHOLE,
	...(linkId ? { linkId } : {}),
})
const ACCOUNTS = [
	account('chk', 'checking', 'L1'),
	account('card', 'credit-card', 'L1'),
	account('sav', 'savings', 'L2'),
	account('yen', 'savings', undefined, 'JPY'),
]
const CATEGORIES: Category[] = ['groc', 'dining', 'home', 'shop'].map((id) => ({
	id,
	name: id,
	group: 'variable',
	essential: false,
}))
const MERCHANTS: Merchant[] = [
	{ id: 'm-amz', name: 'Amazon', key: 'amazon', rawNames: [] },
	{ id: 'm-cafe', name: 'Café Olé', key: 'cafe ole', rawNames: [] },
	{ id: 'm-jp', name: 'ローソン', key: 'ローソン', rawNames: [] },
	{ id: 'm-zelle', name: 'Zelle', key: 'zelle', vague: 'Zelle', rawNames: [] },
]

const entity = (
	id: string,
	payload: TransactionPayload,
	deletedAt: string | null = null
): Entity<TransactionPayload> => ({
	id,
	uri: toUri(FINANCE.transaction, id),
	type: FINANCE.transaction,
	payload,
	createdAt: '',
	updatedAt: '',
	deletedAt,
	mirror: false,
	source: 'plaid',
	externalId: id,
	snapshot: null,
	links: [],
})

type Fields = Partial<TransactionPayload> & { id: string; minor?: number }
const row = ({ id, minor = 0, ...fields }: Fields, deletedAt: string | null = null) =>
	entity(
		id,
		{
			accountId: 'chk',
			amount: usd(minor),
			day: '2026-10-01',
			name: id.toUpperCase(),
			pending: false,
			kind: minor > 0 ? 'refund' : 'purchase',
			...fields,
		},
		deletedAt
	)

const ROWS = [
	row({ id: 'p1', minor: -1000, day: '2026-10-05', merchantId: 'm-amz', categoryId: 'shop', name: 'AMZN Mktp US' }),
	row({
		id: 'p2',
		minor: -2000,
		accountId: 'card',
		day: '2026-10-03',
		merchantId: 'm-cafe',
		categoryId: 'dining',
		oneOff: true,
		notes: 'birthday dinner',
	}),
	row({
		id: 'sp',
		minor: -3000,
		day: '2026-10-02',
		merchantId: 'm-jp',
		name: 'LAWSON',
		parts: [
			{ amount: usd(-1000), categoryId: 'groc', note: 'snacks' },
			{ amount: usd(-2000), categoryId: 'home' },
		],
	}),
	row({
		id: 'rf',
		minor: 500,
		accountId: 'card',
		day: '2026-10-04',
		merchantId: 'm-amz',
		categoryId: 'shop',
		refundOf: 'p1',
		name: 'AMZN RETURN',
	}),
	row({ id: 't-out', minor: -50000, kind: 'transfer', transferId: 't-in' }),
	row({ id: 't-in', minor: 50000, accountId: 'sav', kind: 'transfer', transferId: 't-out' }),
	row({ id: 'c-out', minor: -20000, day: '2026-09-28', kind: 'card-payment', transferId: 'c-in' }),
	row({ id: 'c-in', minor: 20000, accountId: 'card', day: '2026-09-28', kind: 'card-payment', transferId: 'c-out' }),
	row({ id: 'inc', minor: 300000, day: '2026-09-30', kind: 'income', name: 'PAYROLL ACME' }),
	row({ id: 'orph', minor: -700, day: '2026-09-29', kind: 'transfer', transferId: 'gone' }),
	row({
		id: 'z1',
		minor: -2500,
		day: '2026-10-06',
		pending: true,
		merchantId: 'm-zelle',
		counterparty: 'jane doe',
		review: 'vague',
		reimbursable: usd(1000),
		name: 'ZELLE TO JANE',
	}),
	row({ id: 'yen1', accountId: 'yen', amount: jpy(-1200), day: '2026-10-02', merchantId: 'm-jp', categoryId: 'groc' }),
	row({ id: 'dead', minor: -999, day: '2026-10-06' }, '2026-10-07T00:00:00Z'),
]

const ledgerOf = (rows = ROWS, home = 'USD') =>
	buildLedger({ transactions: rows, accounts: ACCOUNTS, categories: CATEGORIES, merchants: MERCHANTS, home })
const LEDGER = ledgerOf()
const NEWEST = ['z1', 'p1', 'rf', 'p2', 'yen1', 'sp', 't-out', 'inc', 'orph', 'c-out']

const ids = (query: LedgerQuery, ledger: Ledger = LEDGER) => queryLedger(ledger, query).rows.map((entry) => entry.id)
const keys = (query: LedgerQuery) =>
	queryLedger(LEDGER, query).groups!.map((group) => [group.key.join('/'), group.net.minor, group.count])

describe('the ledger', () => {
	it('builds one entry per row and one per pair', () => {
		expect(LEDGER.entries.map((entry) => entry.id)).toEqual(NEWEST)
		const transfer = LEDGER.entry('t-out')!
		expect(transfer).toMatchObject({ id: 't-out', pairId: 't-in', accountId: 'chk', toAccountId: 'sav' })
		expect(LEDGER.entry('t-in')).toBe(transfer)
		expect(transfer.lines.map((line) => [line.accountId, line.amount.minor, line.categoryId])).toEqual([
			['chk', -50000, undefined],
			['sav', 50000, undefined],
		])
		expect(LEDGER.entry('c-in')).toMatchObject({
			id: 'c-out',
			pairId: 'c-in',
			kind: 'card-payment',
			accountId: 'chk',
			toAccountId: 'card',
		})
		const orphan = LEDGER.entry('orph')!
		expect(orphan.pairId).toBeUndefined()
		expect(orphan.lines).toHaveLength(1)
		expect(LEDGER.entry('dead')).toBeUndefined()
		expect(LEDGER.entry('p1')).toMatchObject({ merchant: 'Amazon', kind: 'purchase', oneOff: false })
		expect(LEDGER.entry('sp')!.lines.map((line) => [line.amount.minor, line.categoryId])).toEqual([
			[-1000, 'groc'],
			[-2000, 'home'],
		])
		expect(LEDGER.firstMonth).toBe('2026-09')
		// a pair whose other side is tombstoned is a single entry
		const half = ledgerOf(ROWS.map((entry) => (entry.id === 't-in' ? { ...entry, deletedAt: 'x' } : entry)))
		expect(half.entry('t-out')!.pairId).toBeUndefined()
	})

	it('scope and measures', () => {
		const home = ROWS.filter((entry) => !entry.deletedAt && entry.payload.amount.currency === 'USD')
		const spending = home
			.flatMap((entry) => spendingOf(entry.payload))
			.reduce((sum, item) => sum + item.amount.minor, 0)
		const oct1 = { from: '2026-10-01', to: '2026-10-01', kinds: ['transfer'] } satisfies TxFilter
		const cases: {
			name: string
			filter: TxFilter
			amount?: number
			measures: Partial<Record<'count' | 'in' | 'out' | 'net' | 'spending' | 'average', number>>
			left?: number[]
		}[] = [
			{
				name: 'everything',
				filter: {},
				measures: { count: 10, in: 300500, out: -9200, net: 291300, spending, average: -1500 },
				left: [-1200],
			},
			{ name: 'transfer, no scope', filter: oct1, amount: -50000, measures: { count: 1, in: 0, out: 0, net: 0 } },
			{
				name: 'transfer, from account',
				filter: { ...oct1, accountIds: ['chk'] },
				amount: -50000,
				measures: { in: 0, out: -50000, net: -50000 },
			},
			{
				name: 'transfer, to account',
				filter: { ...oct1, accountIds: ['sav'] },
				amount: 50000,
				measures: { in: 50000, out: 0, net: 50000 },
			},
			{
				name: 'transfer, to link',
				filter: { ...oct1, linkIds: ['L2'] },
				amount: 50000,
				measures: { in: 50000 },
			},
			{
				name: 'transfer, both sides in scope',
				filter: { ...oct1, accountIds: ['chk', 'sav'] },
				amount: -50000,
				measures: { in: 0, out: 0, net: 0, count: 1 },
			},
			{
				name: 'split parts under their own categories',
				filter: { categoryIds: ['home'] },
				amount: -3000,
				measures: { count: 1, out: -2000, spending: -2000, average: -2000 },
			},
			{
				name: 'another currency',
				filter: { accountIds: ['yen'] },
				amount: -1200,
				measures: { count: 1, in: 0, out: 0, net: 0, spending: 0 },
				left: [-1200],
			},
			{
				name: 'one-off out of the average',
				filter: { oneOff: true },
				measures: { spending: -2000, average: undefined },
			},
		]
		for (const entry of cases) {
			const answer = queryLedger(LEDGER, { filter: entry.filter })
			const got = {
				count: answer.count,
				in: answer.in.minor,
				out: answer.out.minor,
				net: answer.net.minor,
				spending: answer.spending.minor,
				average: answer.average?.minor,
			}
			expect(got, entry.name).toMatchObject(entry.measures)
			if ('average' in entry.measures && entry.measures.average === undefined)
				expect(answer.average, entry.name).toBeUndefined()
			if (entry.amount !== undefined) expect(answer.rows[0]!.amount.minor, entry.name).toBe(entry.amount)
			expect(answer.in.currency, entry.name).toBe('USD')
			expect(
				answer.left.map((money) => money.minor),
				entry.name
			).toEqual(entry.left ?? [])
		}
		const yen = queryLedger(LEDGER, { filter: { accountIds: ['yen'] } })
		expect(yen.rows[0]!.flags).toContain('other-currency')
		expect(yen.left).toEqual([jpy(-1200)])
	})

	it('filters', () => {
		const cases: [string, TxFilter, string[]][] = [
			['from/to', { from: '2026-10-03', to: '2026-10-05' }, ['p1', 'rf', 'p2']],
			['accountIds', { accountIds: ['card'] }, ['rf', 'p2', 'c-out']],
			['linkIds', { linkIds: ['L1'] }, NEWEST.filter((id) => id !== 'yen1')],
			['categoryIds', { categoryIds: ['groc'] }, ['yen1', 'sp']],
			['categoryIds none', { categoryIds: ['none'] }, ['z1']],
			['merchantIds', { merchantIds: ['m-amz'] }, ['p1', 'rf']],
			['kinds', { kinds: ['income', 'card-payment'] }, ['inc', 'c-out']],
			['atLeast/atMost', { atLeast: 2000, atMost: 3000 }, ['z1', 'p2', 'sp']],
			['pending true', { pending: true }, ['z1']],
			['pending false', { pending: false }, NEWEST.filter((id) => id !== 'z1')],
			['oneOff', { oneOff: true }, ['p2']],
			['reimbursable', { reimbursable: true }, ['z1']],
			['uncategorised', { uncategorised: true }, ['z1']],
			['review', { review: true }, ['z1']],
			['text, a raw name', { text: 'amz' }, ['p1', 'rf']],
			['text, accent and case folded', { text: 'CAFE ole' }, ['p2']],
			['text, a Japanese merchant', { text: 'ソン' }, ['yen1', 'sp']],
			['text, the counterparty', { text: 'jane doe' }, ['z1']],
			["text, a part's note", { text: 'snack' }, ['sp']],
			['text, notes', { text: 'birth day' }, ['p2']],
			['text, empty', { text: '  ' }, NEWEST],
			['text, no match', { text: 'zzz' }, []],
		]
		for (const [name, filter, expected] of cases) expect(ids({ filter }), name).toEqual(expected)
		// a split row comes back whole, measured by its matching lines only
		const groc = queryLedger(LEDGER, { filter: { categoryIds: ['groc'] } })
		expect(groc.rows.find((entry) => entry.id === 'sp')!.amount).toEqual(usd(-3000))
		expect(groc.spending).toEqual(usd(-1000))
		expect(groc.left).toEqual([jpy(-1200)])
	})

	it('parseSearch', () => {
		const cases: [string, ReturnType<typeof parseSearch>][] = [
			['>100', { text: '', atLeast: 10001 }],
			['>=100', { text: '', atLeast: 10000 }],
			['<20', { text: '', atMost: 1999 }],
			['<=20', { text: '', atMost: 2000 }],
			['>12.50', { text: '', atLeast: 1251 }],
			['coffee >abc beans', { text: 'coffee >abc beans' }],
			['coffee >5 beans <=20', { text: 'coffee beans', atLeast: 501, atMost: 2000 }],
			['plain words', { text: 'plain words' }],
		]
		for (const [text, expected] of cases) expect(parseSearch(text, 'USD', 'en'), text).toEqual(expected)
		expect(parseSearch('>1000', 'JPY', 'ja')).toEqual({ text: '', atLeast: 1001 })
	})

	it('periodOf', () => {
		const cases: [PeriodPreset, string, string, string][] = [
			['this-month', '2026-03-31', '2026-03-01', '2026-03-31'],
			['this-month', '2026-01-01', '2026-01-01', '2026-01-01'],
			['last-month', '2026-03-31', '2026-02-01', '2026-02-28'],
			['last-month', '2026-01-01', '2025-12-01', '2025-12-31'],
			['90-days', '2026-03-31', '2026-01-01', '2026-03-31'],
			['90-days', '2026-01-01', '2025-10-04', '2026-01-01'],
			['this-year', '2026-03-31', '2026-01-01', '2026-03-31'],
			['this-year', '2026-01-01', '2026-01-01', '2026-01-01'],
		]
		for (const [preset, today, from, to] of cases)
			expect(periodOf(preset, today), `${preset} ${today}`).toEqual({ from, to })
	})

	it('rows, paging and flags', () => {
		expect(ids({})).toEqual(NEWEST)
		expect(ids({ rows: { sort: 'newest' } })).toEqual(NEWEST)
		expect(ids({ rows: { sort: 'oldest' } })).toEqual([...NEWEST].reverse())
		expect(ids({ rows: { sort: 'largest' } })).toEqual([
			'inc',
			't-out',
			'c-out',
			'sp',
			'z1',
			'p2',
			'yen1',
			'p1',
			'orph',
			'rf',
		])
		const all = queryLedger(LEDGER, {})
		const page = queryLedger(LEDGER, { rows: { offset: 2, limit: 3 } })
		expect(page.rows.map((entry) => entry.id)).toEqual(['rf', 'p2', 'yen1'])
		expect({ ...page, rows: [] }).toEqual({ ...all, rows: [] })
		expect(ids({ rows: { limit: 0 } })).toEqual(['z1'])
		expect(ids({ rows: { limit: 5000 } })).toEqual(NEWEST)
		expect(ids({ rows: { offset: 9 } })).toEqual(['c-out'])
		// datetime breaks a day's tie, then the id
		const sameDay = ledgerOf([
			row({ id: 'a', minor: -1, datetime: '2026-10-01T09:00:00Z' }),
			row({ id: 'b', minor: -1, datetime: '2026-10-01T08:00:00Z' }),
			row({ id: 'c', minor: -1 }),
		])
		expect(ids({}, sameDay)).toEqual(['a', 'b', 'c'])
		const many = ledgerOf(
			Array.from({ length: 1200 }, (_, at) => row({ id: `r${String(at).padStart(4, '0')}`, minor: -1 }))
		)
		expect(ids({}, many)).toHaveLength(50)
		expect(ids({ rows: { limit: 5000 } }, many)).toHaveLength(1000)
		expect(queryLedger(many, {}).count).toBe(1200)

		const flags = (id: string) => all.rows.find((entry) => entry.id === id)!.flags
		expect(flags('z1')).toEqual(['pending', 'reimbursable', 'review'])
		expect(flags('sp')).toEqual(['split'])
		expect(flags('p2')).toEqual(['one-off'])
		expect(flags('rf')).toEqual(['refund'])
		expect(flags('yen1')).toEqual(['other-currency'])
		expect(flags('inc')).toEqual([])
		const everything = ledgerOf([
			row({
				id: 'x',
				accountId: 'yen',
				pending: true,
				parts: [{ amount: jpy(-1) }, { amount: jpy(-1) }],
				oneOff: true,
				reimbursable: jpy(1),
				repays: 'y',
				review: 'vague',
			}),
		])
		everything.entries[0]!.lines.forEach((line) => expect(line.amount.currency).toBe('JPY'))
		expect(queryLedger(everything, {}).rows[0]!.flags).toEqual([
			'pending',
			'split',
			'one-off',
			'reimbursable',
			'refund',
			'review',
			'other-currency',
		])
	})

	it('groupBy', () => {
		const total = queryLedger(LEDGER, {}).net.minor
		const cases: [string, LedgerQuery, (string | number)[][]][] = [
			[
				'category',
				{ groupBy: ['category'] },
				[
					['none', 296800, 5],
					['dining', -2000, 1],
					['home', -2000, 1],
					['groc', -1000, 2],
					['shop', -500, 2],
				],
			],
			[
				'merchant',
				{ groupBy: ['merchant'] },
				[
					['none', 299300, 4],
					['m-jp', -3000, 2],
					['m-zelle', -2500, 1],
					['m-cafe', -2000, 1],
					['m-amz', -500, 2],
				],
			],
			[
				'account, a pair under each side',
				{ groupBy: ['account'] },
				[
					['chk', 222800, 7],
					['sav', 50000, 1],
					['card', 18500, 3],
					['yen', 0, 1],
				],
			],
			[
				'kind',
				{ groupBy: ['kind'] },
				[
					['income', 300000, 1],
					['purchase', -8500, 5],
					['transfer', -700, 2],
					['refund', 500, 1],
					['card-payment', 0, 1],
				],
			],
			[
				'month',
				{ groupBy: ['month'] },
				[
					['2026-09', 299300, 3],
					['2026-10', -8000, 7],
				],
			],
			[
				'week',
				{ groupBy: ['week'] },
				[
					['2026-09-28', 294800, 8],
					['2026-10-05', -3500, 2],
				],
			],
			[
				'week from Sunday',
				{ groupBy: ['week'], weekStart: 'sunday' },
				[
					['2026-09-27', 294300, 7],
					['2026-10-04', -3000, 3],
				],
			],
			[
				'weekday',
				{ groupBy: ['weekday'] },
				[
					['1', -1000, 2],
					['2', -3200, 2],
					['3', 300000, 1],
					['4', 0, 1],
					['5', -3000, 2],
					['6', -2000, 1],
					['7', 500, 1],
				],
			],
			[
				'day',
				{ groupBy: ['day'], filter: { from: '2026-10-04' } },
				[
					['2026-10-04', 500, 1],
					['2026-10-05', -1000, 1],
					['2026-10-06', -2500, 1],
				],
			],
			[
				'month and category',
				{ groupBy: ['month', 'category'] },
				[
					['2026-09/none', 299300, 3],
					['2026-10/none', -2500, 2],
					['2026-10/dining', -2000, 1],
					['2026-10/home', -2000, 1],
					['2026-10/groc', -1000, 2],
					['2026-10/shop', -500, 2],
				],
			],
		]
		for (const [name, query, expected] of cases) {
			expect(keys(query), name).toEqual(expected)
			if (!query.filter) {
				const sum = queryLedger(LEDGER, query).groups!.reduce((acc, group) => acc + group.net.minor, 0)
				expect(sum, name).toBe(total)
			}
		}
		const yen = queryLedger(LEDGER, { groupBy: ['account'] }).groups!.find((group) => group.key[0] === 'yen')!
		expect(yen.left).toEqual([jpy(-1200)])
		// two non-time keys: by the first key's net, then by the second's within it
		expect(keys({ groupBy: ['kind', 'account'], filter: { kinds: ['purchase', 'refund'] } })).toEqual([
			['purchase/chk', -6500, 3],
			['purchase/card', -2000, 1],
			['purchase/yen', 0, 1],
			['refund/card', 500, 1],
		])
	})

	it('versus', () => {
		const answer = queryLedger(LEDGER, {
			filter: { from: '2026-10-01', to: '2026-10-31' },
			groupBy: ['category'],
			versus: { from: '2026-09-01', to: '2026-09-30' },
		})
		expect(
			answer.versus!.map((group) => [group.key, group.now.net.minor, group.then.net.minor, group.change.minor])
		).toEqual([
			['none', -2500, 299300, -301800],
			['dining', -2000, 0, -2000],
			['home', -2000, 0, -2000],
			['groc', -1000, 0, -1000],
			['shop', -500, 0, -500],
		])
		expect(answer.versus!.map((group) => group.rows?.map((entry) => entry.id))).toEqual([
			['t-out', 'z1'],
			['p2'],
			['sp'],
			undefined,
			undefined,
		])
		expect(answer.versus![1]!.then.count).toBe(0)
		// the rows are capped at five, largest first
		const busy = ledgerOf(
			Array.from({ length: 8 }, (_, at) => row({ id: `b${at}`, minor: -(at + 1) * 100, categoryId: 'groc' }))
		)
		const capped = queryLedger(busy, { groupBy: ['category'], versus: { from: '2026-09-01', to: '2026-09-30' } })
		expect(capped.versus![0]!.rows!.map((entry) => entry.id)).toEqual(['b7', 'b6', 'b5', 'b4', 'b3'])
	})

	it('invalid queries', () => {
		const versus = { from: '2026-09-01', to: '2026-09-30' }
		const cases: [LedgerQuery, LedgerQueryError['code']][] = [
			[{ versus }, 'versus-group'],
			[{ versus, groupBy: ['month'] }, 'versus-group'],
			[{ versus, groupBy: ['category', 'merchant'] }, 'versus-group'],
			[{ filter: { from: '2026-10-02', to: '2026-10-01' } }, 'period'],
			[{ groupBy: ['category'], versus: { from: '2026-09-30', to: '2026-09-01' } }, 'period'],
			[{ filter: { atLeast: 10, atMost: 9 } }, 'amount'],
		]
		for (const [query, code] of cases) {
			let caught: unknown
			try {
				queryLedger(LEDGER, query)
			} catch (error) {
				caught = error
			}
			expect(caught, code).toBeInstanceOf(LedgerQueryError)
			expect((caught as LedgerQueryError).code).toBe(code)
		}
	})

	it('rollups', () => {
		for (const by of ['category', 'merchant', 'account'] as const) {
			const rollup = rollupOf(LEDGER, by)
			expect(rollup, by).toEqual(queryLedger(LEDGER, { groupBy: ['month', by] }).groups)
			expect(rollupOf(LEDGER, by), by).toBe(rollup)
		}
		const daily = rollupOf(LEDGER, 'day')
		expect(daily).toEqual(queryLedger(LEDGER, { groupBy: ['day'] }).groups)
		expect(rollupOf(LEDGER, 'day')).toBe(daily)
		expect(rollupOf(ledgerOf(), 'day')).not.toBe(daily)
	})

	it('typicalOf', () => {
		const months = ledgerOf([
			row({ id: 'j', minor: -1000, day: '2026-01-15', categoryId: 'groc' }),
			row({ id: 'f', minor: -2000, day: '2026-02-15', categoryId: 'groc' }),
			row({ id: 'f2', minor: -101, day: '2026-02-20', categoryId: 'dining' }),
			row({ id: 'm', minor: -3000, day: '2026-03-15', categoryId: 'groc' }),
			row({ id: 'm1', minor: -9999, day: '2026-03-16', categoryId: 'groc', oneOff: true }),
			row({ id: 'a', minor: -5000, day: '2026-04-02', categoryId: 'groc' }),
			row({ id: 'i', minor: 900000, day: '2026-02-01', kind: 'income' }),
		])
		const of = (month: string, extra: { months?: number } = {}) =>
			typicalOf(months, { month, ...extra }).map((entry) => [entry.key, entry.spending.minor])
		// the window starts at the ledger's first month: January to March
		expect(of('2026-04')).toEqual([
			['groc', -2000],
			['dining', -34],
		])
		// January and February; -50.5 rounds half away from zero
		expect(of('2026-03')).toEqual([
			['groc', -1500],
			['dining', -51],
		])
		expect(of('2026-04', { months: 1 })).toEqual([['groc', -3000]])
		expect(of('2026-01')).toEqual([])
		expect(typicalOf(ledgerOf([]), { month: '2026-04' })).toEqual([])
		expect(
			typicalOf(LEDGER, { month: '2026-11', groupBy: 'merchant' }).map((entry) => [entry.key, entry.spending.minor])
		).toEqual([
			['m-jp', -1500],
			['m-zelle', -1250],
			['m-amz', -250],
		])
	})

	it('builds and queries 20,000 rows within budget', () => {
		const words = ['coffee', 'grocer', 'fuel', 'books', 'pharmacy', 'cinema', 'bakery', 'hardware']
		const accounts = ['chk', 'card', 'sav', 'chk2', 'card2']
		const rows: Entity<TransactionPayload>[] = []
		for (let at = 0; rows.length < 20000; at += 1) {
			const day = addDays('2024-10-01', at % 730)
			const id = `r${String(at).padStart(6, '0')}`
			if (at % 25 === 0) {
				rows.push(row({ id: `${id}o`, minor: -10000, day, accountId: 'chk', kind: 'transfer', transferId: `${id}i` }))
				rows.push(row({ id: `${id}i`, minor: 10000, day, accountId: 'sav', kind: 'transfer', transferId: `${id}o` }))
				continue
			}
			const minor = -((at * 37) % 20000) - 100
			const name = `${words[at % words.length]!.toUpperCase()} STORE #${at % 97}`
			const categoryId = CATEGORIES[at % CATEGORIES.length]!.id
			rows.push(
				row({
					id,
					minor,
					day,
					name,
					accountId: accounts[at % accounts.length]!,
					merchantId: `m${at % 300}`,
					...(at % 10 === 0
						? {
								parts: [
									{ amount: usd(minor + 50), categoryId },
									{ amount: usd(-50), categoryId: 'home', note: 'household bits' },
								],
							}
						: { categoryId }),
				})
			)
		}
		const merchants = Array.from({ length: 300 }, (_, at) => ({
			id: `m${at}`,
			name: `Merchant ${at}`,
			key: `merchant ${at}`,
			rawNames: [],
		}))
		const started = performance.now()
		const big = buildLedger({ transactions: rows, accounts: ACCOUNTS, categories: CATEGORIES, merchants, home: 'USD' })
		const built = performance.now() - started
		expect(big.entries.length).toBeGreaterThan(19000)
		expect(built).toBeLessThan(1500)

		const query: LedgerQuery = { filter: { text: 'coffee' }, groupBy: ['category'] }
		queryLedger(big, query)
		const runs = 20
		const from = performance.now()
		for (let at = 0; at < runs; at += 1) queryLedger(big, query)
		const mean = (performance.now() - from) / runs
		expect(queryLedger(big, query).count).toBeGreaterThan(0)
		expect(mean).toBeLessThan(100)
	})

	it('touchedTransactions', () => {
		// a URI names a ULID
		const [d, e, f, g] = [newId(), newId(), newId(), newId()]
		const known = new Set(['b', d])
		const tx = (id: string) => toUri(FINANCE.transaction, id)
		const cases: [string, BatchOp[], string[]][] = [
			[
				'a created transaction',
				[{ op: 'createEntity', input: { id: 'a', type: FINANCE.transaction, payload: {} } }],
				['a'],
			],
			['another type created', [{ op: 'createEntity', input: { id: 'x', type: FINANCE.merchant, payload: {} } }], []],
			['a known row updated', [{ op: 'updateEntity', id: 'b', payload: {} }], ['b']],
			['an unknown row updated', [{ op: 'updateEntity', id: 'c', payload: {} }], []],
			['a transaction deleted', [{ op: 'delete', uri: tx(e) }], [e]],
			['a transaction restored', [{ op: 'restore', uri: tx(f) }], [f]],
			['another type deleted', [{ op: 'delete', uri: toUri(FINANCE.rule, g) }], []],
			[
				'each id once',
				[
					{ op: 'updateEntity', id: d, payload: {} },
					{ op: 'delete', uri: tx(d) },
					{ op: 'restore', uri: tx(d) },
					{ op: 'createEntity', input: { id: 'h', type: FINANCE.transaction, payload: {} } },
					{ op: 'updateEntity', id: 'h', payload: {} },
				],
				[d, 'h'],
			],
		]
		for (const [name, ops, expected] of cases)
			expect(
				touchedTransactions(ops, (id) => known.has(id)),
				name
			).toEqual(expected)
	})
})
