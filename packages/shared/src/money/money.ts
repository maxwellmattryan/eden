// Money as Eden keeps it (D-188): a whole number of the currency's minor units and its ISO 4217 code, never a float.
// A figure is read from what the owner typed through the locale's own symbols, split on its decimal mark and joined as
// digits, so nothing is multiplied as a float; it is written back through `Intl.NumberFormat` with the currency's own
// decimals, from an exact decimal string. Sums keep to one currency and report what they left out; a share is taken in
// basis points with BigInt. Pure: the same vectors (`money.vectors.json`) prove this file and #73's Rust port.

export interface Money {
	/** A safe integer of the currency's minor units: cents for USD, yen for JPY. */
	minor: number
	/** ISO 4217, upper case. */
	currency: string
}

export const DEFAULT_HOME_CURRENCY = 'USD'

export type MoneyParseError = 'empty' | 'not-a-number' | 'too-many-decimals' | 'too-large'

let supported: Set<string> | undefined
const decimals = new Map<string, number>()

/** A three-letter upper-case code this engine's `Intl` knows. */
export function isCurrency(code: string): boolean {
	if (typeof code !== 'string' || !/^[A-Z]{3}$/.test(code)) return false
	supported ??= new Set(Intl.supportedValuesOf('currency'))
	return supported.has(code)
}

function checkCurrency(currency: string): void {
	if (!isCurrency(currency)) throw new RangeError(`not a currency: ${JSON.stringify(currency)}`)
}

/** How many minor digits the currency has: 2 for USD, 0 for JPY. */
export function decimalsOf(currency: string): number {
	const known = decimals.get(currency)
	if (known !== undefined) return known
	checkCurrency(currency)
	const digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits
	const out = digits ?? 2
	decimals.set(currency, out)
	return out
}

/** A Money, checked: a safe integer of minor units and a known code. */
export function money(minor: number, currency: string): Money {
	if (!Number.isSafeInteger(minor)) throw new RangeError(`not a safe integer of minor units: ${String(minor)}`)
	checkCurrency(currency)
	// no negative zero: it would write as "-$0.00"
	return { minor: minor === 0 ? 0 : minor, currency }
}

/** The amount as an exact decimal string, by string: "-42.17", "84000", "0.05". */
export function toDecimal(m: Money): string {
	const checked = money(m.minor, m.currency)
	const d = decimalsOf(checked.currency)
	const digits = String(Math.abs(checked.minor)).padStart(d + 1, '0')
	const sign = checked.minor < 0 ? '-' : ''
	return d === 0 ? `${sign}${digits}` : `${sign}${digits.slice(0, -d)}.${digits.slice(-d)}`
}

const symbols = new Map<string, { group: string; decimal: string }>()
function symbolsOf(locale: string) {
	let known = symbols.get(locale)
	if (!known) {
		const parts = new Intl.NumberFormat(locale).formatToParts(12345.6)
		known = {
			group: parts.find((part) => part.type === 'group')?.value ?? ',',
			decimal: parts.find((part) => part.type === 'decimal')?.value ?? '.',
		}
		symbols.set(locale, known)
	}
	return known
}

/** The marks the currency is written with in the locale, so a pasted "$1,204.18" reads as the figure. */
function currencyMarks(currency: string, locale: string): string[] {
	const marks = new Set<string>([currency])
	for (const currencyDisplay of ['symbol', 'narrowSymbol'] as const) {
		for (const part of new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay }).formatToParts(1))
			if (part.type === 'currency') marks.add(part.value)
	}
	return [...marks].sort((a, b) => b.length - a.length)
}

// every space, the no-break and the narrow no-break ones a locale groups with among them
const WHITESPACE = /\s/g

/**
 * What the owner typed, in the locale's symbols, as minor units of the currency. A leading minus is a negative; group
 * marks and spaces are dropped; trailing zeros past the currency's decimals are fine, any other digit there is not.
 */
