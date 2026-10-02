import { describe, expect, it } from 'vitest'
import {
	ADDRESS_FORMATS,
	ADDRESS_KEYS,
	COUNTRY_CODES,
	GENERIC_FORMAT,
	addressForm,
	addressFromHit,
	cleanAddress,
	countryCode,
	countryName,
	countryOptions,
	defaultCountry,
	encodeAddress,
	formatAddress,
	geocodeText,
	readAddress,
	regionCode,
	validateAddress,
	type Address,
} from './index.js'

const austin: Address = {
	country: 'US',
	line1: '4301 Duval St',
	line2: 'Apt 2',
	city: 'Austin',
	region: 'TX',
	postalCode: '78751',
}
const shibuya: Address = {
	country: 'JP',
	postalCode: '150-0001',
	region: '13',
	city: '渋谷区',
	line1: '神宮前1-2-3',
	line2: 'メゾン101',
}

describe('countries', () => {
	it('lists every ISO country once, each with a name in both languages', () => {
		expect(COUNTRY_CODES).toHaveLength(249)
		expect(new Set(COUNTRY_CODES).size).toBe(249)
		for (const code of COUNTRY_CODES) {
			expect(countryName(code, 'en'), code).not.toBe(code)
			expect(countryName(code, 'ja'), code).not.toBe(code)
		}
		expect(countryName('JP', 'ja')).toBe('日本')
	})

	it('reads a country from its code or its English name', () => {
		expect(countryCode('us')).toBe('US')
		expect(countryCode('Germany')).toBe('DE')
		expect(countryCode('Atlantis')).toBeUndefined()
	})

	it('starts in the home country, else where the language is spoken', () => {
		expect(defaultCountry({ home: 'DE', locale: 'ja' })).toBe('DE')
		expect(defaultCountry({ locale: 'ja' })).toBe('JP')
		expect(defaultCountry({ locale: 'en' })).toBe('US')
		expect(defaultCountry({ locale: 'nonsense-tag-!' })).toBe('US')
	})

	it('offers the first ones once, and all of them sorted by name', () => {
		const { first, all } = countryOptions('en', ['JP', 'US', 'JP', 'XX'])
		expect(first.map((option) => option.value)).toEqual(['JP', 'US'])
		expect(all).toHaveLength(249)
		expect(all[0]?.label).toBe('Afghanistan')
	})
})

describe('formats', () => {
	it('asks only parts an address has, each once, and accepts its own postal example', () => {
		for (const [country, format] of Object.entries({ ...ADDRESS_FORMATS, generic: GENERIC_FORMAT })) {
			const keys = format.rows.flat()
			expect(new Set(keys).size, country).toBe(keys.length)
			for (const key of keys) expect(ADDRESS_KEYS, country).toContain(key)
			if (format.postal) expect(format.postal.example, country).toMatch(format.postal.pattern)
		}
	})

	it('knows a listed region by its code or either name', () => {
		expect(regionCode('US', 'texas')).toBe('TX')
		expect(regionCode('US', 'tx')).toBe('TX')
		expect(regionCode('JP', '東京都')).toBe('13')
		expect(regionCode('JP', 'Tokyo')).toBe('13')
		expect(regionCode('DE', 'Bayern')).toBeUndefined()
	})
})

