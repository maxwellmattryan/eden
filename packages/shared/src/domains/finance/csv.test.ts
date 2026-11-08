import { describe, expect, it } from 'vitest'
import { parseCsv, statementFromCsv } from './csv.js'
import type { StatementRead } from './statement.js'

/** A read's rows as `day description minor`, or its failure. */
function lines(read: StatementRead): string[] | string {
	if ('failure' in read) return read.failure
	return read.rows.map((row) => `${row.day} ${row.description} ${row.amount.minor}`)
}

describe('parseCsv', () => {
	it('reads RFC 4180 quoting, CRLF and a BOM', () => {
		const text = `${String.fromCharCode(0xfeff)}a,"b, with comma","c ""quoted"""\r\n1,"two\nlines",3\n`
		expect(parseCsv(text)).toEqual([
			['a', 'b, with comma', 'c "quoted"'],
			['1', 'two\nlines', '3'],
		])
	})
})

describe('statementFromCsv', () => {
	const many = (n: number) =>
		['Date,Description,Amount', ...Array.from({ length: n }, (_, at) => `2025-01-01,Row ${at},-1.00`)].join('\n')

	const cases: { name: string; text: string; currency?: string; want: string[] | string; skipped?: number }[] = [
		{
			name: 'Chase checking: Posting Date, signed Amount, a quoted description',
			text: [
				'Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #',
				'DEBIT,03/14/2025,"BLUE BOTTLE COFFEE, OAKLAND",-5.50,DEBIT_CARD,1200.00,',
				'CREDIT,03/15/2025,"ACME PAYROLL ""DIRECT""",2500.00,ACH_CREDIT,3700.00,',
			].join('\r\n'),
			want: ['2025-03-14 BLUE BOTTLE COFFEE, OAKLAND -550', '2025-03-15 ACME PAYROLL "DIRECT" 250000'],
		},
		{
			name: 'Chase card: Post Date is preferred to Transaction Date',
			text: [
				'Transaction Date,Post Date,Description,Category,Type,Amount,Memo',
				'03/12/2025,03/14/2025,WHOLEFDS MKT 10230,Groceries,Sale,-84.12,',
				'03/18/2025,03/19/2025,Payment Thank You-Mobile,,Payment,1200.00,',
			].join('\n'),
			want: ['2025-03-14 WHOLEFDS MKT 10230 -8412', '2025-03-19 Payment Thank You-Mobile 120000'],
		},
		{
			name: 'Amex-style: charges positive, as written (the flip is the review step’s)',
			text: ['Date,Description,Amount', '03/14/25,UBER TRIP,23.10', '03/15/25,AUTOPAY PAYMENT,-500.00'].join('\n'),
			want: ['2025-03-14 UBER TRIP 2310', '2025-03-15 AUTOPAY PAYMENT -50000'],
		},
		{
			name: 'debit and credit columns: a debit is money out',
			text: [
				'Date,Payee,Withdrawals,Deposits,Balance',
				'2025/02/01,Rent,1500.00,,100.00',
				'2025/02/02,Refund,,12.00,112.00',
				'2025/02/03,Fee,(3.00),,109.00',
			].join('\n'),
			want: ['2025-02-01 Rent -150000', '2025-02-02 Refund 1200', '2025-02-03 Fee -300'],
		},
		{
			name: 'a semicolon delimiter, brackets, CR/DR and spaces in headers',
			text: [
				'Transaction  date;Transaction Description;Transaction Amount',
				'2025-04-01;Bakery;(4.20)',
				'2025-04-02;Interest;1.05 CR',
				'2025-04-03;Card;9.99DR',
			].join('\n'),
			want: ['2025-04-01 Bakery -420', '2025-04-02 Interest 105', '2025-04-03 Card -999'],
		},
		{
			name: 'a tab delimiter',
			text: ['Date\tMemo\tAmount', '2025-05-01\tCoffee\t-3.00'].join('\n'),
			want: ['2025-05-01 Coffee -300'],
		},
		{
			name: 'preamble lines before the header',
			text: [
				'Account Name : Everyday',
				'Account Number : XXXX4821',
				'Date Range : 2025-01-01 to 2025-01-31',
				'',
				'Date,Description,Amount',
				'1/5/2025,Groceries,-40.00',
			].join('\n'),
			want: ['2025-01-05 Groceries -4000'],
		},
		{
			name: 'a D/M file: one first part over 12 turns the whole file',
			text: ['Date,Description,Amount', '03/04/2025,Early,-1.00', '25/04/2025,Late,-2.00'].join('\n'),
			want: ['2025-04-03 Early -100', '2025-04-25 Late -200'],
		},
		{
			name: 'bad lines are skipped and counted, not a failure',
			text: [
				'Date,Description,Amount',
				'2025-01-01,Good,-1.00',
				'not a date,Bad date,-1.00',
				'2025-02-30,No such day,-1.00',
				'2025-01-02,Bad amount,abc',
				'2025-01-03,,-1.00',
				'',
			].join('\n'),
			want: ['2025-01-01 Good -100'],
			skipped: 4,
		},
		{
			name: 'JPY: whole yen read exactly, a fraction skipped',
			text: [
				'Date,Description,Amount',
				'2025-01-01,Ramen,-1234',
				'2025-01-02,Odd,-1234.50',
				'2025-01-03,Gift,"1,000"',
			].join('\n'),
			currency: 'JPY',
			want: ['2025-01-01 Ramen -1234', '2025-01-03 Gift 1000'],
			skipped: 1,
		},
		{ name: 'no header in the first eleven lines', text: 'a,b,c\n1,2,3\n', want: 'no-columns' },
		{
			name: 'a header past ten preamble lines',
			text: [...Array.from({ length: 11 }, (_, at) => `line ${at}`), 'Date,Description,Amount', '2025-01-01,X,-1'].join(
				'\n'
			),
			want: 'no-columns',
		},
		{ name: 'a header and no rows', text: 'Date,Description,Amount\r\n\r\n', want: 'no-rows' },
		{ name: '5000 rows are taken', text: many(5000), want: 'ok' },
		{ name: 'more than 5000 rows', text: many(5001), want: 'too-many' },
	]

	for (const { name, text, currency, want, skipped } of cases) {
		it(name, () => {
			const read = statementFromCsv(text, currency ?? 'USD')
			if (want === 'ok') {
				expect('failure' in read).toBe(false)
				return
			}
			expect(lines(read)).toEqual(want)
			if (typeof want !== 'string' && !('failure' in read)) {
				expect(read.kind).toBe('csv')
				expect(read.skipped).toBe(skipped ?? 0)
				expect(read.from).toBe(read.rows.map((row) => row.day).sort()[0])
				expect(read.rows.every((row) => row.amount.currency === (currency ?? 'USD'))).toBe(true)
			}
		})
	}
})
