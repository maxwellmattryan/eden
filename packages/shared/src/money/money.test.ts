import { describe, expect, it } from 'vitest'
import {
	addMoney,
	currencyOptions,
	decimalsOf,
	formatMoney,
	isCurrency,
	money,
	negate,
	parseMoney,
	shareOf,
	sumMoney,
	toDecimal,
	type MoneyParseError,
} from './money.js'
import vectors from './money.vectors.json'

type ParseCase = { text: string; locale: string; currency: string; minor?: number; error?: MoneyParseError }
type FormatCase = { minor: number; currency: string; locale: string; sign?: 'auto' | 'never' | 'exceptZero'; formatted: string }

describe('money vectors', () => {
	it.each(vectors.decimals)('$currency has $decimals decimals', ({ currency, decimals }) => {
		expect(decimalsOf(currency)).toBe(decimals)
	})

	it.each(vectors.parse as ParseCase[])('parses "$text" in $currency ($locale)', (vector) => {
		const parsed = parseMoney(vector.text, vector.currency, vector.locale)
		if (vector.error) expect(parsed).toEqual({ error: vector.error })
		else expect(parsed).toEqual({ minor: vector.minor, currency: vector.currency })
	})

	it.each(vectors.format as FormatCase[])('formats $minor $currency ($locale)', (vector) => {
		const formatted = formatMoney({ minor: vector.minor, currency: vector.currency }, vector.locale, {
			sign: vector.sign,
		})
		// the engine may write a narrow or a plain no-break space; the vectors hold a plain space
		expect(formatted.replace(/\s/g, ' ')).toBe(vector.formatted)
	})
})

describe('money', () => {
	it('writes an exact decimal string', () => {
		expect(toDecimal({ minor: -4217, currency: 'USD' })).toBe('-42.17')
		expect(toDecimal({ minor: 84000, currency: 'JPY' })).toBe('84000')
		expect(toDecimal({ minor: 5, currency: 'USD' })).toBe('0.05')
		expect(toDecimal({ minor: Number.MAX_SAFE_INTEGER, currency: 'USD' })).toBe('90071992547409.91')
	})

	it('refuses a minor that is not a safe integer, and a code that is not a currency', () => {
		expect(() => money(1.5, 'USD')).toThrow(RangeError)
		expect(() => money(Number.MAX_SAFE_INTEGER + 1, 'USD')).toThrow(RangeError)
		expect(() => money(Number.NaN, 'USD')).toThrow(RangeError)
		expect(() => money(1, 'usd')).toThrow(RangeError)
		expect(() => toDecimal({ minor: 0.1, currency: 'USD' })).toThrow(RangeError)
		expect(() => formatMoney({ minor: 0.1, currency: 'USD' }, 'en')).toThrow(RangeError)
		expect(isCurrency('JPY')).toBe(true)
		expect(isCurrency('XYZ')).toBe(false)
		expect(isCurrency('jpy')).toBe(false)
	})

	it('adds one currency, and refuses two or an unsafe result', () => {
		expect(addMoney(money(150, 'USD'), money(-50, 'USD'))).toEqual(money(100, 'USD'))
		expect(() => addMoney(money(1, 'USD'), money(1, 'JPY'))).toThrow(RangeError)
		expect(() => addMoney(money(Number.MAX_SAFE_INTEGER, 'JPY'), money(1, 'JPY'))).toThrow(RangeError)
		expect(negate(money(0, 'USD')).minor).toBe(0)
		expect(Object.is(negate(money(0, 'USD')).minor, -0)).toBe(false)
		expect(negate(money(5, 'USD'))).toEqual(money(-5, 'USD'))
	})

	it('sums one currency and reports the others it left out', () => {
		const { total, left } = sumMoney(
			[money(100, 'USD'), money(84000, 'JPY'), money(250, 'USD'), money(1000, 'EUR')],
			'USD'
		)
		expect(total).toEqual(money(350, 'USD'))
		expect(left).toEqual([money(84000, 'JPY'), money(1000, 'EUR')])
		expect(sumMoney([], 'JPY')).toEqual({ total: money(0, 'JPY'), left: [] })
	})

	it('takes a share in basis points, rounding half away from zero', () => {
		expect(shareOf(money(1, 'USD'), 5000)).toEqual(money(1, 'USD'))
		expect(shareOf(money(-1, 'USD'), 5000)).toEqual(money(-1, 'USD'))
		expect(shareOf(money(3, 'USD'), 3333)).toEqual(money(1, 'USD'))
		expect(shareOf(money(120418, 'USD'), 10000)).toEqual(money(120418, 'USD'))
		expect(shareOf(money(Number.MAX_SAFE_INTEGER, 'JPY'), 5000)).toEqual(money(4503599627370496, 'JPY'))
		expect(() => shareOf(money(1, 'USD'), 0.5)).toThrow(RangeError)
	})

	it('lists every currency with the home one first', () => {
		const list = currencyOptions('en', 'JPY')
		expect(list[0]).toEqual({ value: 'JPY', label: 'JPY · Japanese Yen' })
		expect(list.filter((option) => option.value === 'JPY')).toHaveLength(1)
		expect(list.some((option) => option.value === 'USD')).toBe(true)
	})
})