export function parseMoney(text: string, currency: string, locale: string): Money | { error: MoneyParseError } {
	const d = decimalsOf(currency)
	let rest = String(text ?? '').trim()
	if (!rest) return { error: 'empty' }
	let negative = false
	if (/^[-−]/.test(rest)) {
		negative = true
		rest = rest.slice(1)
	} else if (rest.startsWith('+')) rest = rest.slice(1)
	for (const mark of currencyMarks(currency, locale)) rest = rest.split(mark).join('')
	const { group, decimal } = symbolsOf(locale)
	rest = rest.replace(WHITESPACE, '')
	if (group.trim()) rest = rest.split(group).join('')
	if (!rest) return { error: 'empty' }
	const pieces = rest.split(decimal)
	if (pieces.length > 2) return { error: 'not-a-number' }
	const whole = pieces[0] ?? ''
	let fraction = pieces[1] ?? ''
	if (!/^\d*$/.test(whole) || !/^\d*$/.test(fraction) || (!whole && !fraction)) return { error: 'not-a-number' }
	fraction = fraction.replace(/0+$/, '')
	if (fraction.length > d) return { error: 'too-many-decimals' }
	const digits = `${whole}${fraction.padEnd(d, '0')}`.replace(/^0+(?=\d)/, '')
	const minor = BigInt(digits || '0')
	if (minor > BigInt(Number.MAX_SAFE_INTEGER)) return { error: 'too-large' }
	const value = Number(minor)
	return money(negative ? -value : value, currency)
}

const formats = new Map<string, Intl.NumberFormat>()

/**
 * The amount in the locale, with the currency's own decimals: "¥84,000", "-$1,204.18". With `sign: 'never'` a
 * negative is written as its size, for a line that says which way it goes in words ("owed").
 */
export function formatMoney(m: Money, locale: string, options: { sign?: 'auto' | 'never' } = {}): string {
	const decimal = toDecimal(m)
	const d = decimalsOf(m.currency)
	const sign = options.sign ?? 'auto'
	const key = `${locale}|${m.currency}|${sign}`
	let format = formats.get(key)
	if (!format) {
		format = new Intl.NumberFormat(locale, {
			style: 'currency',
			currency: m.currency,
			minimumFractionDigits: d,
			maximumFractionDigits: d,
			signDisplay: sign,
		})
		formats.set(key, format)
	}
	// a string is formatted exactly where the engine takes one (Intl.NumberFormat v3), and as the number it reads
	// otherwise, which is exact for every safe minor at the currency's own decimals
	return (format as unknown as { format(value: string): string }).format(decimal)
}

function checkSafe(minor: number): number {
	if (!Number.isSafeInteger(minor)) throw new RangeError('the result is not a safe integer of minor units')
	return minor
}

/** The sum of two amounts of one currency. */
export function addMoney(a: Money, b: Money): Money {
	if (a.currency !== b.currency) throw new RangeError(`cannot add ${a.currency} to ${b.currency}`)
	return money(checkSafe(money(a.minor, a.currency).minor + money(b.minor, b.currency).minor), a.currency)
}

export function negate(m: Money): Money {
	return money(0 - m.minor, m.currency)
}

/** The sum of the amounts in the currency, and the amounts in any other currency, which it leaves out. */
export function sumMoney(values: readonly Money[], currency: string): { total: Money; left: Money[] } {
	let total = money(0, currency)
	const left: Money[] = []
	for (const value of values) {
		if (value.currency === currency) total = addMoney(total, value)
		else left.push(value)
	}
	return { total, left }
}

/** A share of an amount, in basis points (10000 is all of it), rounded half away from zero. */
export function shareOf(m: Money, basisPoints: number): Money {
	const checked = money(m.minor, m.currency)
	if (!Number.isInteger(basisPoints) || basisPoints < 0) throw new RangeError(`not a share: ${String(basisPoints)}`)
	const product = BigInt(checked.minor) * BigInt(basisPoints)
	const size = product < 0n ? -product : product
	let quotient = size / 10000n
	if ((size % 10000n) * 2n >= 10000n) quotient += 1n
	const minor = Number(product < 0n ? -quotient : quotient)
	return money(checkSafe(minor), checked.currency)
}

const options = new Map<string, { value: string; label: string }[]>()

/** Every code `Intl` supports, labelled "JPY · Japanese Yen" in the locale, by code with `first` at the top. */
export function currencyOptions(locale: string, first: string): { value: string; label: string }[] {
	let all = options.get(locale)
	if (!all) {
		const names = new Intl.DisplayNames(locale, { type: 'currency', fallback: 'code' })
		all = Intl.supportedValuesOf('currency').map((code) => ({
			value: code,
			label: `${code} · ${names.of(code) ?? code}`,
		}))
		options.set(locale, all)
	}
	const top = all.find((option) => option.value === first)
	return top ? [top, ...all.filter((option) => option !== top)] : [...all]
}

/** The currency's name as a count of it reads in the locale: "Japanese yen", "US dollars". */
export function currencyUnitName(currency: string, locale: string): string {
	const parts = new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'name' }).formatToParts(2)
	return parts.find((part) => part.type === 'currency')?.value.trim() || currency
}
