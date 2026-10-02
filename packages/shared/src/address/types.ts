// A postal address as Eden keeps it (D-137): the country, and the five parts every layout is made of. What each part
// is called, which exist and the order they are asked and written in belong to the country's format.

/** The parts of an address other than its country. */
export type AddressKey = 'line1' | 'line2' | 'city' | 'region' | 'postalCode'

export const ADDRESS_KEYS: readonly AddressKey[] = ['line1', 'line2', 'city', 'region', 'postalCode']

export interface Address {
	/** ISO 3166-1 alpha-2, upper case; absent only on an address written before it was asked. */
	country?: string
	line1?: string
	line2?: string
	city?: string
	/** The ISO 3166-2 suffix where the country's format lists its regions (`TX`, `13`), free text elsewhere. */
	region?: string
	postalCode?: string
}

/** One region of a country that lists them. */
export interface Region {
	code: string
	name: string
	ja?: string
}

/** What a country calls each part; the ids are keys under `address.*` in the dictionaries. */
export interface AddressLabels {
	line1: 'line1' | 'jp.line1'
	line2: 'line2' | 'jp.line2'
	city: 'city.city' | 'city.town' | 'city.suburb' | 'city.municipality'
	region: 'region.state' | 'region.province' | 'region.prefecture' | 'region.county' | 'region.region'
	postalCode: 'postal.zip' | 'postal.postcode' | 'postal.postalCode' | 'postal.eircode'
}

export interface PostalRule {
	/** What a code looks like once `normalize` has run. */
	pattern: RegExp
	example: string
	/** Only digits, so a phone shows its number keys. */
	numeric?: boolean
	/** Upper case, so a phone holds shift. */
	capitals?: boolean
	normalize?: (code: string) => string
}

/** How a written address is laid out: lines of `{key}` or `{key|prefix}`, empty parts and lines falling away. */
export interface AddressTemplate {
	lines: string[]
	/** What joins the lines when they are written as one; `, ` unless said. */
	joiner?: string
}

export interface AddressFormat {
	/** The form: the parts this country has, in the order it asks them, two to a row where they pair. */
	rows: AddressKey[][]
	labels: AddressLabels
	postal?: PostalRule
	regions?: readonly Region[]
	/** A listed region is written by its code (`TX`) rather than its name. */
	regionAsCode?: boolean
	/** Whether the number comes before the street on the first line. */
	houseNumberFirst: boolean
	template: AddressTemplate
	/** The layout in the country's own languages, where it differs. */
	local?: AddressTemplate & { languages: string[] }
}
