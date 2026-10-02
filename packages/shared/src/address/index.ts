// Postal addresses for the substrate (D-137, D-138): the parts of one, how each country asks and writes them, and
// how one is read from what was kept before. Home, Meadow's places and Hearth's stores all keep theirs through here.
export { ADDRESS_KEYS, type Address, type AddressFormat, type AddressKey, type Region } from './types.js'
export {
	COUNTRY_CODES,
	countryCode,
	countryName,
	countryOptions,
	defaultCountry,
	isCountry,
	type CountryOption,
} from './countries.js'
export { ADDRESS_FORMATS, CURATED_COUNTRIES, GENERIC_FORMAT, formatFor, regionCode, regionName } from './formats.js'
export { addressLines, formatAddress, geocodeText, streetOf, type FormatOptions } from './format.js'
export {
	addressKeys,
	cleanAddress,
	normalPostal,
	validateAddress,
	type AddressErrors,
	type AddressProblem,
} from './validate.js'
export { addressFromHit, encodeAddress, parseAddressText, readAddress } from './read.js'
export { addressForm, type AddressFieldSpec, type AddressFormOptions, type AddressFormShape } from './form.js'
