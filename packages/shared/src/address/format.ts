// An address written out, in the order its country writes it.
import { countryName } from './countries.js'
import { formatFor, regionName, regionOf } from './formats.js'
import type { Address, AddressKey, AddressTemplate } from './types.js'

export interface FormatOptions {
	/** `oneLine` unless said. */
	style?: 'oneLine' | 'lines'
	locale?: string
	/** Whether the country's name ends it; left out unless asked. */
	country?: boolean
}

function templateFor(address: Address, locale: string): AddressTemplate {
	const format = formatFor(address.country)
	const language = locale.toLowerCase().split('-')[0] ?? ''
	return format.local?.languages.includes(language) ? format.local : format.template
}

/** A line with its parts filled in; what an empty part leaves behind (a stray comma, a doubled space) is tidied away. */
function filled(line: string, part: (key: AddressKey) => string): string {
	return line
		.replace(/\{(\w+)(?:\|([^}]*))?\}/g, (_, key: AddressKey, prefix = '') => {
			const value = part(key)
			return value ? `${prefix}${value}` : ''
		})
		.replace(/\s+/g, ' ')
		.replace(/^[\s,]+|[\s,]+$/g, '')
		.replace(/\s+,/g, ',')
}

/** The lines of an address as its country writes them; empty lines fall away. */
export function addressLines(address: Address, options: FormatOptions = {}): string[] {
	const locale = options.locale ?? 'en'
	const format = formatFor(address.country)
	const part = (key: AddressKey): string => {
		const value = (address[key] ?? '').trim()
		if (key !== 'region' || !regionOf(address.country, value)) return value
		return format.regionAsCode ? value : regionName(address.country, value, locale)
	}
	const lines = templateFor(address, locale)
		.lines.map((line) => filled(line, part))
		.filter(Boolean)
	if (options.country && address.country && lines.length) lines.push(countryName(address.country, locale))
	return lines
}

/** An address as text: on one line unless `lines` is asked. An address of one free line reads back as that line. */
export function formatAddress(address: Address | undefined, options: FormatOptions = {}): string {
	if (!address) return ''
	const lines = addressLines(address, options)
	if (options.style === 'lines') return lines.join('\n')
	return lines.join(templateFor(address, options.locale ?? 'en').joiner ?? ', ')
}

/** A unit written at the end of a first line (`Apt 12`, `Suite 300`, `#4B`): a designator and its number or letter. */
const UNIT_TAIL =
	/[\s,]+(?:(?:apt|apartment|unit|suite|ste|fl|floor|bldg|building|rm|room)\.?\s*#?\s*|#\s*)(?:\d[\w-]*|[a-z])$/i

/**
 * A first line without its house number or a unit typed after it: the street alone, from whichever end the country
 * writes the number at. The second line is never read.
 */
export function streetOf(address: Address): string {
	const line = (address.line1 ?? '').normalize('NFKC').trim().replace(UNIT_TAIL, '')
	const street = formatFor(address.country).houseNumberFirst
		? line.replace(/^\d[\w\-/]*(\s+|$)/, '')
		: line.replace(/[\s,]*\d[\w\-/]*$/, '')
	return street.trim()
}

/**
 * An address as a geocoder is asked for it (D-140): the street, the city, the region, the postal code and the
 * country, in English order, and never the house number or the second line. What comes back is the street; the
 * owner puts the pin on the house themselves.
 */
export function geocodeText(address: Address): string {
	const { country, city, region, postalCode } = address
	const street = streetOf(address)
	return formatAddress(
		{ country, city, region, postalCode, ...(street ? { line1: street } : {}) },
		{ locale: 'en', country: true }
	)
}
