import { describe, expect, it } from 'vitest'
import { decodeEntities, htmlToText, pageTitle } from './html.js'

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
