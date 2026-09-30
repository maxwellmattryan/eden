import { describe, expect, it } from 'vitest'
import { scrub, scrubValue } from './scrub.js'

describe('scrub', () => {
	it('replaces emails', () => {
		expect(scrub('write to rowan.reyes+eden@example.co.uk today')).toEqual({
			text: 'write to [email] today',
			hits: { emails: 1, phones: 0, accounts: 0 },
		})
	})

	it('replaces phone numbers in the shapes people write them', () => {
		for (const phone of ['+1 512 555 0134', '(512) 555-0134', '512-555-0134', '090-1234-5678', '+81 90 1234 5678']) {
			expect(scrub(`call ${phone} first`), phone).toEqual({
				text: 'call [phone] first',
				hits: { emails: 0, phones: 1, accounts: 0 },
			})
		}
	})

	it('replaces account-like numbers', () => {
		expect(scrub('card 1234 5678 9012 3456, ok')).toEqual({
			text: 'card [number], ok',
			hits: { emails: 0, phones: 0, accounts: 1 },
		})
		expect(scrub('IBAN DE89 3704 0044 0532 0130 00.')).toEqual({
			text: 'IBAN [number].',
			hits: { emails: 0, phones: 0, accounts: 1 },
		})
		expect(scrub('member 123456789')).toEqual({
			text: 'member [number]',
			hits: { emails: 0, phones: 0, accounts: 1 },
		})
	})

	it('leaves dates, times, stamps, ids and short numbers alone', () => {
		const kept = [
			'due 2026-09-30',
			'at 2026-09-30T09:00:00Z',
			'at 09:40 or 9:40 pm',
			'01J9ZQ4M3T8R5V2X7Y6W1B0CDE',
			'000001a0c4506c00-00000001-000000ab',
			'serves 2, 500 g, 3 recipes, room 1420',
			'in 1999 and 2026',
		]
		for (const text of kept) {
			expect(scrub(text), text).toEqual({ text, hits: { emails: 0, phones: 0, accounts: 0 } })
		}
	})

	it('is idempotent', () => {
		const once = scrub('mail a@b.io or call 512-555-0134 about 1234 5678 9012 3456')
		expect(once.hits).toEqual({ emails: 1, phones: 1, accounts: 1 })
		expect(scrub(once.text)).toEqual({ text: once.text, hits: { emails: 0, phones: 0, accounts: 0 } })
	})

	it('scrubs every string of a JSON value and nothing else', () => {
		expect(
			scrubValue({
				name: 'a@b.io',
				tags: ['512-555-0134', 7],
				nested: { note: 'fine', due: '2026-09-30' },
				n: 12345678,
				none: null,
			})
		).toEqual({
			name: '[email]',
			tags: ['[phone]', 7],
			nested: { note: 'fine', due: '2026-09-30' },
			n: 12345678,
			none: null,
		})
	})
})
