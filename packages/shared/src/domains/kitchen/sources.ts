// What Hearth reads that is not a photo, as plain text a model can be given: an order confirmation saved as an
// `.eml` file (product/domains/kitchen.md, "Integrations": the seam the Gmail connector hands its emails to), and
// a web page a recipe is on. Both keep the words and drop the markup; neither reaches out to anything.

import { decodeEntities, htmlToText } from '../../api/html.js'

// a page's words are read the same way wherever a page is read: the helpers are the shared ones
export { decodeEntities, htmlToText }

interface Part {
	headers: Map<string, string>
	body: string
}

/** A message or one of its parts: the headers, unfolded and by lower-case name, and what follows the blank line. */
function split(raw: string): Part {
	const text = raw.replace(/\r\n/g, '\n')
	const gap = text.indexOf('\n\n')
	const head = gap === -1 ? text : text.slice(0, gap)
	const headers = new Map<string, string>()
	for (const line of head.replace(/\n[ \t]+/g, ' ').split('\n')) {
		const colon = line.indexOf(':')
		if (colon > 0) headers.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim())
	}
	return { headers, body: gap === -1 ? '' : text.slice(gap + 2) }
}

function decodeBytes(bytes: Uint8Array, charset: string | undefined): string {
	try {
		return new TextDecoder(charset || 'utf-8').decode(bytes)
	} catch {
		return new TextDecoder('utf-8').decode(bytes)
	}
}

function fromBase64(text: string): Uint8Array {
	try {
		const binary = atob(text.replace(/[^A-Za-z0-9+/=]/g, ''))
		return Uint8Array.from(binary, (char) => char.charCodeAt(0))
	} catch {
		return new Uint8Array()
	}
}

function fromQuotedPrintable(text: string): Uint8Array {
	const joined = text.replace(/=\n/g, '')
	const bytes: number[] = []
	for (let at = 0; at < joined.length; at++) {
		const hex = joined[at] === '=' ? joined.slice(at + 1, at + 3) : ''
		if (/^[0-9a-f]{2}$/i.test(hex)) {
			bytes.push(parseInt(hex, 16))
			at += 2
		} else {
			// what was not escaped is as it was read: the file's own text, written back as UTF-8
			bytes.push(...new TextEncoder().encode(joined[at]!))
		}
	}
	return Uint8Array.from(bytes)
}

const param = (header: string | undefined, name: string): string | undefined =>
	new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|([^;\\s]*))`, 'i')
		.exec(header ?? '')
		?.slice(1)
		.find((value) => value !== undefined)

/** A header's encoded words (`=?UTF-8?B?…?=`, RFC 2047) as text. */
function decodeWords(value: string): string {
	return value
		.replace(/\?=\s+=\?/g, '?==?')
		.replace(/=\?([^?]+)\?([bq])\?([^?]*)\?=/gi, (_whole, charset: string, encoding: string, body: string) =>
			decodeBytes(
				encoding.toLowerCase() === 'b' ? fromBase64(body) : fromQuotedPrintable(body.replace(/_/g, ' ')),
				charset
			)
		)
}

/** The plain and the HTML text of a part, through its parts when it is a multipart. */
function texts(part: Part, found: { plain: string[]; html: string[] }, depth = 0): void {
	const type = part.headers.get('content-type') ?? 'text/plain'
	const boundary = param(type, 'boundary')
	if (/^multipart\//i.test(type) && boundary && depth < 8) {
		for (const piece of part.body.split(`--${boundary}`).slice(1)) {
			if (piece.startsWith('--')) break
			texts(split(piece.replace(/^\n/, '')), found, depth + 1)
		}
		return
	}
	if (/attachment/i.test(part.headers.get('content-disposition') ?? '')) return
	const encoding = (part.headers.get('content-transfer-encoding') ?? '').toLowerCase()
	const charset = param(type, 'charset')
	const body =
		encoding === 'base64'
			? decodeBytes(fromBase64(part.body), charset)
			: encoding === 'quoted-printable'
				? decodeBytes(fromQuotedPrintable(part.body), charset)
				: part.body
	if (/^text\/html/i.test(type)) found.html.push(body)
	else if (/^text\/plain/i.test(type)) found.plain.push(body)
}

/**
 * An email file as text: its subject, sender and date, then what it says. The plain part is used when it holds
 * the message; an order confirmation often puts only a line there and the order in the HTML, so the HTML's text is
 * used when it is much the longer.
 */
export function emlToText(raw: string, cap = 60_000): string {
	const message = split(raw)
	const found = { plain: [] as string[], html: [] as string[] }
	texts(message, found)
	const plain = found.plain.join('\n').trim()
	const html = htmlToText(found.html.join('\n'), cap)
	const body = plain.length * 2 >= html.length ? plain : html
	const head = (['subject', 'from', 'date'] as const)
		.map((name) => [name, message.headers.get(name)] as const)
		.filter(([, value]) => value)
		.map(([name, value]) => `${name[0]!.toUpperCase()}${name.slice(1)}: ${decodeWords(value!)}`)
	return [...head, '', body].join('\n').trim().slice(0, cap)
}
