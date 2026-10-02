import { describe, expect, it } from 'vitest'
import { lacksPicture } from './backfill.js'
import { createOsmHours, hoursFromTags, overpassQuery } from './osm-hours.js'
import { fetchDetail, searchHours, sourcesFor } from './registry.js'
import type { DetailSource, PlaceRef } from './types.js'
import { hoursFromPage, pageAddress } from './website.js'

const place: PlaceRef = { key: 'p1', name: 'Cuvée Coffee', osmId: 'W1509586272', url: 'https://cuveecoffee.com/' }

describe('hours from OpenStreetMap', () => {
	it('asks Overpass for one public object by its id, and for nothing that is not one', () => {
		expect(overpassQuery('W1509586272')).toBe('[out:json][timeout:10];way(1509586272);out tags;')
		expect(overpassQuery('n42')).toBe('[out:json][timeout:10];node(42);out tags;')
		expect(overpassQuery('R7')).toContain('relation(7)')
		for (const bad of ['', 'X12', 'W', 'W12;node(1)', '929874401']) expect(overpassQuery(bad), bad).toBeUndefined()
	})

	it('reads the hours, and the website and phone the tags give', () => {
		expect(
			hoursFromTags({
				opening_hours: 'Mo-Fr 07:00-17:00; Sa,Su 08:00-17:00',
				website: 'http://cuvee.example',
				'contact:phone': '+1 512 555 0142',
			})
		).toMatchObject({ text: 'Mo-Fr 07:00-17:00; Sa,Su 08:00-17:00', phone: '+1 512 555 0142' })
		// hours it cannot parse are kept as written, with no week; a site that is not https is not kept
		const odd = hoursFromTags({ opening_hours: 'sunrise-sunset', website: 'http://plain.example' })
		expect(odd).toEqual({ text: 'sunrise-sunset' })
		expect(hoursFromTags({ opening_hours: 'Mo-Su 07:00-24:00', website: 'https://cosmic.example/' })?.website).toBe(
			'https://cosmic.example/'
		)
		expect(hoursFromTags({ name: 'No hours' })).toBeNull()
		expect(hoursFromTags(undefined)).toBeNull()
	})

	it('sends only the id', async () => {
		const asked: string[] = []
		const source = createOsmHours(async <T>(_name: string, destination: string, url: string) => {
			asked.push(`${destination} ${decodeURIComponent(url)}`)
			return { elements: [{ tags: { opening_hours: '24/7' } }] } as T
		})
		expect(source.covers(place)).toBe(true)
		expect(source.covers({ key: 'x', name: 'No id' })).toBe(false)
		expect((await source.fetch(place, { lang: 'en' }))?.spec?.days[0]).toEqual([[0, 1440]])
		expect(asked).toEqual([
			'overpass https://overpass-api.de/api/interpreter?data=[out:json][timeout:10];way(1509586272);out tags;',
		])
		expect(asked[0]).not.toContain('Cuv')
	})
})

describe('hours from a place’s own page', () => {
	const page = (node: unknown) => `<script type="application/ld+json">${JSON.stringify(node)}</script>`

	it('reads schema.org opening hours, and nothing from a page that states none', () => {
		const hours = hoursFromPage(
			page({ '@type': 'CafeOrCoffeeShop', openingHours: ['Mo-Fr 07:00-17:00', 'Sa-Su 08:00-17:00'] })
		)
		expect(hours?.text).toBe('Mo-Fr 07:00-17:00; Sa-Su 08:00-17:00')
		expect(hours?.spec?.days[6]).toEqual([[480, 1020]])
		expect(hoursFromPage(page({ '@type': 'Recipe', openingHours: 'Mo-Fr 07:00-17:00' }))).toBeNull()
		expect(hoursFromPage('<p>Open most days</p>')).toBeNull()
	})

	it('fetches an https address only, in one form', () => {
		expect(pageAddress(place)).toBe('https://cuveecoffee.com/')
		expect(pageAddress({ ...place, url: 'https://cuveecoffee.com/#visit' })).toBe('https://cuveecoffee.com/')
		expect(pageAddress({ ...place, url: 'http://cuveecoffee.com/' })).toBeUndefined()
		expect(pageAddress({ key: 'x', name: 'No page' })).toBeUndefined()
	})
})

describe('a slot', () => {
	const source = (id: string, answer: () => Promise<unknown>): DetailSource<'hours'> => ({
		id,
		slot: 'hours',
		name: id,
		covers: () => true,
		fetch: answer as DetailSource<'hours'>['fetch'],
	})
	const ok = source('second', async () => ({ text: 'Mo-Su 09:00-17:00' }))
	const nothing = source('first', async () => null)
	const broken = source('broken', async () => {
		throw new Error('offline')
	})

	it('tries its sources in order until one answers', async () => {
		expect(await fetchDetail('hours', place, { lang: 'en', sources: [nothing, broken, ok] })).toEqual({
			status: 'ok',
			source: 'second',
			data: { text: 'Mo-Su 09:00-17:00' },
		})
	})

	it('is unavailable when nobody had anything to say, and failed when the last one could not be asked', async () => {
		expect(await fetchDetail('hours', place, { lang: 'en', sources: [broken, nothing] })).toEqual({
			status: 'unavailable',
			source: 'first',
		})
		expect(await fetchDetail('hours', place, { lang: 'en', sources: [nothing, broken] })).toEqual({
			status: 'failed',
			source: 'broken',
		})
		expect(await fetchDetail('hours', place, { lang: 'en', sources: [] })).toEqual({
			status: 'unavailable',
			source: undefined,
		})
	})

	it('leaves out a source the owner turned off, and one that does not cover the place', () => {
		const bare: PlaceRef = { key: 'x', name: 'Typed by hand', hoursText: 'Daily 9 to 5' }
		expect(sourcesFor('hours', bare).map((entry) => entry.id)).toEqual(['search'])
		expect(sourcesFor('hours', place).map((entry) => entry.id)).toEqual(['osm-hours', 'website'])
		expect(sourcesFor('hours', place, ['osm-hours']).map((entry) => entry.id)).toEqual(['website'])
		expect(sourcesFor('photo', place).map((entry) => entry.id)).toEqual(['website-photo'])
		expect(sourcesFor('card', place)).toEqual([])
	})

	it('keeps what a search wrote as it is when it does not parse', async () => {
		expect(await searchHours.fetch({ key: 'x', name: 'x', hoursText: 'Daily 9 to 5' }, { lang: 'en' })).toEqual({
			text: 'Daily 9 to 5',
		})
		expect(
			(await searchHours.fetch({ key: 'x', name: 'x', hoursText: 'Mo-Su 09:00-17:00' }, { lang: 'en' }))?.spec
		).toBeDefined()
	})
})

describe('finding a missing picture', () => {
	it('asks about a place with neither a picture nor a thumbnail', () => {
		expect(lacksPicture({})).toBe(true)
		expect(lacksPicture({ thumb: 'data:image/jpeg;base64,AA' })).toBe(false)
		expect(lacksPicture({ photoId: 'a1' })).toBe(false)
	})
})
