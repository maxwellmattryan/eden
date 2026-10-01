// How a reply's blocks are drawn (docs/design/ux-patterns.md, "Gardener surfaces"): in the order they happened, so
// what the Gardener said before it used its tools stays above them and its answer comes after. Consecutive read
// calls fold into one run; a call the owner must answer or read about (a confirm owed, a failure, anything that
// writes) always stands alone.
import type { MessageBlock, ToolState } from './runtime-types.js'

export type ToolBlock = Extract<MessageBlock, { kind: 'tool' }>

/** `index` is the block's place in the message, which is what settles and keys it. */
export type Segment =
	| { kind: 'text'; text: string; index: number }
	| {
			kind: 'card'
			block: Exclude<MessageBlock, { kind: 'text' | 'can-see' | 'draft' | 'writing' | 'attachment' }>
			index: number
	  }
	| { kind: 'run'; items: { block: ToolBlock; index: number }[]; index: number }

const FOLDS: readonly ToolState[] = ['running', 'done', 'cancelled']

/**
 * A message's blocks as the bubble draws them. The can-see block is the chip's, a draft is its own message and the
 * writing mark is the request's, so none is here. `stateOf` is how a card's stored state reads now (one left running by a request that is gone
 * reads as cancelled).
 */
export function segmentsOf(
	blocks: readonly MessageBlock[],
	stateOf: (state: ToolState) => ToolState = (state) => state
): Segment[] {
	const segments: Segment[] = []
	let run: { block: ToolBlock; index: number }[] = []
	const close = () => {
		const [only] = run
		if (run.length > 1 && only) segments.push({ kind: 'run', items: run, index: only.index })
		else if (only) segments.push({ kind: 'card', ...only })
		run = []
	}
	blocks.forEach((block, index) => {
		// an attachment is on the owner's message, drawn as a file chip, never a card
		if (block.kind === 'can-see' || block.kind === 'draft' || block.kind === 'writing' || block.kind === 'attachment')
			return
		if (block.kind === 'tool' && block.call.access === 'read' && FOLDS.includes(stateOf(block.state))) {
			run.push({ block, index })
			return
		}
		if (block.kind === 'text') {
			if (!block.text.trim()) return
			close()
			segments.push({ kind: 'text', text: block.text, index })
			return
		}
		close()
		segments.push({ kind: 'card', block, index })
	})
	close()
	return segments
}

const BUSY: readonly ToolState[] = ['running', 'pending']

/**
 * Whether a live reply has nothing to watch, so the sprout stands in for it (D-80): no words yet, or its tools are
 * through and the answer has not begun. Words streaming are their own sign, a card running turns its spinner, a
 * confirm owed is the owner's to answer and an error ends the request, so none of those is awaited.
 */
export function awaitsWords(
	segments: readonly Segment[],
	stateOf: (state: ToolState) => ToolState = (state) => state
): boolean {
	const last = segments.at(-1)
	if (!last) return true
	if (last.kind === 'text') return false
	if (last.kind === 'run') return !last.items.some((item) => BUSY.includes(stateOf(item.block.state)))
	if (last.block.kind === 'tool') return !BUSY.includes(stateOf(last.block.state))
	return last.block.kind !== 'error'
}
