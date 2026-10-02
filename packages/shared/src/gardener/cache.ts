// The provider's prompt cache, asked for by the request (D-147): a breakpoint at the end of the conversation as it
// stands, so a request's next round reads everything before its own tool results at the cache price, and the pack's
// own on the settled history, so the next message reads that. The key is the bytes of the prefix, so nothing here
// invalidates anything: a moved marker leaves the earlier positions readable.

const EPHEMERAL = { type: 'ephemeral' } as const

interface Turn {
	role: string
	content: unknown
}

type Block = Record<string, unknown>

/** A block the API takes a marker on: not reasoning, and not a text block with no words. */
function markable(block: unknown): block is Block {
	if (typeof block !== 'object' || block === null) return false
	const { type, text } = block as Block
	if (type === 'thinking' || type === 'redacted_thinking') return false
	return type !== 'text' || (typeof text === 'string' && text.length > 0)
}

function unmarked(block: unknown): unknown {
	if (typeof block !== 'object' || block === null || !('cache_control' in block)) return block
	const rest: Block = { ...(block as Block) }
	delete rest.cache_control
	return rest
}

/**
 * The turn with a cache breakpoint on its last block; a turn of plain words becomes one text block to carry it. A
 * turn with nothing to mark, or whose last block takes no marker, is returned as it came.
 */
export function marked<T>(turn: T): T {
	const { content } = turn as Turn
	const blocks: unknown[] =
		typeof content === 'string' ? [{ type: 'text', text: content }] : Array.isArray(content) ? [...content] : []
	const at = blocks.length - 1
	// only the turn's last block ends the whole prefix; a marker further in would leave its tail unread
	if (at < 0 || !markable(blocks[at])) return turn
	blocks[at] = { ...(blocks[at] as Block), cache_control: EPHEMERAL }
	return { ...turn, content: blocks }
}

/**
 * The messages with the cache breakpoint on the last block of the last turn, and on no block from `from` on but
 * that one: the turns ahead of `from` are the settled history, whose markers are the pack's and stay. Nothing given
 * is changed.
 */
export function withBreakpoint(messages: readonly unknown[], from = 0): unknown[] {
	const out = messages.map((message, index) => {
		const turn = message as Turn
		if (index < from || !Array.isArray(turn.content)) return message
		return turn.content.some((block) => block !== unmarked(block))
			? { ...turn, content: turn.content.map(unmarked) }
			: message
	})
	if (out.length) out[out.length - 1] = marked(out[out.length - 1])
	return out
}
