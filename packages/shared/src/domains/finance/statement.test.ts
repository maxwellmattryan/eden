import { describe, expect, it } from 'vitest'
import { toUri, type BatchOp, type Entity } from '../../data/index.js'
import { CHUNK } from './sync.js'
import {
	decodeText,
	defaultFlip,
	importKindOf,
	importOps,
	matchRows,
	READ_STATEMENT_REFUSAL,
	readStatementCheck,
	refusesImport,
	sameDescription,
	statementFromAnswer,
	type ImportPlan,
	type StatementRow,
} from './statement.js'
import { FINANCE, type Account, type TransactionPayload } from './types.js'
import { importDetail } from './words.js'

const usd = (minor: number) => ({ minor, currency: 'USD' })
const line = (day: string, description: string, minor: number): StatementRow => ({
	day,
	description,
	amount: usd(minor),
})
const held = (
	id: string,
	payload: Partial<TransactionPayload> & { day: string; minor: number },
	extra: Partial<Entity<TransactionPayload>> = {}
): Entity<TransactionPayload> => {
	const { minor, ...rest } = payload
	return {
		id,
		uri: toUri(FINANCE.transaction, id),
		type: FINANCE.transaction,
		payload: { accountId: 'acc', amount: usd(minor), name: 'Something', pending: false, ...rest },
		createdAt: '',
		updatedAt: '',
		deletedAt: null,
		mirror: false,
		source: 'plaid',
		externalId: id,
		snapshot: null,
		links: [],
		...extra,
	}
}

describe('sameDescription', () => {
	const cases: [string, string, boolean][] = [
		['SQ *BLUE BOTTLE COFFEE 1234', 'Blue Bottle', true],
		['WHOLEFDS MKT 10230', 'WHOLEFDS MKT', true],
		['Netflix.com', 'NETFLIX', true],
		['Shell Oil', 'Chevron', false],
		['AB', 'CD', false],
	]
	for (const [a, b, want] of cases) it(`${a} / ${b}`, () => expect(sameDescription(a, b)).toBe(want))
})

