// A merchant out of a bank's raw name (product/domains/finance.md §6, D-193): the processor's prefix, the store
// number and the card noise stripped, a shouted name title-cased, and a key to find the merchant row by. A vague
// merchant (Zelle, PayPal, Venmo, Cash App, Apple Cash) is one row per brand; the person on the other side is kept as
// the row's counterparty, for rules. Pure.

/** The vague brands, by display name, with what finds each in a normalised name. */
export const VAGUE_BRANDS = [
	{ brand: 'Zelle', words: ['zelle'] },
	{ brand: 'PayPal', words: ['paypal'] },
	{ brand: 'Venmo', words: ['venmo'] },
	{ brand: 'Cash App', words: ['cash app', 'cashapp'] },
	{ brand: 'Apple Cash', words: ['apple cash'] },
] as const

const PROCESSOR = /^\s*(?:SQ|TST|PY|SP)\s*\*\s*/i
/** `PAYPAL *NETFLIX` is Netflix, through PayPal: the part after the star is the merchant. */
const PAYPAL_FOR = /^\s*PAYPAL\s*\*\s*(\S.*)$/i
const NOISE = new Set(['pos', 'debit', 'purchase', 'card'])
/** What a vague name says around the person. */
const FILLER = new Set(['payment', 'to', 'from', 'transfer', 'conf#', 'conf', 'xfer', 'sent', 'received'])

const digitsIn = (token: string) => token.replace(/\D/g, '').length

const titleCase = (text: string) =>
	text
		.split(' ')
		.map((word) => (word ? word[0]!.toUpperCase() + word.slice(1).toLowerCase() : word))
		.join(' ')

/** Lower case, letters and digits, single spaces. */
export function merchantKey(clean: string): string {
	return clean
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim()
}

/**
 * The vague brand a name is, and the person on the other side when it names one: lower case, with the brand, the
 * filler words and any run of digits left out. `PAYPAL *NETFLIX` is not vague.
 */
export function vagueOf(name: string | undefined): { brand: string; counterparty?: string } | undefined {
	if (!name || PAYPAL_FOR.test(name)) return undefined
	const normal = ` ${name
		.toLowerCase()
		.replace(/[^\p{L}\p{N}#]+/gu, ' ')
		.trim()} `
	for (const { brand, words } of VAGUE_BRANDS) {
		const word = words.find((entry) => normal.includes(` ${entry} `))
		if (!word) continue
		const rest = normal
			.replace(` ${word} `, ' ')
			.split(' ')
			.map((token) => token.replace(/\d+/g, ''))
			.filter((token) => token && token !== '#' && !FILLER.has(token))
			.join(' ')
		return rest ? { brand, counterparty: rest } : { brand }
	}
	return undefined
}

/**
 * A merchant's display name from the provider's `name` and `merchant_name`: the merchant name when there is one, the
 * brand of a vague one, else the name with the processor's prefix, the noise words, `#…`, every token with three or
 * more digits and the stars left out, title-cased when it has no lower case letter.
 */
export function cleanMerchant(name: string, merchantName?: string): string {
	const vague = vagueOf(name) ?? vagueOf(merchantName)
	if (vague) return vague.brand
	const source = (merchantName?.trim() || name).trim()
	const through = PAYPAL_FOR.exec(source)
	const stripped = (through ? through[1]! : source.replace(PROCESSOR, ''))
		.replace(/\*/g, ' ')
		.split(/\s+/)
		.filter((token) => token && !NOISE.has(token.toLowerCase()) && !token.startsWith('#') && digitsIn(token) < 3)
		.join(' ')
	const clean = stripped || source.replace(/\s+/g, ' ')
	return /\p{Ll}/u.test(clean) ? clean : titleCase(clean)
}
