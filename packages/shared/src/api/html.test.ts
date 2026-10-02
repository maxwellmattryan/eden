import { describe, expect, it } from 'vitest'
import {
	businessDetails,
	decodeEntities,
	htmlToText,
	httpsAddress,
	jsonLdNodes,
	ldTypeMatches,
	pageImage,
	pageMeta,
	pageSiteName,
	pageTitle,
} from './html.js'

describe('a page as text', () => {
	it('keeps the words of a page and drops what is not shown', () => {
		const html = `<html><head><title>x</title><style>p{}</style></head><body><script>var a = '<p>no</p>'</script>
			<h1>Your order</h1><table><tr><td>Bananas</td><td>2&nbsp;lb</td></tr><tr><td>Eggs &amp; more</td><td>12</td></tr></table>
			<p>Total: &#36;18.40<br>Thanks</p></body></html>`
		expect(htmlToText(html)).toBe('Your order\nBananas 2 lb\nEggs & more 12\n\nTotal: $18.40\nThanks')
	})

	it('cuts a page to its cap', () => {
		expect(htmlToText('<p>abcdefghij</p>', 4)).toBe('abcd')
	})

	it('decodes named and numbered entities and leaves the rest', () => {
		expect(decodeEntities('&frac12; cup &#x41;&#66; &unknown;')).toBe('½ cup AB &unknown;')
	})

	it('reads a page’s title as one line, and nothing where there is none', () => {
		expect(pageTitle('<html><head><title>\n  Dal &amp; rice |\tSerious Eats </title></head></html>')).toBe(
			'Dal & rice | Serious Eats'
		)
		expect(pageTitle('<TITLE lang="en">Leeks</TITLE>')).toBe('Leeks')
		expect(pageTitle('<p>no title</p>')).toBeUndefined()
		expect(pageTitle('<title>   </title>')).toBeUndefined()
		expect(pageTitle(`<title>${'x'.repeat(300)}</title>`)).toHaveLength(200)
	})
})

describe('what a page says of itself', () => {
	const ld = (...nodes: unknown[]) =>
		nodes.map((node) => `<script type="application/ld+json">${JSON.stringify(node)}</script>`).join('')
	const cafe = {
		'@context': 'https://schema.org',
		'@type': ['CafeOrCoffeeShop', 'LocalBusiness'],
		name: 'Cuv&eacute;e Coffee',
		telephone: '(512) 555-0142',
		address: { streetAddress: '48 East Ave', addressLocality: 'Austin', addressRegion: 'TX', postalCode: '78701' },
		openingHours: ['Mo-Fr 07:00-17:00', 'Sa-Su 08:00-17:00'],
	}

	it('reads every JSON-LD object, through @graph, and passes over a script that does not parse', () => {
		const html = `${ld({ '@graph': [cafe, { '@type': 'WebSite' }] })}<script type="application/ld+json">{ nope</script>`
		const found = jsonLdNodes(html)
		expect(found.map((node) => node['@type'])).toEqual([undefined, cafe['@type'], 'WebSite'])
		expect(ldTypeMatches(found[1]!, /LocalBusiness$/)).toBe(true)
		expect(ldTypeMatches(found[2]!, /LocalBusiness$/)).toBe(false)
	})

	it("reads a business's phone, address and opening hours", () => {
		expect(businessDetails(ld(cafe), /(?:LocalBusiness|CafeOrCoffeeShop)$/)).toEqual({
			phone: '(512) 555-0142',
			address: '48 East Ave, Austin, TX 78701',
			openingHours: ['Mo-Fr 07:00-17:00', 'Sa-Su 08:00-17:00'],
		})
		// hours written as one string are one rule
		expect(businessDetails(ld({ ...cafe, openingHours: 'Mo-Su 07:00-24:00' }), /LocalBusiness$/).openingHours).toEqual([
			'Mo-Su 07:00-24:00',
		])
	})

	it('answers nothing for what several branches do not agree on, or for another kind of thing', () => {
		const other = { ...cafe, telephone: '(512) 555-0199', address: '1 Other St' }
		expect(businessDetails(ld(cafe, other), /LocalBusiness$/)).toEqual({ openingHours: cafe.openingHours })
		expect(businessDetails(ld({ '@type': 'Recipe', telephone: '555' }), /LocalBusiness$/)).toEqual({})
	})

	it('takes an https address only, against the page it is on', () => {
		expect(httpsAddress('/img/patio.jpg', 'https://example.com/visit')).toBe('https://example.com/img/patio.jpg')
		expect(httpsAddress('http://example.com/a.jpg')).toBeUndefined()
		expect(httpsAddress('javascript:alert(1)')).toBeUndefined()
		expect(httpsAddress('not an address')).toBeUndefined()
	})

	it("reads a page's meta tags, whichever order their attributes come in", () => {
		const html = `<meta content="Cosmic Coffee" property="og:site_name"><meta property="og:image" content="/patio.jpg">
			<meta name="twitter:image" content="https://cdn.example.com/t.jpg">`
		expect(pageMeta(html, 'og:site_name')).toBe('Cosmic Coffee')
		expect(pageSiteName(html)).toBe('Cosmic Coffee')
		expect(pageImage(html, 'https://example.com/')).toBe('https://example.com/patio.jpg')
		expect(pageImage('<meta name="twitter:image" content="http://plain.example.com/t.jpg">')).toBeUndefined()
		expect(pageMeta(html, 'og:title')).toBe('')
	})
})
