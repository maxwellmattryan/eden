import { describe, expect, it } from 'vitest'
import { toUri, type Entity } from '../../data/index.js'
import {
	againstTypical,
	bucketOf,
	chipKey,
	filterOf,
	inOutByMonth,
	kindTone,
	liveChips,
	rowTitle,
	rowWords,
	spendingSeries,
	toggledChip,
	topMerchantOptions,
	topMerchants,
	withChip,
	withoutChip,
	type ActivityChip,
} from './activity.js'
import { buildLedger, queryLedger, type LedgerRow, type TxFilter } from './ledger.js'
import {
	FINANCE,
	TX_KINDS,
	WHOLE,
	type Account,
	type Category,
	type Merchant,
	type TransactionPayload,
} from './types.js'

const usd = (minor: number) => ({ minor, currency: 'USD' })
const CONTEXT = { home: 'USD', locale: 'en', today: '2026-10-15' }

const account = (id: string, kind: Account['kind'], linkId?: string): Account => ({
	id,
	name: id,
	kind,
	currency: 'USD',
	share: WHOLE,
	...(linkId ? { linkId } : {}),
})
const ACCOUNTS = [
	account('chk', 'checking', 'L1'),
	account('card', 'credit-card', 'L1'),
	account('sav', 'savings', 'L2'),
]
const CATEGORIES: Category[] = ['groc', 'dining', 'home', 'shop'].map((id) => ({
	id,
	name: id,
	group: 'variable',
	essential: false,
}))
const MERCHANTS: Merchant[] = [
	{ id: 'm-amz', name: 'Amazon', key: 'amazon', rawNames: [] },
	{ id: 'm-cafe', name: 'Café', key: 'cafe', rawNames: [] },
	{ id: 'm-shop', name: 'Shop', key: 'shop', rawNames: [] },
	{ id: 'm-zelle', name: 'Zelle', key: 'zelle', vague: 'Zelle', rawNames: [] },
]

type Fields = Partial<TransactionPayload> & { id: string; minor: number }
const row = ({ id, minor, ...fields }: Fields): Entity<TransactionPayload> => ({
	id,
	uri: toUri(FINANCE.transaction, id),
	type: FINANCE.transaction,
	payload: {
		accountId: 'chk',
		amount: usd(minor),
		day: '2026-10-01',
		name: id.toUpperCase(),
		pending: false,
		kind: minor > 0 ? 'refund' : 'purchase',
		...fields,
	},
	createdAt: '',
	updatedAt: '',
	deletedAt: null,
	mirror: false,
	source: 'plaid',
	externalId: id,
	snapshot: null,
	links: [],
})
const ledgerOf = (rows: Entity<TransactionPayload>[]) =>
	buildLedger({ transactions: rows, accounts: ACCOUNTS, categories: CATEGORIES, merchants: MERCHANTS, home: 'USD' })

/** The tr of a test: the key and its values, so a row's words read as their keys. */
const tr = (key: string, options?: { values?: Record<string, string | number> }) =>
	options?.values ? `${key.split('.').pop()}(${Object.values(options.values).join(',')})` : key.split('.').pop()!

