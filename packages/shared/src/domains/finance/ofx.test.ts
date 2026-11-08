import { describe, expect, it } from 'vitest'
import { statementFromOfx } from './ofx.js'

const SGML_HEADER = [
	'OFXHEADER:100',
	'DATA:OFXSGML',
	'VERSION:102',
	'SECURITY:NONE',
	'ENCODING:USASCII',
	'CHARSET:1252',
	'',
].join('\r\n')

const ACCOUNT = '000123454821'

const sgmlBank = (currency = 'USD', amounts = ['-5.50', '2500.00']) =>
	`${SGML_HEADER}
<OFX>
<SIGNONMSGSRSV1><SONRS><STATUS><CODE>0<SEVERITY>INFO</STATUS><DTSERVER>20250401</SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><TRNUID>1<STMTRS>
<CURDEF>${currency}
<BANKACCTFROM><BANKID>121000248<ACCTID>${ACCOUNT}<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST><DTSTART>20250301<DTEND>20250331
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20250314120000[-5:EST]<TRNAMT>${amounts[0]}<FITID>A1<NAME>BLUE BOTTLE &amp; CO
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20250315<TRNAMT>${amounts[1]}<FITID>A2<MEMO>ACME PAYROLL
</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20250315<TRNAMT>${amounts[1]}<FITID>A2<MEMO>ACME PAYROLL
</BANKTRANLIST>
<LEDGERBAL><BALAMT>1200.00<DTASOF>20250331</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>
`

const xmlCard = `<?xml version="1.0" encoding="UTF-8"?>
<?OFX OFXHEADER="200" VERSION="220" SECURITY="NONE" OLDFILEUID="NONE" NEWFILEUID="NONE"?>
<OFX>
  <CREDITCARDMSGSRSV1>
    <CCSTMTTRNRS>
      <CCSTMTRS>
        <CURDEF>USD</CURDEF>
        <CCACCTFROM><ACCTID>4111222233339022</ACCTID></CCACCTFROM>
        <BANKTRANLIST>
          <STMTTRN>
            <TRNTYPE>DEBIT</TRNTYPE>
            <DTPOSTED>20250320000000.000</DTPOSTED>
            <TRNAMT>-84,12</TRNAMT>
            <FITID>C1</FITID>
            <NAME>Ben &lt;&amp;&gt; Jerry&apos;s &quot;Scoop&quot;</NAME>
          </STMTTRN>
          <STMTTRN>
            <TRNTYPE>CREDIT</TRNTYPE>
            <DTPOSTED>bad</DTPOSTED>
            <TRNAMT>10.00</TRNAMT>
            <FITID>C2</FITID>
            <NAME>No day</NAME>
          </STMTTRN>
        </BANKTRANLIST>
      </CCSTMTRS>
    </CCSTMTTRNRS>
  </CREDITCARDMSGSRSV1>
</OFX>`

describe('statementFromOfx', () => {
	it('reads OFX 1.x SGML with unclosed tags, MEMO for a missing NAME and a duplicate FITID once', () => {
		const read = statementFromOfx(sgmlBank(), 'USD')
		if ('failure' in read) throw new Error(read.failure)
		expect(read.rows).toEqual([
			{ day: '2025-03-14', description: 'BLUE BOTTLE & CO', amount: { minor: -550, currency: 'USD' }, fitId: 'A1' },
			{ day: '2025-03-15', description: 'ACME PAYROLL', amount: { minor: 250000, currency: 'USD' }, fitId: 'A2' },
		])
		expect(read).toMatchObject({ kind: 'ofx', skipped: 0, from: '2025-03-14', to: '2025-03-15', last4: '4821' })
	})

	it('reads OFX 2.x XML, decodes entities and a comma decimal, and skips a bad line', () => {
		const read = statementFromOfx(xmlCard, 'USD')
		if ('failure' in read) throw new Error(read.failure)
		expect(read.rows).toEqual([
			{
				day: '2025-03-20',
				description: 'Ben <&> Jerry\'s "Scoop"',
				amount: { minor: -8412, currency: 'USD' },
				fitId: 'C1',
			},
		])
		expect(read.skipped).toBe(1)
		expect(read.last4).toBe('9022')
	})

	it('never carries the whole account number', () => {
		const read = statementFromOfx(sgmlBank(), 'USD')
		expect(JSON.stringify(read)).not.toContain(ACCOUNT)
		expect(JSON.stringify(statementFromOfx(xmlCard, 'USD'))).not.toContain('4111222233339022')
	})

	it('refuses a CURDEF other than the account’s currency', () => {
		expect(statementFromOfx(sgmlBank('EUR'), 'USD')).toEqual({ failure: 'currency' })
	})

	it('refuses a file with two statements', () => {
		const two = xmlCard.replace(
			'</CREDITCARDMSGSRSV1>',
			'<BANKMSGSRSV1><STMTRS></STMTRS></BANKMSGSRSV1></CREDITCARDMSGSRSV1>'
		)
		expect(statementFromOfx(two, 'USD')).toEqual({ failure: 'several-accounts' })
	})

	it('reads JPY exactly and skips a fraction', () => {
		const read = statementFromOfx(sgmlBank('JPY', ['-1234', '1234.50']), 'JPY')
		if ('failure' in read) throw new Error(read.failure)
		expect(read.rows.map((row) => row.amount)).toEqual([{ minor: -1234, currency: 'JPY' }])
		expect(read.skipped).toBe(1)
	})

	it('says unreadable for text with no OFX in it, and no-rows for no transaction', () => {
		expect(statementFromOfx('hello', 'USD')).toEqual({ failure: 'unreadable' })
		expect(statementFromOfx('<OFX><BANKMSGSRSV1><STMTRS><CURDEF>USD</STMTRS></OFX>', 'USD')).toEqual({
			failure: 'no-rows',
		})
	})
})
