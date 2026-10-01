// A product's page as a link the owner pastes (D-91): what the address alone says of the product, with nothing
// fetched to learn it. A grocer's page is often behind a wall a program should not climb, and need not be: the
// address names the product, and the grocer's picture of it lives at an address the product's number gives. So a
// link becomes a name, a store and the address of a picture, and only the picture is ever asked for.
//
// H-E-B is the one grocer read today. Its product address is `/product-detail/<name-in-words>/<number>`, and its
// picture of the product is on its image host under that number, padded to nine digits, with `-1` for the first
// picture: the address its own page loads. It is asked for at a small size, since a small picture is all that is
// kept. Neither address is documented: if either changes, a link reads as no product, or its picture is not found,
// and the owner chooses a picture by hand.

export interface ProductLink {
	/** The store the link is to, as the owner would say it. */
	store: string
	/** The product's name, from the words in its address. */
	name: string
	/** How much one of it is, when the address ends with it: "9 ct", "16 oz". */
	size?: string
	/** Where the grocer's picture of it is. */
	imageUrl: string
}

/** The units a product's address closes on, as the grocer writes them. */
const SIZE = /^(.*?)-(\d+(?:-\d+)?)-(ct|count|pk|pack|oz|fl-oz|lb|lbs|g|kg|ml|l|gal|qt|pt)$/

const HEB_HOSTS = new Set(['www.heb.com', 'heb.com'])
const HEB_PRODUCT = /^\/product-detail\/([a-z0-9-]+)\/(\d{1,9})\/?$/i
const HEB_IMAGES = 'https://images.heb.com/is/image/HEBGrocery/'
/** The first picture of the product, no taller than this and fitted whole. */
const HEB_PICTURE = '-1?hei=480&fit=constrain&qlt=80'

/** A name from the words of an address: spaces for the hyphens, a capital to start, the store's own name as it is written. */
function words(slug: string): string {
	const text = slug
		.replace(/-+/g, ' ')
		.replace(/\bh e b\b/g, 'H-E-B')
		.trim()
	return text ? `${text[0]!.toUpperCase()}${text.slice(1)}` : ''
}

function address(text: string): URL | undefined {
	try {
		const url = new URL(text.trim())
		return url.protocol === 'https:' ? url : undefined
	} catch {
		return undefined
	}
}

/** The product a link is to, when it is a product page of a grocer this reads; nothing for any other text. */
export function productLink(text: string): ProductLink | undefined {
	const url = address(text)
	if (!url || !HEB_HOSTS.has(url.hostname.toLowerCase())) return undefined
	const match = HEB_PRODUCT.exec(url.pathname)
	if (!match) return undefined
	const [, slug, id] = match
	const sized = SIZE.exec(slug!.toLowerCase())
	const name = words(sized ? sized[1]! : slug!)
	if (!name) return undefined
	return {
		store: 'H-E-B',
		name,
		...(sized ? { size: `${sized[2]!.replace('-', '.')} ${sized[3]!.replace('-', ' ')}` } : {}),
		imageUrl: `${HEB_IMAGES}${id!.padStart(9, '0')}${HEB_PICTURE}`,
	}
}

/**
 * The address of a picture a pasted link means: the grocer's picture when the link is a product's page, else the
 * link itself, which the owner copied from a picture ("Copy Image Address"). Nothing for what is not an `https`
 * address.
 */
export function pictureAddress(text: string): string | undefined {
	return productLink(text)?.imageUrl ?? address(text)?.toString()
}
