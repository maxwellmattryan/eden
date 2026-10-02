// How each country writes an address (D-137): a hand-written table for the countries below and one plain layout for
// every other. A country joins the table by gaining an entry here; nothing else knows a country by name.
import { AU_STATES, CA_PROVINCES, JP_PREFECTURES, US_STATES } from './regions.js'
import type { AddressFormat, AddressLabels, Region } from './types.js'

const PLAIN: AddressLabels = {
	line1: 'line1',
	line2: 'line2',
	city: 'city.city',
	region: 'region.region',
	postalCode: 'postal.postalCode',
}

const squeezed = (code: string) => code.toUpperCase().replace(/[\s-]+/g, '')
/** A code with a space before its last `tail` characters, as Britain, Canada, Ireland and the Netherlands write. */
const spaced = (tail: number) => (code: string) => {
	const tight = squeezed(code)
	return tight.length > tail ? `${tight.slice(0, -tail)} ${tight.slice(-tail)}` : tight
}
const digits = (code: string) => code.replace(/[^\d]/g, '')

/** Street, then the postal code before the town: most of continental Europe, and the layout for a country not listed. */
const continental = (extra: Partial<AddressFormat> = {}): AddressFormat => ({
	rows: [['line1'], ['line2'], ['postalCode', 'city']],
	labels: PLAIN,
	houseNumberFirst: false,
	template: { lines: ['{line1}', '{line2}', '{postalCode} {city}'] },
	...extra,
})

const fiveDigits = { pattern: /^\d{5}$/, numeric: true }

export const GENERIC_FORMAT: AddressFormat = continental({
	rows: [['line1'], ['line2'], ['postalCode', 'city'], ['region']],
	template: { lines: ['{line1}', '{line2}', '{postalCode} {city}', '{region}'] },
})