describe('matchRows', () => {
	const cases: {
		name: string
		rows: StatementRow[]
		existing: Entity<TransactionPayload>[]
		flip?: boolean
		fresh: string[]
		matched: number
	}[] = [
		{
			name: 'same Money on the same day matches, whatever the description',
			rows: [line('2025-03-14', 'Totally different', -550)],
			existing: [held('a', { day: '2025-03-14', minor: -550, name: 'BLUE BOTTLE' })],
			fresh: [],
			matched: 1,
		},
		{
			name: 'a different amount or currency does not match',
			rows: [
				line('2025-03-14', 'Coffee', -551),
				{ ...line('2025-03-14', 'Coffee', -550), amount: { minor: -550, currency: 'EUR' } },
			],
			existing: [held('a', { day: '2025-03-14', minor: -550, name: 'Coffee' })],
			fresh: ['Coffee -551', 'Coffee -550'],
			matched: 0,
		},
		{
			name: '1–3 days apart matches only when the descriptions agree',
			rows: [line('2025-03-14', 'BLUE BOTTLE COFFEE', -550), line('2025-03-14', 'Hardware store', -1000)],
			existing: [
				held('a', { day: '2025-03-16', minor: -550, name: 'SQ *BLUE BOTTLE' }),
				held('b', { day: '2025-03-15', minor: -1000, name: 'Grocer' }),
			],
			fresh: ['Hardware store -1000'],
			matched: 1,
		},
		{
			name: 'four days apart never matches',
			rows: [line('2025-03-14', 'Blue Bottle', -550)],
			existing: [held('a', { day: '2025-03-18', minor: -550, name: 'Blue Bottle' })],
			fresh: ['Blue Bottle -550'],
			matched: 0,
		},
		{
			name: 'the authorised day counts too, and so does the merchant name',
			rows: [line('2025-03-10', 'Corner Deli', -900)],
			existing: [
				held('a', {
					day: '2025-03-14',
					authorizedDay: '2025-03-11',
					minor: -900,
					name: 'POS 4471',
					merchantName: 'Corner Deli',
				}),
			],
			fresh: [],
			matched: 1,
		},
		{
			name: 'two identical coffees on one day match two rows',
			rows: [line('2025-03-14', 'Coffee', -400), line('2025-03-14', 'Coffee', -400)],
			existing: [held('a', { day: '2025-03-14', minor: -400 }), held('b', { day: '2025-03-14', minor: -400 })],
			fresh: [],
			matched: 2,
		},
		{
			name: 'two identical coffees and one row: one matches, one is new',
			rows: [line('2025-03-14', 'Coffee', -400), line('2025-03-14', 'Coffee', -400)],
			existing: [held('a', { day: '2025-03-14', minor: -400 })],
			fresh: ['Coffee -400'],
			matched: 1,
		},
		{
			name: 'rows on another account and tombstoned rows are ignored',
			rows: [line('2025-03-14', 'Coffee', -400), line('2025-03-15', 'Coffee', -400)],
			existing: [
				held('a', { day: '2025-03-14', minor: -400, accountId: 'other' }),
				held('b', { day: '2025-03-15', minor: -400 }, { deletedAt: '2025-03-16T00:00:00Z' }),
			],
			fresh: ['Coffee -400', 'Coffee -400'],
			matched: 0,
		},
		{
			name: 'a pending row is a match, of any source',
			rows: [line('2025-03-14', 'Coffee', -400)],
			existing: [held('a', { day: '2025-03-14', minor: -400, pending: true }, { source: null, externalId: null })],
			fresh: [],
			matched: 1,
		},
		{
			name: 'flip turns the signs before matching, and the fresh rows are flipped',
			rows: [line('2025-03-14', 'Uber', 2310), line('2025-03-15', 'Taxi', 1500)],
			existing: [held('a', { day: '2025-03-14', minor: -2310, name: 'UBER TRIP' })],
			flip: true,
			fresh: ['Taxi -1500'],
			matched: 1,
		},
	]
	for (const { name, rows, existing, flip, fresh, matched } of cases) {
		it(name, () => {
			const out = matchRows(rows, existing, 'acc', { flip })
			expect(out.fresh.map((row) => `${row.description} ${row.amount.minor}`)).toEqual(fresh)
			expect(out.matched).toBe(matched)
		})
	}

	it('a same-day row whose description agrees wins the tie, and each existing row is claimed once', () => {
		// the deli line takes `b`, the one that names it, so the other line still finds `a` on its day
		const rows = [line('2025-03-14', 'Corner Deli', -900), line('2025-03-14', 'Lunch', -900)]
		const existing = [
			held('a', { day: '2025-03-14', minor: -900, name: 'Bistro' }),
			held('b', { day: '2025-03-14', minor: -900, name: 'CORNER DELI 22' }),
		]
		expect(matchRows(rows, existing, 'acc')).toEqual({ fresh: [], matched: 2 })
	})
})

