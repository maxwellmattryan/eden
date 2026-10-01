import { describe, expect, it } from 'vitest'
import { decodeEntities, emlToText, htmlToText } from './sources.js'

describe("Hearth's text sources", () => {
	it('keeps the words of a page and drops what is not shown', () => {
		const html = `<html><head><title>x</title><style>p{}</style></head><body><script>var a = '<p>no</p>'</script>
			<h1>Your order</h1><table><tr><td>Bananas</td><td>2&nbsp;lb</td></tr><tr><td>Eggs &amp; more</td><td>12</td></tr></table>
			<p>Total: &#36;18.40<br>Thanks</p></body></html>`
		expect(htmlToText(html)).toBe('Your order\nBananas 2 lb\nEggs & more 12\n\nTotal: $18.40\nThanks')
	})

	it('cuts a page to its cap', () => {
		expect(htmlToText('<p>abcdefghij</p>', 4)).toBe('abcd')
	})

	it('decodes named and numbered entities and leaves the rest', () => {
		expect(decodeEntities('&frac12; cup &#x41;&#66; &unknown;')).toBe('½ cup AB &unknown;')
	})

	it('reads a plain email with its subject, sender and date', () => {
		const eml = [
			'Subject: =?UTF-8?B?WW91ciBILUUtQiBvcmRlcg==?=',
			'From: H-E-B <orders@heb.com>',
			'Date: Tue, 29 Sep 2026 18:12:00 -0500',
			'Content-Type: text/plain; charset=utf-8',
			'',
			'Bananas 2 lb',
			'Eggs 12',
		].join('\r\n')
		expect(emlToText(eml)).toBe(
			'Subject: Your H-E-B order\nFrom: H-E-B <orders@heb.com>\nDate: Tue, 29 Sep 2026 18:12:00 -0500\n\nBananas 2 lb\nEggs 12'
		)
	})

	it('reads the HTML part when the plain one says almost nothing', () => {
		const eml = [
			'Subject: Order',
			'Content-Type: multipart/alternative; boundary="b1"',
			'',
			'--b1',
			'Content-Type: text/plain',
			'',
			'View in browser',
			'--b1',
			'Content-Type: text/html; charset="utf-8"',
			'Content-Transfer-Encoding: quoted-printable',
			'',
			'<table><tr><td>Jalape=C3=B1os</td><td>3</td></tr><tr><td>Greek yogurt 500 g</td><td>1</td></tr><tr><td>Short-grain =',
			'rice 2 kg</td><td>1</td></tr></table>',
			'--b1--',
			'',
		].join('\n')
		expect(emlToText(eml)).toBe('Subject: Order\n\nJalapeños 3\nGreek yogurt 500 g 1\nShort-grain rice 2 kg 1')
	})

	it('reads a base64 part and skips an attached file', () => {
		const eml = [
			'Content-Type: multipart/mixed; boundary=xyz',
			'',
			'--xyz',
			'Content-Type: text/plain; charset=utf-8',
			'Content-Transfer-Encoding: base64',
			'',
			btoa('Limes 4\nGinger 1'),
			'--xyz',
			'Content-Type: text/plain; name="notes.txt"',
			'Content-Disposition: attachment; filename="notes.txt"',
			'',
			'not this',
			'--xyz--',
		].join('\n')
		expect(emlToText(eml)).toBe('Limes 4\nGinger 1')
	})
})
