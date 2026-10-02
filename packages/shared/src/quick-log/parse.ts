// The one-liner behind the palette's `log` verb (D-12; product/substrate/shell.md, "Command palette"): "log grocery
// oat milk" names a quick action by one of its words and gives it the rest as its value. Pure: the caller passes the
// words in the owner's language.
import type { QuickActionKind } from '../manifest/types'

export interface QuickLogCandidate {
	/** `<domain>.<quick action>`. */
	key: string
	/** What the action may be called: its keyword, its label, its domain's name. Each may be several words. */
	words: readonly string[]
}

export interface ParsedQuickLog {
	key: string
	value: string
}

const fold = (text: string) => text.normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ')

/**
 * The action a line names and the value it gives it. The line may start with `verb` ("log"), which is dropped; the
 * action is the candidate with the longest word the rest starts with, at a word's end; `undefined` when no candidate
 * is named or nothing follows the name.
 */
export function parseQuickLog(
	line: string,
	candidates: readonly QuickLogCandidate[],
	verb = 'log'
): ParsedQuickLog | undefined {
	let rest = line.normalize('NFKC').trim().replace(/\s+/g, ' ')
	const lead = fold(verb)
	if (lead && fold(rest).startsWith(`${lead} `)) rest = rest.slice(lead.length + 1)
	const folded = fold(rest)
	let best: { key: string; length: number } | undefined
	for (const candidate of candidates) {
		for (const word of candidate.words) {
			const name = fold(word)
			if (!name || !folded.startsWith(name)) continue
			const after = folded[name.length]
			// a name ends at a space or a colon, so "ideas" is not "idea" followed by "s"
			if (after !== ' ' && after !== ':') continue
			if (!best || name.length > best.length) best = { key: candidate.key, length: name.length }
		}
	}
	if (!best) return undefined
	const value = rest
		.slice(best.length)
		.replace(/^[:\s]+/, '')
		.trim()
	return value ? { key: best.key, value } : undefined
}

/** What **run** does with a quick action: a launch opens its surface, anything else opens the sheet on its tab. */
export function quickLogTarget(action: { kind: QuickActionKind }): 'launch' | 'sheet' {
	return action.kind === 'launch' ? 'launch' : 'sheet'
}
