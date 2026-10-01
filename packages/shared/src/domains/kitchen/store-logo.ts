// A store's picture from its own website (product/domains/kitchen.md, "Grocery"): the icon the site names for a
// home screen, which is its mark at a size worth showing. Only the addresses are worked out here; the app fetches
// them. A site's `.ico` is the last resort (D-103): a grocer that keeps programs from its page often still gives it.
// An SVG is never taken.
import { decodeEntities } from './sources.js'
import { httpsAddress } from './recipe-import.js'

/** The size a touch icon is when its tag does not say: what a phone asks for. */
const TOUCH_EDGE = 180

/** An attribute of a tag, whichever quotes it wears, or none. */
function attribute(tag: string, name: string): string {
	const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(tag)
	return decodeEntities(match?.[1] ?? match?.[2] ?? match?.[3] ?? '').trim()
}

/** The longest edge a `sizes` attribute declares (`180x180`, `32x32 64x64`); 0 when it declares none. */
const edgeOf = (sizes: string): number =>
	Math.max(0, ...[...sizes.matchAll(/(\d+)x(\d+)/gi)].map(([, width, height]) => Math.max(+width!, +height!)))

/** The address a store's website was typed as, as an `https` one: a bare `heb.com` is taken as its site. */
export function siteAddress(url: string): string | undefined {
	const typed = url.trim()
	if (!typed) return undefined
	return httpsAddress(/^[a-z][a-z\d+.-]*:/i.test(typed) ? typed : `https://${typed}`)
}

/**
 * A site's address under `www.`, for a site typed without it: many answer only there, or send every other address
 * to their front page. Nothing for one already under `www.`, or for a bare number.
 */
export function wwwAddress(url: string): string | undefined {
	const site = siteAddress(url)
	if (!site) return undefined
	const address = new URL(site)
	if (/^www\./i.test(address.hostname) || !/[a-z]/i.test(address.hostname.split('.').pop() ?? '')) return undefined
	address.hostname = `www.${address.hostname}`
	return address.href
}

/**
 * The icons a page names for itself, the best first: its touch icons, then its other icons, each by the size it
 * declares, then any `.ico`. An SVG is left out, and so is any address that is not `https`.
 */
export function iconAddresses(html: string, pageUrl?: string): string[] {
	const found: { address: string; touch: boolean; ico: boolean; edge: number }[] = []
	for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
		const rel = attribute(tag, 'rel').toLowerCase().split(/\s+/)
		const touch = rel.some((entry) => entry.startsWith('apple-touch-icon'))
		if (!touch && !rel.includes('icon')) continue
		const type = attribute(tag, 'type').toLowerCase()
		if (type.includes('svg')) continue
		const address = httpsAddress(attribute(tag, 'href'), pageUrl)
		if (!address || /\.svg$/i.test(new URL(address).pathname)) continue
		const ico = type.includes('icon') || /\.ico$/i.test(new URL(address).pathname)
		if (found.some((entry) => entry.address === address)) continue
		found.push({ address, touch, ico, edge: edgeOf(attribute(tag, 'sizes')) || (touch ? TOUCH_EDGE : 0) })
	}
	return found
		.sort((a, b) => Number(a.ico) - Number(b.ico) || Number(b.touch) - Number(a.touch) || b.edge - a.edge)
		.map((entry) => entry.address)
}

/** Where a site keeps its touch icon and its favicon when its page names none, or could not be read. */
export function guessedIcons(pageUrl: string): string[] {
	const site = siteAddress(pageUrl)
	return site ? ['/apple-touch-icon.png', '/favicon.ico'].map((path) => new URL(path, site).href) : []
}