describe('importOps', () => {
	const ids = () => {
		let next = 0
		return () => `id${++next}`
	}
	const plan = (n: number): ImportPlan => ({
		accountId: 'acc',
		kind: 'csv',
		fingerprint: 'f'.repeat(64),
		fresh: Array.from({ length: n }, (_, at) => line('2025-01-01', `Row ${at}`, -100 - at)),
		matched: 2,
		skipped: 1,
		from: '2025-01-01',
		to: '2025-01-31',
	})
	const creates = (chunks: BatchOp[][]) =>
		chunks.flat().filter((op): op is Extract<BatchOp, { op: 'createEntity' }> => op.op === 'createEntity')

	it('creates a transaction per row and the file-import, and the inverse deletes them all', () => {
		const { chunks, inverse, fileImportId } = importOps(plan(3), ids(), '2025-02-01T10:00:00.000Z')
		expect(chunks).toHaveLength(1)
		const made = creates(chunks)
		expect(made).toHaveLength(4)
		expect(made[0]!.input).toEqual({
			id: 'id2',
			type: FINANCE.transaction,
			payload: {
				accountId: 'acc',
				amount: usd(-100),
				day: '2025-01-01',
				name: 'Row 0',
				pending: false,
				importId: 'id1',
			},
		})
		expect(made.slice(0, 3).every((op) => op.input.source === undefined && op.input.externalId === undefined)).toBe(
			true
		)
		expect(made.at(-1)!.input).toEqual({
			id: fileImportId,
			type: FINANCE.fileImport,
			source: 'file',
			externalId: 'f'.repeat(64),
			payload: {
				what: 'csv',
				accountId: 'acc',
				from: '2025-01-01',
				to: '2025-01-31',
				rows: 3,
				matched: 2,
				skipped: 1,
				at: '2025-02-01T10:00:00.000Z',
			},
		})
		const deleted = inverse.flat().map((op) => (op.op === 'delete' ? op.uri : ''))
		expect(new Set(deleted)).toEqual(new Set(made.map((op) => toUri(op.input.type, op.input.id!))))
	})

	it('1201 rows are three batches, with the file-import in the last', () => {
		const { chunks, inverse, fileImportId } = importOps(plan(1201), ids(), '2025-02-01T10:00:00.000Z')
		expect(chunks.map((chunk) => chunk.length)).toEqual([CHUNK, CHUNK, 202])
		const last = chunks.at(-1)!.at(-1)!
		expect(last.op === 'createEntity' && last.input.id).toBe(fileImportId)
		expect(inverse.flat()).toHaveLength(1202)
	})

	it('no new rows writes the file-import alone', () => {
		const { chunks } = importOps(plan(0), ids(), '2025-02-01T10:00:00.000Z')
		expect(chunks).toHaveLength(1)
		expect(creates(chunks).map((op) => op.input.type)).toEqual([FINANCE.fileImport])
	})
})

describe('statementFromAnswer', () => {
	const cases: { name: string; json: unknown; currency?: string; want: string[] | 'empty'; skipped?: number }[] = [
		{
			name: 'keeps good rows, skips and counts the rest',
			json: {
				rows: [
					{ day: '2025-03-14', description: '  Blue   Bottle ', amount: '-5.50' },
					{ day: '14/03/2025', description: 'Bad day', amount: '-1.00' },
					{ day: '2025-03-15', description: '', amount: '-1.00' },
					{ day: '2025-03-15', description: 'Bad amount', amount: 'twelve' },
					{ day: '2025-03-15', description: 'Too precise', amount: '-1.005' },
					{ day: '2025-03-16', description: 'Payroll', amount: '1,200.00' },
				],
			},
			want: ['2025-03-14 Blue Bottle -550', '2025-03-16 Payroll 120000'],
			skipped: 4,
		},
		{
			name: 'cuts a description to 200 characters',
			json: { rows: [{ day: '2025-03-14', description: 'x'.repeat(300), amount: '-1' }] },
			want: [`2025-03-14 ${'x'.repeat(200)} -100`],
		},
		{
			name: 'JPY whole yen',
			json: { rows: [{ day: '2025-03-14', description: 'Ramen', amount: '-1234' }] },
			currency: 'JPY',
			want: ['2025-03-14 Ramen -1234'],
		},
		{ name: 'nothing left is empty', json: { rows: [{ day: 'x', description: 'y', amount: 'z' }] }, want: 'empty' },
		{ name: 'not an answer is empty', json: null, want: 'empty' },
	]
	for (const { name, json, currency, want, skipped } of cases) {
		it(name, () => {
			const read = statementFromAnswer(json, currency ?? 'USD')
			if (want === 'empty') return expect(read).toEqual({ failure: 'empty' })
			if ('failure' in read) throw new Error(read.failure)
			expect(read.rows.map((row) => `${row.day} ${row.description} ${row.amount.minor}`)).toEqual(want)
			expect(read.skipped).toBe(skipped ?? 0)
			expect(read.kind).toBe('pdf')
		})
	}
})

