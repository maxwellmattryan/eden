// The countries and regions an address can be in: every ISO 3166-1 alpha-2 code, named by the runtime in the
// language asked for, so no list of names is kept here.

export const COUNTRY_CODES: readonly string[] = (
	'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
	'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR ' +
	'GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP ' +
	'KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT ' +
	'MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW ' +
	'SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ ' +
	'UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'
).split(' ')

const KNOWN = new Set(COUNTRY_CODES)

/** Whether a value is a country code Eden knows. */
export const isCountry = (value: unknown): value is string => typeof value === 'string' && KNOWN.has(value)

const namers = new Map<string, Intl.DisplayNames>()

/** What a country is called in a language; its code when the runtime has no name for it. */
export function countryName(code: string, locale = 'en'): string {
	let namer = namers.get(locale)
	if (!namer) {
		namer = new Intl.DisplayNames([locale], { type: 'region' })
		namers.set(locale, namer)
	}
	try {
		return namer.of(code) ?? code
	} catch {
		return code
	}
}

let byName: Map<string, string> | undefined

/** The code for a country written as a code or by its English name; nothing for anything else. */
export function countryCode(text: string): string | undefined {
	const given = text.trim()
	if (isCountry(given.toUpperCase())) return given.toUpperCase()
	byName ??= new Map(COUNTRY_CODES.map((code) => [countryName(code).toLowerCase(), code]))
	return byName.get(given.toLowerCase())
}

/** The country a new address starts in: the home's, else the one the language is most spoken in. */
export function defaultCountry(given: { home?: string; locale?: string } = {}): string {
	if (isCountry(given.home)) return given.home
	try {
		const region = new Intl.Locale(given.locale ?? 'en').maximize().region
		if (isCountry(region)) return region
	} catch {
		// an unknown tag falls through
	}
	return 'US'
}

export interface CountryOption {
	value: string
	label: string
}

/** Every country by name in a language, sorted as that language sorts, with the ones to offer first apart. */
export function countryOptions(
	locale = 'en',
	first: readonly string[] = []
): { first: CountryOption[]; all: CountryOption[] } {
	const option = (code: string): CountryOption => ({ value: code, label: countryName(code, locale) })
	const collator = new Intl.Collator(locale)
	return {
		first: [...new Set(first)].filter(isCountry).map(option),
		all: COUNTRY_CODES.map(option).sort((a, b) => collator.compare(a.label, b.label)),
	}
}