describe('formatAddress', () => {
	it('writes each country in its own order', () => {
		expect(formatAddress(austin)).toBe('4301 Duval St, Apt 2, Austin, TX 78751')
		expect(formatAddress(austin, { style: 'lines', country: true })).toBe(
			'4301 Duval St\nApt 2\nAustin, TX 78751\nUnited States'
		)
		expect(formatAddress({ country: 'GB', line1: '10 Downing St', city: 'London', postalCode: 'SW1A 2AA' })).toBe(
			'10 Downing St, London, SW1A 2AA'
		)
		expect(formatAddress({ country: 'DE', line1: 'Hauptstraße 12', city: 'Berlin', postalCode: '10115' })).toBe(
			'Hauptstraße 12, 10115 Berlin'
		)
		expect(formatAddress({ country: 'BR', line1: 'Rua Augusta 100', city: 'São Paulo', region: 'SP' })).toBe(
			'Rua Augusta 100, São Paulo, SP'
		)
	})

	it('writes Japan largest first in Japanese and smallest first in English', () => {
		expect(formatAddress(shibuya, { locale: 'ja' })).toBe('〒150-0001 東京都渋谷区神宮前1-2-3 メゾン101')
		expect(formatAddress(shibuya, { locale: 'ja', style: 'lines' })).toBe(
			'〒150-0001\n東京都渋谷区神宮前1-2-3\nメゾン101'
		)
		expect(formatAddress(shibuya, { locale: 'en' })).toBe('メゾン101, 神宮前1-2-3, 渋谷区, Tokyo 150-0001')
		expect(formatAddress({ ...shibuya, postalCode: undefined }, { locale: 'ja' })).toBe(
			'東京都渋谷区神宮前1-2-3 メゾン101'
		)
	})

	it('leaves no stray commas where parts are missing, and reads an old line back as it was', () => {
		expect(formatAddress({ country: 'US', city: 'Austin' })).toBe('Austin')
		expect(formatAddress({ country: 'US', region: 'TX', postalCode: '78751' })).toBe('TX 78751')
		expect(formatAddress({ line1: '1814 E MLK Jr Blvd, Austin' })).toBe('1814 E MLK Jr Blvd, Austin')
		expect(formatAddress(undefined)).toBe('')
		expect(formatAddress({ country: 'US' }, { country: true })).toBe('')
	})
})

describe('geocodeText', () => {
	it('asks for the street and the town, never the house number or the unit (D-140)', () => {
		expect(geocodeText(austin)).toBe('Duval St, Austin, TX 78751, United States')
		expect(geocodeText({ country: 'US', line1: '123 45th St', city: 'Austin' })).toBe('45th St, Austin, United States')
		expect(
			geocodeText({ country: 'DE', line1: 'Hauptstraße 12a', line2: '3. OG', city: 'Berlin', postalCode: '10115' })
		).toBe('Hauptstraße, 10115 Berlin, Germany')
		expect(geocodeText(shibuya)).toBe('神宮前, 渋谷区, Tokyo 150-0001, Japan')
		expect(geocodeText({ country: 'US', line1: '4301', city: 'Austin' })).toBe('Austin, United States')
		expect(geocodeText({ country: 'US', city: 'Austin', region: 'TX' })).toBe('Austin, TX, United States')
	})
})

describe('validateAddress and cleanAddress', () => {
	it('checks a postal code against its country, after putting it in shape', () => {
		expect(validateAddress(austin)).toEqual({})
		expect(validateAddress({ ...austin, postalCode: '7875' })).toEqual({ postalCode: 'postal' })
		expect(validateAddress({ country: 'GB', postalCode: 'sw1a2aa' })).toEqual({})
		expect(validateAddress({ country: 'JP', postalCode: '１５００００１' })).toEqual({})
		expect(validateAddress({ country: 'BR', postalCode: 'anything' })).toEqual({})
	})

	it('requires only what the caller names', () => {
		expect(validateAddress({ country: 'US' })).toEqual({})
		expect(validateAddress({ country: 'US' }, { require: ['city'] })).toEqual({ city: 'required' })
		// Germany's form asks no region, so one cannot be required of it
		expect(validateAddress({ country: 'DE', city: 'Berlin' }, { require: ['city', 'region'] })).toEqual({})
	})

	it('keeps an address trimmed, in shape, and without parts its country does not ask', () => {
		expect(cleanAddress({ country: 'CA', line1: '  1 Main  St ', region: 'ontario', postalCode: 'm5v2t6' })).toEqual({
			country: 'CA',
			line1: '1 Main St',
			region: 'ON',
			postalCode: 'M5V 2T6',
		})
		expect(cleanAddress({ country: 'DE', city: 'Berlin', region: 'Berlin' })).toEqual({ country: 'DE', city: 'Berlin' })
		expect(cleanAddress({ country: 'US', line1: '  ' })).toBeUndefined()
		expect(cleanAddress({ country: 'ZZ', line1: 'x' })).toEqual({ line1: 'x' })
	})
})

