// A web page as plain text a model can be given: the words kept and the markup dropped. Nothing here reaches out to
// anything; `web.ts` fetches a page and this reads it. Hearth's sources (a recipe's page, an order confirmation) and
// the Gardener's `read-page` share it.

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
