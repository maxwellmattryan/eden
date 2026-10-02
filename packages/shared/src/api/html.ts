// A web page as plain text a model can be given: the words kept and the markup dropped. Nothing here reaches out to
// anything; `web.ts` fetches a page and this reads it. Hearth's sources (a recipe's page, an order confirmation) and
// the Gardener's `read-page` share it. What a page says of itself in schema.org JSON-LD and in its `<meta>` tags is
// read here too, with no model asked: Hearth reads a recipe and a store that way, Meadow a place.

const ENTITIES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' ',
	ndash: '–',
	mdash: '—',
	frac12: '½',
	frac14: '¼',
	frac34: '¾',
	deg: '°',
	times: '×',
}

/** The characters HTML wrote as entities. */
export function decodeEntities(text: string): string {
	return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (whole, name: string) => {
		if (name[0] !== '#') return ENTITIES[name.toLowerCase()] ?? whole
		const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10)
		return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
	})
}

/**
 * A page's text: what is not shown (scripts, styles, the head) is dropped, a block ends a line, a table cell is
 * set off from the next, and the rest of the tags go. Cut to `cap` characters.
 */
export function htmlToText(html: string, cap = 60_000): string {
	const text = decodeEntities(
		html
			.replace(/<!--[\s\S]*?-->/g, ' ')
			.replace(/<(script|style|head|noscript|svg|template)\b[\s\S]*?<\/\1\s*>/gi, ' ')
			.replace(/<br\s*\/?>/gi, '\n')
			.replace(/<\/(p|div|tr|li|h[1-6]|table|section|article|ul|ol|blockquote)\s*>/gi, '\n')
			.replace(/<\/(td|th)\s*>/gi, '\t')
			.replace(/<[^>]*>/g, ' ')
	)
	return text
		.split('\n')
		.map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim())
		.filter((line, index, lines) => line || (index > 0 && lines[index - 1]))
		.join('\n')
		.trim()
		.slice(0, cap)
}

/** A page's own title, from its `<title>`: one line, cut to 200 characters; nothing when it has none. */
export function pageTitle(html: string): string | undefined {
	const match = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html)
	const title = decodeEntities((match?.[1] ?? '').replace(/<[^>]*>/g, ' '))
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 200)
	return title || undefined
}

/** Every object in a JSON-LD document, through arrays and `@graph`. */
function ldNodes(value: unknown, found: Record<string, unknown>[] = [], depth = 0): Record<string, unknown>[] {
	if (depth > 6 || !value || typeof value !== 'object') return found
	if (Array.isArray(value)) {
		for (const entry of value) ldNodes(entry, found, depth + 1)
		return found
	}
	const node = value as Record<string, unknown>
	found.push(node)
	if (node['@graph']) ldNodes(node['@graph'], found, depth + 1)
	return found
}

/** Every object a page describes in JSON-LD, across its scripts; a script that does not parse is passed over. */
export function jsonLdNodes(html: string): Record<string, unknown>[] {
	const scripts = html.matchAll(
		/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script\s*>/gi
	)
	const found: Record<string, unknown>[] = []
	for (const [, body] of scripts) {
		try {
			ldNodes(JSON.parse(body!.trim()), found)
		} catch {
			continue
		}
	}
	return found
}

/** Whether a JSON-LD node is of a schema.org type the pattern matches, among the one or several it names. */
export function ldTypeMatches(node: Record<string, unknown>, pattern: RegExp): boolean {
	return [node['@type']].flat().some((type) => typeof type === 'string' && pattern.test(type))
}

/** An `https` address a page names, absolute; nothing for any other kind of address. */
export function httpsAddress(value: string, base?: string): string | undefined {
	try {
		const url = new URL(value.trim(), base)
		return url.protocol === 'https:' ? url.href : undefined
	} catch {
		return undefined
	}
}

/** The `content` of a page's `<meta>` by its `property` or `name`, whichever order its attributes come in. */
export function pageMeta(html: string, key: string): string {
	for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
		const named = /\b(?:property|name)\s*=\s*["']?([^"'\s>]+)/i.exec(tag)?.[1]
		if (named?.toLowerCase() !== key) continue
		const content = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag)
		const value = decodeEntities((content?.[1] ?? content?.[2] ?? '').replace(/<[^>]*>/g, ' '))
			.replace(/\s+/g, ' ')
			.replace(/ ([.,;:!?])/g, '$1')
			.trim()
		if (value) return value
	}
	return ''
}

/** The picture a page shows of itself when it is shared (`og:image`). */
export function pageImage(html: string, url?: string): string | undefined {
	const named = pageMeta(html, 'og:image:secure_url') || pageMeta(html, 'og:image') || pageMeta(html, 'twitter:image')
	return named ? httpsAddress(named, url) : undefined
}

/** What a page calls itself (`og:site_name`). */
export const pageSiteName = (html: string): string => pageMeta(html, 'og:site_name').slice(0, 120)

const ldLine = (value: unknown): string =>
	typeof value === 'string' || typeof value === 'number'
		? decodeEntities(String(value)).replace(/\s+/g, ' ').trim().slice(0, 200)
		: ''

/** A `PostalAddress` on one line, or an address already written as one. */
function postalLine(value: unknown): string {
	if (Array.isArray(value)) return postalLine(value[0])
	if (!value || typeof value !== 'object') return ldLine(value)
	const node = value as Record<string, unknown>
	const town = [
		ldLine(node.addressLocality),
		[ldLine(node.addressRegion), ldLine(node.postalCode)].filter(Boolean).join(' '),
	]
	return [ldLine(node.streetAddress), ...town].filter(Boolean).join(', ')
}

/** What a business's own page says of it. */
export interface BusinessDetails {
	phone?: string
	address?: string
	/** schema.org's `openingHours`, as written: `Mo-Fr 07:00-17:00`, one entry to a rule. */
	openingHours?: string[]
}

/**
 * A business's phone number, address and opening hours as its page describes them in JSON-LD, among the nodes whose
 * type the pattern matches, read with no model. A page that describes several, as a chain's front page may, answers
 * nothing for what they do not agree on: one branch's address is not the owner's.
 */
export function businessDetails(html: string, types: RegExp): BusinessDetails {
	const shops = jsonLdNodes(html).filter((node) => ldTypeMatches(node, types))
	const one = (values: string[]) => {
		const said = [...new Set(values.filter(Boolean))]
		return said.length === 1 ? said[0] : undefined
	}
	const phone = one(shops.map((shop) => ldLine(shop.telephone)))
	const address = one(shops.map((shop) => postalLine(shop.address)))
	const hours = one(shops.map((shop) => [shop.openingHours].flat().map(ldLine).filter(Boolean).join('\n')))
	return {
		...(phone ? { phone } : {}),
		...(address ? { address } : {}),
		...(hours ? { openingHours: hours.split('\n') } : {}),
	}
}