describe('readAddress', () => {
	it('round-trips through a text column', () => {
		expect(readAddress(encodeAddress(austin))).toEqual(austin)
		expect(encodeAddress({ country: 'US' })).toBe('')
	})

	it('keeps an old line whole unless it ends as Eden wrote it from a page', () => {
		expect(readAddress('1 Elm St')).toEqual({ line1: '1 Elm St' })
		expect(readAddress('1 Elm St, Springfield', 'US')).toEqual({ line1: '1 Elm St, Springfield' })
		expect(readAddress('4301 Duval St, Austin, TX 78751', 'US')).toEqual({
			country: 'US',
			line1: '4301 Duval St',
			city: 'Austin',
			region: 'TX',
			postalCode: '78751',
		})
		expect(readAddress('1 Main St, Toronto, ON M5V 2T6', 'CA')?.postalCode).toBe('M5V 2T6')
		expect(readAddress('4301 Duval St, Austin, TX 78751', 'DE')).toEqual({ line1: '4301 Duval St, Austin, TX 78751' })
	})

	it('reads parts, and nothing from anything else', () => {
		expect(readAddress({ country: 'us', line1: ' a ', extra: 1 })).toEqual({ line1: 'a' })
		expect(readAddress({ country: 'US' })).toBeUndefined()
		expect(readAddress('')).toBeUndefined()
		expect(readAddress(4)).toBeUndefined()
		expect(readAddress('{broken')).toEqual({ line1: '{broken' })
	})
})

describe('an address from a geocoder', () => {
	const hit = { name: 'x', point: { lng: 0, lat: 0 }, source: 'osm', externalId: 'N1' }

	it('lays out a geocoder hit as its country writes the first line', () => {
		expect(
			addressFromHit({
				...hit,
				street: 'Duval Street',
				houseNumber: '4301',
				city: 'Austin',
				locality: 'Hyde Park',
				region: 'Texas',
				postalCode: '78751',
				countryCode: 'us',
			})
		).toEqual({ country: 'US', line1: '4301 Duval Street', city: 'Austin', region: 'TX', postalCode: '78751' })
		expect(
			addressFromHit({ ...hit, street: 'Hauptstraße', houseNumber: '12', city: 'Berlin', countryCode: 'DE' })
		).toEqual({ country: 'DE', line1: 'Hauptstraße 12', city: 'Berlin' })
		expect(addressFromHit({ ...hit, addressLine: '5 High St', locality: 'Leeds' })).toEqual({
			line1: '5 High St',
			city: 'Leeds',
		})
		expect(addressFromHit(hit)).toBeUndefined()
	})
})

describe('addressForm', () => {
	const label = (id: string, values?: Record<string, string>) => (values?.example ? `${id}(${values.example})` : id)

	it('gives a country’s fields in its order, labelled as it calls them', () => {
		const us = addressForm(austin, { label, home: 'US' })
		expect(us.country).toBe('US')
		expect(us.rows.map((row) => row.map((field) => field.label))).toEqual([
			['line1'],
			['line2'],
			['city.city'],
			['region.state', 'postal.zip'],
		])
		expect(us.rows[3]?.[0]?.options).toHaveLength(51)
		expect(us.rows[3]?.[1]).toMatchObject({ placeholder: '78751', autocomplete: 'postal-code' })

		const jp = addressForm(shibuya, { label, locale: 'ja' })
		expect(jp.rows.map((row) => row.map((field) => field.key))).toEqual([
			['postalCode', 'region'],
			['city'],
			['line1'],
			['line2'],
		])
		expect(jp.rows[0]?.[1]?.options?.[12]).toEqual({ value: '13', label: '東京都' })
	})

	it('starts an address with no country in the default one, and offers it first', () => {
		const form = addressForm({ line1: 'old' }, { label, home: 'JP' })
		expect(form.country).toBe('JP')
		expect(form.countries[0]?.options[0]?.value).toBe('JP')
		expect(form.countries[1]?.options).toHaveLength(249)
	})

	it('words an error and marks what is required', () => {
		const form = addressForm(
			{ country: 'US', postalCode: '1' },
			{ label, require: ['city'], errors: { postalCode: 'postal', city: 'required' } }
		)
		expect(form.rows[2]?.[0]).toMatchObject({ required: true, error: 'error.required(78751)' })
		expect(form.rows[3]?.[1]?.error).toBe('error.postal(78751)')
	})
})
