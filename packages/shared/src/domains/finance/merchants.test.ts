import { describe, expect, it } from 'vitest'
import { cleanMerchant, merchantKey, vagueOf } from './merchants.js'

describe('finance merchants', () => {
	it('cleans merchant names', () => {
		const cases: [string, string | undefined, string, string, { brand: string; counterparty?: string } | undefined][] =
			[
				['SQ *BLUE BOTTLE COFFEE', undefined, 'Blue Bottle Coffee', 'blue bottle coffee', undefined],
				['TST* JOE S PIZZA', undefined, 'Joe S Pizza', 'joe s pizza', undefined],
				['SHELL OIL 57444 #12', undefined, 'Shell Oil', 'shell oil', undefined],
				['POS DEBIT TRADER JOE S #552', undefined, 'Trader Joe S', 'trader joe s', undefined],
				['WHOLEFDS MKT 10230', 'Whole Foods Market', 'Whole Foods Market', 'whole foods market', undefined],
				['PAYPAL *NETFLIX', undefined, 'Netflix', 'netflix', undefined],
				['Uber 063015 SF**POOL**', undefined, 'Uber SF POOL', 'uber sf pool', undefined],
				[
					'Zelle payment to John Smith Conf# 1234567',
					undefined,
					'Zelle',
					'zelle',
					{ brand: 'Zelle', counterparty: 'john smith' },
				],
				['VENMO PAYMENT JANE DOE', undefined, 'Venmo', 'venmo', { brand: 'Venmo', counterparty: 'jane doe' }],
				['PAYPAL TRANSFER', undefined, 'PayPal', 'paypal', { brand: 'PayPal' }],
				[
					'CASH APP*ANA LEE*SAN FRANCISCO',
					undefined,
					'Cash App',
					'cash app',
					{ brand: 'Cash App', counterparty: 'ana lee san francisco' },
				],
				[
					'APPLE CASH SENT MONEY',
					undefined,
					'Apple Cash',
					'apple cash',
					{ brand: 'Apple Cash', counterparty: 'money' },
				],
				['12345', undefined, '12345', '12345', undefined],
			]
		for (const [name, merchantName, clean, key, vague] of cases) {
			expect(cleanMerchant(name, merchantName), name).toBe(clean)
			expect(merchantKey(cleanMerchant(name, merchantName)), name).toBe(key)
			expect(vagueOf(name) ?? vagueOf(merchantName), name).toEqual(vague)
		}
	})
})
