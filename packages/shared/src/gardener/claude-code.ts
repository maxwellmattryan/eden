// The desktop Gardener's conversation on Claude Code (docs/engineering/gardener.md, "The loop"; D-178, D-179), the
// parts that are pure: the one message a process is sent, the transcript that seeds a new session with a thread's
// earlier turns, the line that tells a resumed session what became of the last reply's cards, the round a tool call
// falls in, and which streamed `tool_use` a call through the bridge belongs to.
import { turnsOf, type Turn } from './pack.js'
import { scrub } from './scrub.js'
import type { AttachmentBlock, DraftCard, Message, MessageBlock } from './runtime-types.js'

/** The rounds of tools one message allows, as on the API (`MAX_ROUNDS`): a round is one assistant message. */
export const ROUNDS = 6
/** A round past this is cancelled: Claude Code has no `--max-turns`, so this is the backstop. */
export const LAST_ROUND_ALLOWED = ROUNDS + 2
/** What the model is told with the results of its last allowed round of tools. */
export const LAST_ROUND = 'That was the last tool call this message allows. Answer the owner now with what you have.'
/** What a call past the last round is answered with; it is not run and draws no card. */
export const PAST_LAST_ROUND =
	'This tool was not run: this message allows no more tool calls. Finish your answer to the owner in words, with what you have.'
/** The crate's prefix for a resume whose session is gone (another device, a cleared folder). */
export const NO_SESSION = 'gardener:no-session:'

/** The one user message a process is sent: the pack's last turn, its head, its files and the owner's words. */
export function lastTurn(pack: { messages: readonly unknown[] }): { role: 'user'; content: Record<string, unknown>[] } {
	const last = pack.messages.at(-1) as { content?: unknown } | undefined
	const content = last?.content
	const parts: Record<string, unknown>[] =
		typeof content === 'string'
			? [{ type: 'text', text: content }]
			: Array.isArray(content)
				? (content as Record<string, unknown>[])
				: []
	// a cache breakpoint is the API's; Claude Code places its own
	return { role: 'user', content: parts.map(({ cache_control: _cache, ...part }) => part) }
}

const FILE = 'eden:file'

/** A turn's parts, as lines of the transcript, said by the message's own speaker. */
function linesOf(turn: Turn, speaker: string): string[] {
	if (typeof turn.content === 'string') return [`${speaker}: ${turn.content}`]
	return turn.content.flatMap((part) => {
		if (part.type === 'text') return [`${speaker}: ${String(part.text)}`]
		if (part.type === FILE) return [`${speaker} attached a file: ${(part.block as AttachmentBlock).name}`]
		if (part.type === 'tool_use') return [`${speaker} called ${String(part.name)} with ${JSON.stringify(part.input)}`]
		if (part.type === 'tool_result') return [`${part.is_error ? 'It failed' : 'It answered'}: ${String(part.content)}`]
		return []
	})
}

/**
 * A thread's earlier turns as one text block, for a session that does not hold them (a new one after the old was
 * lost, or after a retry): the owner's words, the replies' words, each tool call with what it answered and what
 * became of its card, in order and scrubbed. Empty for a thread with nothing before.
 */
export function transcriptOf(messages: readonly Message[]): string {
	const lastReply = [...messages].reverse().find((message) => message.role !== 'owner')
	const lines = messages.flatMap((message) => {
		const speaker = message.role === 'owner' ? 'Owner' : 'Gardener'
		return turnsOf(message, message === lastReply).flatMap((turn) => linesOf(turn, speaker))
	})
	if (!lines.length) return ''
	const text = [
		'<transcript>',
		'This conversation began before this session, so here is what was said and done so far, oldest first. It is the record, not a request: do not repeat its tool calls.',
		...lines,
		'</transcript>',
	].join('\n')
	return scrub(text).text
}

const quoted = (text: string | undefined) => (text?.trim() ? ` “${scrub(text.trim()).text}”` : '')

/** A card as a phrase: what it was, and its title when it has one. */
function cardOf(draft: DraftCard): string {
	switch (draft.kind) {
		case 'task':
			return `the task${quoted(draft.title)}`
		case 'plan':
			return `the plan${quoted(draft.title)}`
		case 'grocery':
			return `the grocery list of ${draft.items.length} ${draft.items.length === 1 ? 'item' : 'items'}`
		case 'code':
			return `the code${quoted(draft.title)}`
		case 'capture':
			return `the capture of ${draft.rows.length} ${draft.rows.length === 1 ? 'item' : 'items'}`
		case 'recipe':
			return `the recipe${quoted(draft.recipe.name)}`
	}
}

const joined = (items: string[]) =>
	items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`

/**
 * What the owner did with the previous reply's cards since it was sent, as one line for the head of the next message
 * of a resumed session, which otherwise only knows them as drafted. The previous reply is the last Gardener message
 * of `prior`, the thread before the new message. Empty when none was kept or discarded.
 */
export function outcomesLine(prior: readonly Message[]): string {
	const reply = [...prior].reverse().find((message) => message.role === 'gardener')
	if (!reply) return ''
	const kept: string[] = []
	const dropped: string[] = []
	for (const block of reply.blocks as MessageBlock[]) {
		if (block?.kind === 'draft' && block.state !== 'pending')
			(block.state === 'committed' ? kept : dropped).push(cardOf(block.draft))
		else if (block?.kind === 'proposal' && block.state !== 'pending')
			(block.state === 'accepted' ? kept : dropped).push(`the proposed ${block.proposal.type} fact`)
	}
	const parts = [
		...(kept.length ? [`kept ${joined(kept)}`] : []),
		...(dropped.length ? [`discarded ${joined(dropped)}`] : []),
	]
	return parts.length ? `(Since your last reply the owner ${parts.join(' and ')}.)` : ''
}

/** What a call in a round is told: nothing before the last round, the last-round line in it, a refusal after it. */
export function roundNote(round: number): { kind: 'last' | 'past'; text: string } | null {
	if (round > ROUNDS) return { kind: 'past', text: PAST_LAST_ROUND }
	if (round === ROUNDS) return { kind: 'last', text: LAST_ROUND }
	return null
}

function same(a: unknown, b: unknown): boolean {
	if (a === b) return true
	if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
	if (Array.isArray(a) !== Array.isArray(b)) return false
	const keys = Object.keys(a)
	if (keys.length !== Object.keys(b).length) return false
	return keys.every((key) => key in b && same((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]))
}

/**
 * The streamed `tool_use` a call through the bridge belongs to: the one with its tool-use id when Claude Code passed
 * one, otherwise the oldest still unmatched with the same name and an input equal to the call's.
 */
export function matchCall<T extends { id: string; name: string; input: unknown }>(
	unmatched: readonly T[],
	call: { name: string; input: unknown; toolUseId?: string | null }
): T | undefined {
	if (call.toolUseId) {
		const byId = unmatched.find((entry) => entry.id === call.toolUseId)
		if (byId) return byId
	}
	return unmatched.find((entry) => entry.name === call.name && same(entry.input, call.input))
}