export const ADDRESS_FORMATS: Readonly<Record<string, AddressFormat>> = {
	US: {
		rows: [['line1'], ['line2'], ['city'], ['region', 'postalCode']],
		labels: { ...PLAIN, region: 'region.state', postalCode: 'postal.zip' },
		postal: { pattern: /^\d{5}(-\d{4})?$/, example: '78751' },
		regions: US_STATES,
		regionAsCode: true,
		houseNumberFirst: true,
		template: { lines: ['{line1}', '{line2}', '{city}, {region} {postalCode}'] },
	},
	CA: {
		rows: [['line1'], ['line2'], ['city'], ['region', 'postalCode']],
		labels: { ...PLAIN, region: 'region.province' },
		postal: {
			pattern: /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z] \d[ABCEGHJ-NPRSTV-Z]\d$/,
			example: 'M5V 2T6',
			capitals: true,
			normalize: spaced(3),
		},
		regions: CA_PROVINCES,
		regionAsCode: true,
		houseNumberFirst: true,
		template: { lines: ['{line1}', '{line2}', '{city} {region} {postalCode}'] },
	},
	AU: {
		rows: [['line1'], ['line2'], ['city'], ['region', 'postalCode']],
		labels: { ...PLAIN, city: 'city.suburb', region: 'region.state', postalCode: 'postal.postcode' },
		postal: { pattern: /^\d{4}$/, example: '3000', numeric: true },
		regions: AU_STATES,
		regionAsCode: true,
		houseNumberFirst: true,
		template: { lines: ['{line1}', '{line2}', '{city} {region} {postalCode}'] },
	},
	GB: {
		rows: [['line1'], ['line2'], ['city'], ['region', 'postalCode']],
		labels: { ...PLAIN, city: 'city.town', region: 'region.county', postalCode: 'postal.postcode' },
		postal: {
			pattern: /^[A-Z]{1,2}\d[A-Z\d]? \d[A-Z]{2}$/,
			example: 'SW1A 1AA',
			capitals: true,
			normalize: spaced(3),
		},
		houseNumberFirst: true,
		template: { lines: ['{line1}', '{line2}', '{city}', '{region}', '{postalCode}'] },
	},
	IE: {
		rows: [['line1'], ['line2'], ['city'], ['region', 'postalCode']],
		labels: { ...PLAIN, city: 'city.town', region: 'region.county', postalCode: 'postal.eircode' },
		postal: { pattern: /^[A-Z]\d[\dW] [A-Z\d]{4}$/, example: 'D02 AF30', capitals: true, normalize: spaced(4) },
		houseNumberFirst: true,
		template: { lines: ['{line1}', '{line2}', '{city}', '{region}', '{postalCode}'] },
	},
	DE: continental({ postal: { ...fiveDigits, example: '10115' } }),
	FR: continental({ postal: { ...fiveDigits, example: '75001' }, houseNumberFirst: true }),
	NL: continental({
		postal: { pattern: /^\d{4} [A-Z]{2}$/, example: '1012 AB', capitals: true, normalize: spaced(2) },
	}),
	IT: continental({
		rows: [['line1'], ['line2'], ['postalCode', 'city'], ['region']],
		labels: { ...PLAIN, region: 'region.province' },
		postal: { ...fiveDigits, example: '00184' },
		template: { lines: ['{line1}', '{line2}', '{postalCode} {city} {region}'] },
	}),
	ES: continental({
		rows: [['line1'], ['line2'], ['postalCode', 'city'], ['region']],
		labels: { ...PLAIN, region: 'region.province' },
		postal: { ...fiveDigits, example: '28013' },
		template: { lines: ['{line1}', '{line2}', '{postalCode} {city}', '{region}'] },
	}),
	JP: {
		rows: [['postalCode', 'region'], ['city'], ['line1'], ['line2']],
		labels: {
			line1: 'jp.line1',
			line2: 'jp.line2',
			city: 'city.municipality',
			region: 'region.prefecture',
			postalCode: 'postal.postalCode',
		},
		postal: {
			pattern: /^\d{3}-\d{4}$/,
			example: '150-0001',
			normalize: (code) => {
				const tight = digits(code.normalize('NFKC'))
				return tight.length > 3 ? `${tight.slice(0, 3)}-${tight.slice(3)}` : tight
			},
		},
		regions: JP_PREFECTURES,
		houseNumberFirst: false,
		// in English smallest first, as mail from abroad is addressed
		template: { lines: ['{line2}', '{line1}', '{city}, {region} {postalCode}'] },
		local: { languages: ['ja'], lines: ['{postalCode|〒}', '{region}{city}{line1}', '{line2}'], joiner: ' ' },
	},
}

/** The countries with a layout of their own, in the order they are offered. */
export const CURATED_COUNTRIES: readonly string[] = Object.keys(ADDRESS_FORMATS)

/** A country's layout; the plain one for a country not in the table, or for none. */
export const formatFor = (country?: string): AddressFormat => (country && ADDRESS_FORMATS[country]) || GENERIC_FORMAT

const plain = (text: string) => text.normalize('NFKC').trim().toLowerCase()

/** The code of a listed region written as its code or a name; nothing where the country lists none or none matches. */
export function regionCode(country: string | undefined, text: string | undefined): string | undefined {
	const given = plain(text ?? '')
	if (!given) return undefined
	return formatFor(country).regions?.find(
		(region) =>
			plain(region.code) === given || plain(region.name) === given || (region.ja && plain(region.ja) === given)
	)?.code
}

/** A listed region by its code. */
export const regionOf = (country: string | undefined, code: string | undefined): Region | undefined =>
	formatFor(country).regions?.find((region) => region.code === code)

/** What a region is called in a language: a listed one by its name, free text as it was written. */
export function regionName(country: string | undefined, region: string | undefined, locale = 'en'): string {
	const listed = regionOf(country, region)
	if (!listed) return region ?? ''
	return locale.toLowerCase().startsWith('ja') && listed.ja ? listed.ja : listed.name
}