describe('defaultFlip', () => {
	const positives = [line('2025-01-01', 'A', 100), line('2025-01-02', 'B', 200), line('2025-01-03', 'C', -300)]
	const half = [line('2025-01-01', 'A', 100), line('2025-01-02', 'B', -200)]
	const cases: [Account['kind'], StatementRow[], boolean][] = [
		['credit-card', positives, true],
		['loan', positives, true],
		['credit-card', half, false],
		['checking', positives, false],
		['credit-card', [], false],
	]
	for (const [kind, rows, want] of cases)
		it(`${kind} with ${rows.length} rows`, () => expect(defaultFlip({ kind }, rows)).toBe(want))
})

describe('files', () => {
	const file = (name: string, type = '', size = 100) => ({ name, type, size })
	it('reads the kind by extension, then MIME', () => {
		expect(importKindOf(file('a.CSV'))).toBe('csv')
		expect(importKindOf(file('a.qfx'))).toBe('ofx')
		expect(importKindOf(file('a.ofx'))).toBe('ofx')
		expect(importKindOf(file('statement', 'text/csv'))).toBe('csv')
		expect(importKindOf(file('a.pdf'))).toBe('reader')
		expect(importKindOf(file('a.jpg'))).toBe('reader')
		expect(importKindOf(file('a.heic'))).toBeUndefined()
		expect(importKindOf(file('a.txt'))).toBeUndefined()
	})
	it('refuses several, a type not taken, and too large', () => {
		expect(refusesImport([file('a.csv'), file('b.csv')])).toBe('several')
		expect(refusesImport([file('a.docx')])).toBe('unsupported')
		expect(refusesImport([file('a.csv', '', 5 * 1024 * 1024 + 1)])).toBe('too-large')
		expect(refusesImport([file('a.csv', '', 5 * 1024 * 1024)])).toBeUndefined()
		expect(refusesImport([file('a.pdf', '', 10 * 1024 * 1024 + 1)])).toBe('too-large')
		expect(refusesImport([file('a.pdf', '', 6 * 1024 * 1024)])).toBeUndefined()
		expect(refusesImport([])).toBeUndefined()
	})
	it('decodes UTF-8, falls back to Windows-1252, strips the BOM', () => {
		expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x61, 0xc3, 0xa9]))).toBe('aé')
		expect(decodeText(new Uint8Array([0x63, 0x61, 0x66, 0xe9]))).toBe('café')
		expect(decodeText(new Uint8Array([0x00, 0x01, 0x02]))).toEqual({ failure: 'unreadable' })
	})
})

describe('readStatementCheck', () => {
	it('refuses in a conversation and lets a page run through', () => {
		expect(readStatementCheck({ text: 'x', currency: 'USD' }, { threadId: 't' })).toBe(READ_STATEMENT_REFUSAL)
		expect(READ_STATEMENT_REFUSAL).toContain('Import')
		expect(readStatementCheck({ text: 'x', currency: 'USD' }, { threadId: '' })).toBeUndefined()
	})
})

describe('importDetail', () => {
	const tr = (key: string, options?: { values?: Record<string, string | number> }) =>
		`${key.split('.').at(-1)}:${JSON.stringify(options?.values ?? {})}`
	const account = { id: 'acc', name: 'Everyday', last4: '4821' } as Account
	it('names the rows and the account with its last four', () => {
		expect(importDetail({ rows: 42, accountId: 'acc' }, [account], tr)).toBe(
			'knownDetail:{"count":42,"account":"Everyday last4:{\\"last4\\":\\"4821\\"}"}'
		)
	})
})
