// The links a conversation may read at once (docs/engineering/gardener.md, "Tools"), pure: an address the owner
// wrote in one of their own messages is theirs to have read, and `read-page` fetches it without asking; any other
// address waits on the owner's confirm, since a row or a page could have put it there. A match is the whole
// address, never a prefix or a host, so nothing can be appended to an owner's link. The model is given the owner's
// words scrubbed, so an address with a long number in it comes back as `…/[number]`: that form matches too, and
// answers the address as the owner wrote it.
import type { Message, MessageBlock } from './runtime-types.js'
import { scrub } from './scrub.js'

/** The substrate tool that reads a page. */
export const READ_PAGE = 'read-page'

const LINK = /https:\/\/[^\s<>"'`]+/gi

/** A link as it stood in a sentence, without the punctuation that closed the sentence around it. */
function bare(link: string): string {
	let out = link.replace(/[.,;:!?]+$/, '')
	// a closing bracket belongs to the link only when the link opened it
	for (const [open, close] of [
		['(', ')'],
		['[', ']'],
	] as const) {
		while (out.endsWith(close) && out.split(close).length > out.split(open).length) out = out.slice(0, -1)
	}
	return out.replace(/[.,;:!?]+$/, '')
}

/** An `https` address in one form, without its fragment; nothing for anything else. */
export function normalLink(url: string): string | undefined {
	try {
		const parsed = new URL(url.trim())
		if (parsed.protocol !== 'https:') return undefined
		parsed.hash = ''
		return parsed.href
	} catch {
		return undefined
	}
}

/** The `https` addresses the owner wrote, in this conversation's messages and the one being sent, each once. */
export function linksOf(messages: readonly Pick<Message, 'role' | 'blocks'>[], message = ''): string[] {
	const texts = [
		...messages
			.filter((entry) => entry.role === 'owner')
			.flatMap((entry) =>
				(entry.blocks as MessageBlock[]).flatMap((block) => (block.kind === 'text' ? [block.text] : []))
			),
		message,
	]
	const links = texts.flatMap((text) => (text.match(LINK) ?? []).flatMap((link) => normalLink(bare(link)) ?? []))
	return [...new Set(links)]
}

/** The owner's link an address means, as they wrote it: the same address, or the same once scrubbed; else nothing. */
export function resolveLink(url: string, links: readonly string[]): string | undefined {
	const asked = normalLink(url)
	if (!asked) return undefined
	return (
		links.find((link) => link === asked) ??
		links.find((link) => {
			const scrubbed = scrub(link).text
			return scrubbed !== link && (normalLink(scrubbed) ?? scrubbed) === asked
		})
	)
}

/**
 * Whether the conversation holds a page that was read, or what a web search returned, which is a page's words too
 * (D-132): from then on its writes are confirmed each time. `searches` says whether a tool searches the web, by its
 * domain and id; with none given, only a page that was read counts.
 */
export function holdsPage(
	messages: readonly Pick<Message, 'blocks'>[],
	searches: (domain: string, tool: string) => boolean = () => false
): boolean {
	return messages.some((message) =>
		(message.blocks as MessageBlock[]).some(
			(block) =>
				block.kind === 'tool' &&
				block.state === 'done' &&
				((block.call.domain === 'substrate' && block.call.tool === READ_PAGE) ||
					searches(block.call.domain, block.call.tool))
		)
	)
}

/**
 * Text from outside Eden as a tool result carries it: inside `<untrusted>`, as a mirrored row is, with anything in
 * it that would close the wrapper taken apart. The wrapper is in the string itself, so it is there again whenever
 * the thread is replayed.
 */
export function untrusted(source: string, text: string): string {
	const inside = text.replace(/<(\/?untrusted)/gi, '&lt;$1')
	return `<untrusted source="${source.replace(/"/g, '%22')}">\n${inside}\n</untrusted>`
}
