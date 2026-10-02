// The address form's shape for a country: what the kit's `AddressForm` is given. The kit knows no country and
// holds no copy, so the table is resolved here into labelled fields, in the order the country asks them.
import { CURATED_COUNTRIES, formatFor, regionName } from './formats.js'
import { countryOptions, defaultCountry, type CountryOption } from './countries.js'
import type { Address, AddressKey } from './types.js'
import type { AddressErrors } from './validate.js'

/** One field of the form, as the kit's `AddressForm` reads it. */
export interface AddressFieldSpec {
	key: AddressKey
	label: string
	required?: boolean
	error?: string
	placeholder?: string
	autocomplete?: string
	inputmode?: 'numeric' | 'text'
	autocapitalize?: 'characters' | 'words'
	/** A fixed list to choose from, where the country has one. */
	options?: { value: string; label: string }[]
}

export interface AddressFormShape {
	country: string
	countries: { label: string; options: CountryOption[] }[]
	rows: AddressFieldSpec[][]
}

export interface AddressFormOptions {
	/** The copy for an id under `address.*`: `(id, values) => $t('address.' + id, { values })`. */
	label: (id: string, values?: Record<string, string>) => string
	locale?: string
	/** The home's country, offered first and the default. */
	home?: string
	errors?: AddressErrors
	require?: readonly AddressKey[]
}

const AUTOCOMPLETE: Record<AddressKey, string> = {
	line1: 'address-line1',
	line2: 'address-line2',
	city: 'address-level2',
	region: 'address-level1',
	postalCode: 'postal-code',
}

/** The form for an address: its country's fields with their labels, and the countries to choose from. */
export function addressForm(value: Address, options: AddressFormOptions): AddressFormShape {
	const { label, locale = 'en' } = options
	const country = value.country ?? defaultCountry({ home: options.home, locale })
	const format = formatFor(country)
	const offered = countryOptions(locale, [
		country,
		defaultCountry({ home: options.home, locale }),
		...CURATED_COUNTRIES,
	])

	const spec = (key: AddressKey): AddressFieldSpec => {
		const name = label(format.labels[key])
		const problem = options.errors?.[key]
		const postal = key === 'postalCode' ? format.postal : undefined
		return {
			key,
			label: name,
			autocomplete: AUTOCOMPLETE[key],
			...(options.require?.includes(key) ? { required: true } : {}),
			...(problem ? { error: label(`error.${problem}`, { label: name, example: format.postal?.example ?? '' }) } : {}),
			...(postal ? { placeholder: postal.example } : {}),
			...(postal?.numeric ? { inputmode: 'numeric' as const } : {}),
			...(postal?.capitals ? { autocapitalize: 'characters' as const } : {}),
			...(key === 'region' && format.regions
				? {
						placeholder: label('chooseRegion'),
						options: format.regions.map((region) => ({
							value: region.code,
							label: regionName(country, region.code, locale),
						})),
					}
				: {}),
		}
	}

	return {
		country,
		countries: [
			{ label: label('group.suggested'), options: offered.first },
			{ label: label('group.all'), options: offered.all },
		],
		rows: format.rows.map((row) => row.map(spec)),
	}
}
