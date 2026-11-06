import { describe, expect, it } from 'vitest'
import { AMOUNT_MASK, amountText } from './amounts.js'

describe('amountText', () => {
	const rows: [string, boolean, string][] = [
		['$1.00', true, '•••••'],
		['$1,234,567.89', true, '•••••'],
		['', true, '•••••'],
		['$1.00', false, '$1.00'],
		['$1,234,567.89', false, '$1,234,567.89'],
	]

	it.each(rows)('writes %j hidden=%s as %j', (text, hidden, expected) => {
		expect(amountText(text, hidden)).toBe(expected)
	})

	it('masks with five bullets', () => {
		expect([...AMOUNT_MASK]).toEqual(['•', '•', '•', '•', '•'])
	})
})
