// What is wrong with an address, and an address tidied for keeping.
import { isCountry } from './countries.js'
import { formatFor, regionCode } from './formats.js'
import { ADDRESS_KEYS, type Address, type AddressKey } from './types.js'

export type AddressProblem = 'required' | 'postal'
export type AddressErrors = Partial<Record<AddressKey, AddressProblem>>

/** The parts a country's form asks for. */
export const addressKeys = (country?: string): AddressKey[] => formatFor(country).rows.flat()

/** A postal code as its country writes it: trimmed, and spaced and cased by the country's rule where it has one. */
export function normalPostal(country: string | undefined, code: string): string {
	const text = code.normalize('NFKC').trim()
	return formatFor(country).postal?.normalize?.(text) ?? text
}

/**
 * The parts that cannot be saved as they are: a postal code that is not shaped as its country's are, and any part
 * in `require` left empty. Few parts are ever required (a city is enough for a home), so the caller names them.
 */
export function validateAddress(address: Address, options: { require?: readonly AddressKey[] } = {}): AddressErrors {
	const errors: AddressErrors = {}
	const asked = addressKeys(address.country)
	for (const key of options.require ?? []) {
		if (asked.includes(key) && !address[key]?.trim()) errors[key] = 'required'
	}
	const rule = formatFor(address.country).postal
	const code = address.postalCode?.trim()
	if (rule && code && asked.includes('postalCode') && !rule.pattern.test(normalPostal(address.country, code))) {
		errors.postalCode = 'postal'
	}
	return errors
}

/**
 * An address as it is kept: each part trimmed, the postal code in its country's shape, a region the country lists
 * as its code, and parts the country's form does not ask left out. Nothing when only the country is given.
 */
export function cleanAddress(address: Address | undefined): Address | undefined {
	if (!address) return undefined
	const country = isCountry(address.country) ? address.country : undefined
	const asked = addressKeys(country)
	const clean: Address = country ? { country } : {}
	let any = false
	for (const key of ADDRESS_KEYS) {
		if (!asked.includes(key)) continue
		let value = (address[key] ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, 200)
		if (!value) continue
		if (key === 'postalCode') value = normalPostal(country, value)
		if (key === 'region') value = regionCode(country, value) ?? value
		clean[key] = value
		any = true
	}
	return any ? clean : undefined
}
