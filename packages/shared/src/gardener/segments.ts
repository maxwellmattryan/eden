// How a reply's blocks are drawn (docs/design/ux-patterns.md, "Gardener surfaces"): in the order they happened, so
// what the Gardener said before it used its tools stays above them and its answer comes after. Consecutive read
// calls fold into one run; a call the owner must answer or read about (a confirm owed, a failure, anything that
// writes) always stands alone.
import type { MessageBlock, ToolState } from './runtime-types.js'

export type ToolBlock = Extract<MessageBlock, { kind: 'tool' }>

/** `index` is the block's place in the message, which is what settles and keys it. */
export type Segment =
	| { kind: 'text'; text: string; index: number }
	| { kind: 'card'; block: Exclude<MessageBlock, { kind: 'text' | 'can-see' | 'draft' }>; index: number }
	| { kind: 'run'; items: { block: ToolBlock; index: number }[]; index: number }

const FOLDS: readonly ToolState[] = ['running', 'done', 'cancelled']

/**
 * A message's blocks as the bubble draws them. The can-see block is the chip's and a draft is its own message, so
 * neither is here. `stateOf` is how a card's stored state reads now (one left running by a request that is gone
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
		if (block.kind === 'can-see' || block.kind === 'draft') return
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
