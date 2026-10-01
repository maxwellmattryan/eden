import { describe, expect, it } from 'vitest'
import { guessedIcons, iconAddresses, siteAddress, storeDetails, wwwAddress } from './store-logo.js'

const PAGE = 'https://www.example.com/shop/'

describe("a store's icons", () => {
	it('puts the touch icons first, then the others, each by its size', () => {
		const html = `
			<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
			<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">
			<link rel="apple-touch-icon" sizes="120x120" href="/touch-120.png">
			<link rel="apple-touch-icon" href="/touch.png">
			<link rel="stylesheet" href="/site.css">`
		expect(iconAddresses(html, PAGE)).toEqual([
			'https://www.example.com/touch.png',
			'https://www.example.com/touch-120.png',
			'https://www.example.com/icon-192.png',
			'https://www.example.com/favicon-32.png',
		])
	})

	it('leaves out an SVG, by its type or its name, and puts an .ico last', () => {
		const html = `
			<link rel="shortcut icon" href="/favicon.ico">
			<link rel="icon" type="image/x-icon" href="/favicon">
			<link rel="icon" type="image/svg+xml" href="/mark">
			<link rel="icon" href="/mark.svg?v=2">
			<link rel="mask-icon" href="/mask.png">
			<link rel="icon" href="/mark.png">`
		expect(iconAddresses(html, PAGE)).toEqual([
			'https://www.example.com/mark.png',
			'https://www.example.com/favicon.ico',
			'https://www.example.com/favicon',
		])
	})

	it('reads an address beside the page, one on another host, and attributes in any order or quotes', () => {
		const html = `
			<link href='touch.png' rel='apple-touch-icon-precomposed'>
			<link sizes=64x64 href=//cdn.example.com/a&amp;b.png rel=icon>`
		expect(iconAddresses(html, PAGE)).toEqual([
			'https://www.example.com/shop/touch.png',
			'https://cdn.example.com/a&b.png',
		])
	})

	it('leaves out what is not https, and names an icon once', () => {
		const html = `
			<link rel="apple-touch-icon" href="http://www.example.com/touch.png">
			<link rel="icon" href="data:image/png;base64,AAAA">
			<link rel="icon" href="/mark.png">
			<link rel="icon" sizes="64x64" href="/mark.png">`
		expect(iconAddresses(html, PAGE)).toEqual(['https://www.example.com/mark.png'])
	})

	it('guesses the touch icon at the root of the site', () => {
		expect(guessedIcons('https://www.example.com/stores/austin?id=4')).toEqual([
			'https://www.example.com/apple-touch-icon.png',
			'https://www.example.com/favicon.ico',
		])
		expect(guessedIcons('example.com')).toEqual([
			'https://example.com/apple-touch-icon.png',
			'https://example.com/favicon.ico',
		])
		expect(guessedIcons('http://example.com')).toEqual([])
	})

	it('names a site under www. when it was typed without', () => {
		expect(wwwAddress('https://99ranch.com/stores')).toBe('https://www.99ranch.com/stores')
		expect(wwwAddress('99ranch.com')).toBe('https://www.99ranch.com/')
		expect(wwwAddress('https://www.99ranch.com')).toBeUndefined()
		expect(wwwAddress('https://192.0.2.10')).toBeUndefined()
		expect(wwwAddress('')).toBeUndefined()
	})

	it('takes a bare name as its https site', () => {
		expect(siteAddress(' www.example.com/shop ')).toBe('https://www.example.com/shop')
		expect(siteAddress('https://example.com')).toBe('https://example.com/')
		expect(siteAddress('ftp://example.com')).toBeUndefined()
		expect(siteAddress('')).toBeUndefined()
	})
})

describe("a store's details", () => {
	const page = (...nodes: unknown[]) =>
		nodes.map((node) => `<script type="application/ld+json">${JSON.stringify(node)}</script>`).join('')

	it('reads the phone and the address a shop gives of itself', () => {
		const html = page({
			'@context': 'https://schema.org',
			'@graph': [
				{ '@type': 'WebSite', name: 'Wheatsville' },
				{
					'@type': 'GroceryStore',
					telephone: '(512) 478-2667',
					address: {
						'@type': 'PostalAddress',
						streetAddress: '3101 Guadalupe St',
						addressLocality: 'Austin',
						addressRegion: 'TX',
						postalCode: '78705',
					},
				},
			],
		})
		expect(storeDetails(html)).toEqual({ phone: '(512) 478-2667', address: '3101 Guadalupe St, Austin, TX 78705' })
	})

	it('takes an address written as one line, and a type given as a list', () => {
		const html = page({ '@type': ['LocalBusiness', 'Bakery'], address: '12 Mill Lane, Hyde Park' })
		expect(storeDetails(html)).toEqual({ address: '12 Mill Lane, Hyde Park' })
	})

	it('answers nothing for what several shops on one page do not agree on', () => {
		const html = page(
			{ '@type': 'Store', telephone: '555-0100', address: '1 First St' },
			{ '@type': 'Store', telephone: '555-0100', address: '2 Second St' }
		)
		expect(storeDetails(html)).toEqual({ phone: '555-0100' })
	})

	it('answers nothing for a page that describes no shop, or whose JSON-LD does not parse', () => {
		expect(storeDetails(page({ '@type': 'Recipe', telephone: '555-0100' }))).toEqual({})
		expect(storeDetails('<script type="application/ld+json">{ not json</script>')).toEqual({})
	})
})
