// Addresses from what was kept before they had parts, and from what other sources say of a place.
import type { GeocodeHit } from '../geo/types.js'
import { isCountry } from './countries.js'
import { formatFor, regionCode } from './formats.js'
import { ADDRESS_KEYS, type Address } from './types.js'
import { cleanAddress, normalPostal } from './validate.js'

/** An address for a text column (D-138): its parts as JSON. */
export function encodeAddress(address: Address | undefined): string {
	const clean = cleanAddress(address)
	return clean ? JSON.stringify(clean) : ''
}

/**
 * An address written as one line. Only the shape Eden itself wrote from a business's page is taken apart,
 * `street, town, REGION CODE`, and only when the end is a postal code of `country`; anything else is kept whole
 * as the first line, so nothing the owner typed is lost or guessed at.
 */
export function parseAddressText(text: string, country?: string): Address | undefined {
	const line = text.replace(/\s+/g, ' ').trim()
	if (!line) return undefined
	const whole: Address = { line1: line.slice(0, 200) }
	const format = formatFor(country)
	const rule = format.postal
	const parts = line.split(/,\s*/)
	if (!country || !rule || parts.length < 3) return whole
	const tail = parts[parts.length - 1] ?? ''
	const words = tail.split(' ')
	// the postal code is the last word or the last two (`M5V 2T6`)
	for (const take of [1, 2]) {
		if (words.length < take) continue
		const code = normalPostal(country, words.slice(-take).join(' '))
		if (!rule.pattern.test(code)) continue
		const region = words.slice(0, -take).join(' ')
		// a region before the code, in a country that writes none, is another country's address
		if (region && !format.rows.flat().includes('region')) return whole
		return cleanAddress({
			country,
			line1: parts.slice(0, -2).join(', '),
			city: parts[parts.length - 2],
			region: regionCode(country, region) ?? region,
			postalCode: code,
		})
	}
	return whole
}

/**
 * An address from whatever was kept: its parts, the JSON of them, or a line from before addresses had parts
 * (D-138). `country` is the one an old line is read against. Nothing for anything else, or for an empty one.
 */
export function readAddress(value: unknown, country?: string): Address | undefined {
	if (typeof value === 'string') {
		const text = value.trim()
		if (!text.startsWith('{')) return parseAddressText(text, country)
		try {
			return readAddress(JSON.parse(text))
		} catch {
			return { line1: text.slice(0, 200) }
		}
	}
	if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
	const given = value as Record<string, unknown>
	const address: Address = isCountry(given.country) ? { country: given.country } : {}
	for (const key of ADDRESS_KEYS) {
		const part = given[key]
		if (typeof part === 'string' && part.trim()) address[key] = part.trim().slice(0, 200)
	}
	return ADDRESS_KEYS.some((key) => address[key]) ? address : undefined
}

/** The address a geocoder gave for a place, laid out as its country writes the first line. */
export function addressFromHit(hit: GeocodeHit): Address | undefined {
	const country =
		hit.countryCode && isCountry(hit.countryCode.toUpperCase()) ? hit.countryCode.toUpperCase() : undefined
	const format = formatFor(country)
	const first = format.houseNumberFirst ? [hit.houseNumber, hit.street] : [hit.street, hit.houseNumber]
	return cleanAddress({
		...(country ? { country } : {}),
		line1: hit.street ? first.filter(Boolean).join(' ') : hit.addressLine,
		city: hit.city ?? hit.locality,
		region: hit.region,
		postalCode: hit.postalCode,
	})
}
