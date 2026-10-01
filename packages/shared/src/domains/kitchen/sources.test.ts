import { describe, expect, it } from 'vitest'
import { emlToText } from './sources.js'

describe("Hearth's text sources", () => {
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