describe('activity', () => {
	it('filterOf', () => {
		const cases: [string, ActivityChip[], string, TxFilter][] = [
			['nothing', [], '', {}],
			[
				'a preset becomes its period',
				[{ group: 'when', preset: 'this-month' }],
				'',
				{ from: '2026-10-01', to: '2026-10-15' },
			],
			[
				'a range becomes its days',
				[{ group: 'when', from: '2026-09-01', to: '2026-09-10' }],
				'',
				{ from: '2026-09-01', to: '2026-09-10' },
			],
			[
				'Where is any of accounts and links',
				[
					{ group: 'where', accountId: 'card' },
					{ group: 'where', linkId: 'L2' },
				],
				'',
				{ accountIds: ['card'], linkIds: ['L2'] },
			],
			[
				'What by category, merchant and kind',
				[
					{ group: 'what', categoryId: 'groc' },
					{ group: 'what', categoryId: 'dining' },
					{ group: 'what', merchantId: 'm-amz' },
					{ group: 'what', kind: 'fee' },
				],
				'',
				{ categoryIds: ['groc', 'dining'], merchantIds: ['m-amz'], kinds: ['fee'] },
			],
			['pending alone', [{ group: 'state', state: 'pending' }], '', { pending: true }],
			['posted alone', [{ group: 'state', state: 'posted' }], '', { pending: false }],
			[
				'pending and posted is no pending filter',
				[
					{ group: 'state', state: 'pending' },
					{ group: 'state', state: 'posted' },
				],
				'',
				{},
			],
			[
				'the other states all narrow',
				(['recurring', 'bill', 'one-off', 'reimbursable', 'uncategorised'] as const).map((state) => ({
					group: 'state' as const,
					state,
				})),
				'',
				{ recurring: true, bill: true, oneOff: true, reimbursable: true, uncategorised: true },
			],
			[
				'amount chips',
				[
					{ group: 'amount', side: 'over', minor: 1000 },
					{ group: 'amount', side: 'under', minor: 5000 },
				],
				'',
				{ atLeast: 1000, atMost: 5000 },
			],
			[
				'amount chips intersect the search bounds',
				[
					{ group: 'amount', side: 'over', minor: 1000 },
					{ group: 'amount', side: 'under', minor: 5000 },
				],
				'coffee >20 <100',
				{ text: 'coffee', atLeast: 2001, atMost: 5000 },
			],
			['the search alone', [], 'café >=5', { text: 'café', atLeast: 500 }],
			[
				'a contradiction stands, for the query to refuse',
				[{ group: 'amount', side: 'under', minor: 10000 }],
				'>500',
				{ atLeast: 50001, atMost: 10000 },
			],
		]
		for (const [name, chips, search, expected] of cases)
			expect(filterOf(chips, search, CONTEXT), name).toEqual(expected)

		// a chip naming a gone account, link, category or merchant is dropped before the filter is made
		const known = { accountIds: ['chk'], linkIds: ['L1'], categoryIds: ['groc'], merchantIds: ['m-amz'] }
		const chips: ActivityChip[] = [
			{ group: 'where', accountId: 'chk' },
			{ group: 'where', accountId: 'gone' },
			{ group: 'where', linkId: 'L9' },
			{ group: 'what', categoryId: 'groc' },
			{ group: 'what', categoryId: 'gone' },
			{ group: 'what', merchantId: 'm-gone' },
			{ group: 'what', kind: 'fee' },
		]
		expect(filterOf(liveChips(chips, known), '', CONTEXT)).toEqual({
			accountIds: ['chk'],
			categoryIds: ['groc'],
			kinds: ['fee'],
		})
	})

	it('session chips', () => {
		const thisMonth: ActivityChip = { group: 'when', preset: 'this-month' }
		const range: ActivityChip = { group: 'when', from: '2026-09-01', to: '2026-09-30' }
		const chase: ActivityChip = { group: 'where', accountId: 'card' }
		const dining: ActivityChip = { group: 'what', categoryId: 'dining' }
		const over = (minor: number): ActivityChip => ({ group: 'amount', side: 'over', minor })

		// a When chip replaces any other When chip, in place
		expect(withChip([thisMonth, chase], range)).toEqual([range, chase])
		expect(withChip([chase], { group: 'when', preset: 'this-year' })).toEqual([
			chase,
			{ group: 'when', preset: 'this-year' },
		])
		// an amount side replaces that side only
		const under: ActivityChip = { group: 'amount', side: 'under', minor: 9000 }
		expect(withChip([over(100), under], over(200))).toEqual([over(200), under])
		// any other chip is added once
		expect(withChip([chase, dining], chase)).toEqual([chase, dining])
		// toggling the same chip twice leaves the list as it was
		for (const chip of [thisMonth, chase, dining, over(500)]) {
			const start = chip.group === 'when' ? [dining] : [range, dining]
			expect(toggledChip(toggledChip(start, chip), chip), chipKey(chip)).toEqual(start)
		}
		// toggling another preset swaps it in; toggling the one on takes it off
		expect(toggledChip([thisMonth], { group: 'when', preset: 'last-month' })).toEqual([
			{ group: 'when', preset: 'last-month' },
		])
		expect(toggledChip([thisMonth], thisMonth)).toEqual([])
		expect(withoutChip([chase, dining], chipKey(chase))).toEqual([dining])
		expect([thisMonth, range, chase, dining, over(1), under].map(chipKey)).toEqual([
			'when',
			'when',
			'where:account:card',
			'what:category:dining',
			'amount:over',
			'amount:under',
		])
	})

	it('row words', () => {
		const ledger = ledgerOf([
			row({ id: 't-out', minor: -50000, kind: 'transfer', transferId: 't-in' }),
			row({ id: 't-in', minor: 50000, accountId: 'sav', kind: 'transfer', transferId: 't-out' }),
			row({ id: 'z', minor: -2500, merchantId: 'm-zelle', counterparty: 'Jane Doe', pending: true }),
			row({
				id: 'a',
				minor: -1200,
				merchantId: 'm-amz',
				categoryId: 'shop',
				oneOff: true,
				recurringId: 'r',
				billId: 'b',
				reimbursable: usd(500),
			}),
			row({ id: 'n', minor: -300, name: 'POS 1234' }),
			row({
				id: 's',
				minor: -3000,
				merchantId: 'm-shop',
				parts: [
					{ amount: usd(-1000), categoryId: 'groc' },
					{ amount: usd(-2000), categoryId: 'home' },
				],
			}),
			row({ id: 'i', minor: 300000, kind: 'income', name: 'PAYROLL' }),
		])
		const rows = new Map(queryLedger(ledger, { rows: { limit: 100 } }).rows.map((entry) => [entry.id, entry]))
		const words = {
			tr,
			money: (amount: { minor: number }) => String(amount.minor),
			categoryName: (id: string) => `cat-${id}`,
		}
		const cases: [string, string, string][] = [
			['t-out', 'transfer', 'transfer'],
			['z', 'Jane Doe', 'purchase · pending'],
			['a', 'Amazon', 'purchase · cat-shop · one-off · recurring · bill · paidBack(500)'],
			['n', 'POS 1234', 'purchase'],
			['s', 'Shop', 'purchase · split'],
			['i', 'PAYROLL', 'income'],
		]
		for (const [id, title, second] of cases) {
			const entry = rows.get(id) as LedgerRow
			expect(rowTitle(entry, tr), id).toBe(title)
			expect(rowWords(entry, words), id).toBe(second)
		}
		const tones = Object.fromEntries(TX_KINDS.map((kind) => [kind, kindTone(kind)]))
		expect(tones).toMatchObject({
			'interest-charged': 'cost',
			fee: 'cost',
			income: 'earned',
			'interest-earned': 'earned',
			dividend: 'earned',
			purchase: 'plain',
			refund: 'plain',
			transfer: 'plain',
			'card-payment': 'plain',
			'bill-payment': 'plain',
		})
	})

	it('insights', () => {
		const ledger = ledgerOf([
			// four complete months before October, then October
			row({ id: 'j1', minor: -6000, day: '2026-06-10', categoryId: 'groc', merchantId: 'm-shop' }),
			row({ id: 'j2', minor: -2000, day: '2026-07-10', categoryId: 'groc', merchantId: 'm-shop' }),
			row({ id: 'a1', minor: -4000, day: '2026-08-10', categoryId: 'dining', merchantId: 'm-cafe' }),
			row({ id: 's1', minor: -4000, day: '2026-09-10', categoryId: 'groc', merchantId: 'm-shop' }),
			row({ id: 's2', minor: 300000, day: '2026-09-30', kind: 'income', name: 'PAYROLL' }),
			row({ id: 'o1', minor: -1500, day: '2026-10-02', categoryId: 'groc', merchantId: 'm-shop' }),
			row({ id: 'o2', minor: -2500, day: '2026-10-05', categoryId: 'dining', merchantId: 'm-cafe' }),
			row({ id: 'o3', minor: -9000, day: '2026-10-06', categoryId: 'home', merchantId: 'm-amz', oneOff: true }),
			row({ id: 'o4', minor: -700, day: '2026-10-07', categoryId: 'shop', merchantId: 'm-amz' }),
			row({ id: 'o5', minor: -100, day: '2026-10-08' }),
			row({ id: 'o6', minor: -50000, day: '2026-10-09', kind: 'transfer', transferId: 'o7' }),
			row({ id: 'o7', minor: 50000, day: '2026-10-09', accountId: 'sav', kind: 'transfer', transferId: 'o6' }),
		])

		// the bucket is week at 92 days or fewer, else month
		expect(bucketOf({})).toBe('month')
		expect(bucketOf({ from: '2026-01-01', to: '2026-04-02' })).toBe('week')
		expect(bucketOf({ from: '2026-01-01', to: '2026-04-03' })).toBe('month')

		const options = { weekStart: 'monday' as const, otherLabel: 'else', categoryName: (id: string) => `cat-${id}` }
		const months = spendingSeries(ledger, {}, options)
		expect(months.bucket).toBe('month')
		expect(months.labels).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10'])
		expect(months.series.map((one) => [one.id, one.label, one.values])).toEqual([
			['groc', 'cat-groc', [6000, 2000, 0, 4000, 1500]],
			['home', 'cat-home', [0, 0, 0, 0, 9000]],
			['else', 'else', [0, 0, 4000, 0, 3300]],
		])
		const weeks = spendingSeries(ledger, { from: '2026-10-01', to: '2026-10-15' }, options)
		expect(weeks.bucket).toBe('week')
		expect(weeks.labels).toEqual(['2026-09-28', '2026-10-05', '2026-10-12'])
		expect(weeks.series.map((one) => [one.id, one.values])).toEqual([
			['home', [0, 9000, 0]],
			['dining', [0, 2500, 0]],
			['else', [1500, 800, 0]],
		])
		expect(spendingSeries(ledger, { kinds: ['income'] }, options).series).toEqual([])

		// five merchants at most, by spending, with none left out; the average leaves one-offs out
		const merchants = topMerchants(ledger, {})
		expect(merchants.map((entry) => [entry.merchantId, entry.count, entry.average?.minor, entry.total.minor])).toEqual([
			['m-shop', 4, 3375, 13500],
			['m-amz', 2, 700, 9700],
			['m-cafe', 2, 3250, 6500],
		])
		const many = ledgerOf(
			Array.from({ length: 7 }, (_, at) =>
				row({ id: `m${at}`, minor: -100 * (at + 1), merchantId: `x${at}`, categoryId: 'shop' })
			)
		)
		expect(topMerchants(many, {}).map((entry) => entry.merchantId)).toEqual(['x6', 'x5', 'x4', 'x3', 'x2'])

		// against typical: October under the filter, with the mean of June to September
		const typical = againstTypical(ledger, {}, '2026-10-15')!
		expect(typical.month).toBe('2026-10')
		expect(
			typical.rows.map((entry) => [entry.categoryId, entry.now.minor, entry.typical?.minor, entry.change.minor])
		).toEqual([
			['home', 9000, undefined, 9000],
			['dining', 2500, 1000, 1500],
			['groc', 1500, 3000, -1500],
			['shop', 700, undefined, 700],
			['none', 100, undefined, 100],
		])
		// the filter's period names the month, and the filter narrows both sides
		const september = againstTypical(
			ledger,
			{ from: '2026-09-01', to: '2026-09-30', categoryIds: ['groc'] },
			'2026-10-15'
		)!
		expect(september.month).toBe('2026-09')
		expect(september.rows.map((entry) => [entry.categoryId, entry.now.minor, entry.typical?.minor])).toEqual([
			['groc', 4000, 2667],
		])
		// nothing with no complete month before
		expect(againstTypical(ledger, { from: '2026-06-01', to: '2026-06-30' }, '2026-10-15')).toBeUndefined()

		// in and out: newest first, at most 12 months
		expect(
			inOutByMonth(ledger, {}).map((entry) => [entry.month, entry.in.minor, entry.out.minor, entry.net.minor])
		).toEqual([
			['2026-10', 0, 13800, -13800],
			['2026-09', 300000, 4000, 296000],
			['2026-08', 0, 4000, -4000],
			['2026-07', 0, 2000, -2000],
			['2026-06', 0, 6000, -6000],
		])
		const year = ledgerOf(
			Array.from({ length: 14 }, (_, at) =>
				row({
					id: `y${at}`,
					minor: -100,
					day: `${2025 + Math.floor(at / 12)}-${String((at % 12) + 1).padStart(2, '0')}-05`,
				})
			)
		)
		const last = inOutByMonth(year, {})
		expect(last).toHaveLength(12)
		expect([last[0]!.month, last.at(-1)!.month]).toEqual(['2026-02', '2025-03'])

		// the popover's merchants: most entries first, ties by name
		expect(topMerchantOptions(ledger, 2)).toEqual([
			{ merchantId: 'm-shop', name: 'Shop' },
			{ merchantId: 'm-amz', name: 'Amazon' },
		])
	})
})
