// The deterministic scrub of the privacy pipeline (docs/product/substrate/ai.md, "Privacy pipeline"; D-26): emails,
// phone numbers and account-like numbers are replaced before anything leaves, and what is left alone stays what it
// was: dates, times, stamps, ULIDs and short numbers. It runs on every string of the pack, and running it twice
// changes nothing.

export interface ScrubHits {
	emails: number
	phones: number
	accounts: number
}

export interface Scrubbed {
	text: string
	hits: ScrubHits
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g

/**
 * A phone number: an optional `+` and country code, then three to four groups of digits joined by spaces, dashes,
 * dots or parentheses, ten to fifteen digits in all. A date's two-digit groups and a stamp's long hex never match.
 */
const PHONE = /(?<![\w-])(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)|\d{2,4})(?:[\s.-]\d{2,5}){2,3}(?![\w-])/g

/** Eight or more digits in groups joined by spaces or dashes, IBAN-like letter groups allowed after the first. */
const ACCOUNT =
	/(?<![\w-])(?:[A-Z]{2}\d{2}(?:[\s-]?[A-Z0-9]{4}){3,}(?:[\s-]?[A-Z0-9]{1,4})?|\d{4,}(?:[\s-]\d{2,})+|\d{8,})(?![\w-])/g

const DATE = /^\d{4}-\d{2}-\d{2}$/
const STAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/
const ISO_DATE_IN = /\d{4}-\d{2}-\d{2}/
const HEX_STAMP = /^[0-9a-f]{16}-[0-9a-f]{8}-[0-9a-f]{8}$/

const digitsOf = (value: string) => value.replace(/\D/g, '')

function looksLikeDate(match: string, text: string, at: number): boolean {
	// The match itself, or the date it sits inside: `2026-09-30` and `2026-09-30T09:00`.
	if (DATE.test(match) || STAMP.test(match)) return true
	const around = text.slice(Math.max(0, at - 5), at + match.length + 6)
	return ISO_DATE_IN.test(around) && around.includes(match)
}

/** Replaces emails, phone numbers and account-like numbers, and counts each. */
export function scrub(text: string): Scrubbed {
	const hits: ScrubHits = { emails: 0, phones: 0, accounts: 0 }
	let out = text.replace(EMAIL, () => {
		hits.emails += 1
		return '[email]'
	})
	out = out.replace(PHONE, (match, at: number, whole: string) => {
		const digits = digitsOf(match)
		if (digits.length < 10 || digits.length > 15 || looksLikeDate(match, whole, at)) return match
		hits.phones += 1
		return '[phone]'
	})
	out = out.replace(ACCOUNT, (match, at: number, whole: string) => {
		if (HEX_STAMP.test(match) || looksLikeDate(match, whole, at)) return match
		if (digitsOf(match).length < 8) return match
		hits.accounts += 1
		return '[number]'
	})
	return { text: out, hits }
}

/** The same scrub over every string of a JSON value, keys left alone. */
export function scrubValue<T>(value: T): T {
	if (typeof value === 'string') return scrub(value).text as T
	if (Array.isArray(value)) return value.map((item) => scrubValue(item)) as T
	if (value && typeof value === 'object') {
		const out: Record<string, unknown> = {}
		for (const [key, item] of Object.entries(value)) out[key] = scrubValue(item)
		return out as T
	}
	return value
}
