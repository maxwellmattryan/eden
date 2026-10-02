// Importing a list of places (product/domains/places.md, "Import"): a note's worth of names, pasted, becomes rows to
// look up, check and save. Reading the list needs no model and no network: `parseNameList` is local. Tagging the
// rows with vibes is one optional request with no search (`import-places`), whose prompt and answer are here.
import { answer, type JsonSchema } from '../../gardener/tools.js'
import { untrusted } from '../../gardener/links.js'
import { FACETS, type CustomVibe } from './types.js'
import { BUNDLED_VIBES, knownVibes } from './vibes.js'

export interface ImportName {
	name: string
	/** What the owner wrote after the name: "good for groups". */
	note?: string
}

/** The most names one paste is read as: a list, not a document. */
export const IMPORT_LIMIT = 200

// What a note puts before a line: a bullet, a number, a checkbox, in that order, any of them or none.
const BULLET = /^\s*(?:[-*+•◦▪‣·–—]|\d{1,3}[.)])?\s*/
const CHECKBOX = /^(?:\[[ xX✓✔]?\]|[☐☑☒✓✔])\s*/
// A note after the name: an em or en dash, a spaced hyphen, or a colon followed by a space.
const NOTE = /\s+[—–]\s+|\s+-\s+|\s*—\s*|:\s+/

/**
 * The names in a pasted list, one to a line, in order: the bullet, the number and the checkbox a note puts before a
 * line are dropped, what follows a dash is kept as the name's note, a blank line and a heading (a line that ends in
 * a colon) are passed over, and a name written twice is read once.
 */
export function parseNameList(text: string): ImportName[] {
	const out: ImportName[] = []
	const seen = new Set<string>()
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.replace(BULLET, '').replace(CHECKBOX, '').replace(/\s+/g, ' ').trim()
		if (!line || /^[^:]{1,60}:$/.test(line)) continue
		const cut = NOTE.exec(line)
		const name = (cut ? line.slice(0, cut.index) : line).trim().slice(0, 120)
		const note = cut
			? line
					.slice(cut.index + cut[0].length)
					.trim()
					.slice(0, 200)
			: ''
		const key = name.toLowerCase()
		if (!name || seen.has(key)) continue
		seen.add(key)
		out.push(note ? { name, note } : { name })
		if (out.length >= IMPORT_LIMIT) break
	}
	return out
}

/** The answer `import-places` is held to: the vibes of each name, by its place in the list. */
export function tagSchema(custom: readonly CustomVibe[] = []): JsonSchema {
	const ids = [...FACETS.flatMap((facet) => BUNDLED_VIBES[facet]), ...custom.map((vibe) => vibe.id)]
	return answer.object({
		tagged: answer.list(
			answer.object({
				index: answer.integer('The number of the place in the list, from 1.'),
				vibes: answer.list(
					answer.oneOf(ids, 'A vibe’s id.'),
					'The vibes its name and its note suggest; an empty list when nothing does.'
				),
			})
		),
	})
}

/** The request's message: the list, as the owner wrote it, and the vibes to choose from. */
export function tagPrompt(names: readonly ImportName[], custom: readonly CustomVibe[] = []): string {
	const facets = FACETS.map((facet) => {
		const ids = [...BUNDLED_VIBES[facet], ...custom.filter((vibe) => vibe.facet === facet).map((vibe) => vibe.id)]
		return `- ${facet}: ${ids.join(', ')}`
	})
	const list = names.map((entry, i) => `${i + 1}. ${entry.name}${entry.note ? ` (${entry.note})` : ''}`).join('\n')
	return [
		'The owner is saving the places in this list. For each, choose the vibes that its name and the owner’s note suggest, from the ids below, three at most. You have no search here: go only on what the name plainly is (a park is outdoors, a library is quiet) and on the note. When neither says anything, give no vibes; the owner would rather tag a place themselves than correct a guess.',
		'The vibes, by what kind each is, as the ids to use:',
		...facets,
		// the names came from a note the owner pasted, which may hold anything
		untrusted('pasted-list', list),
	].join('\n')
}

/** The vibes of each name, by its place in the list (from 0): known ids only, three at most. */
export function parseTags(raw: unknown, count: number, custom: readonly CustomVibe[] = []): string[][] {
	const out: string[][] = Array.from({ length: count }, () => [])
	const list = (raw as { tagged?: unknown } | null)?.tagged
	if (!Array.isArray(list)) return out
	for (const entry of list as { index?: unknown; vibes?: unknown }[]) {
		const at = typeof entry?.index === 'number' ? Math.round(entry.index) - 1 : -1
		if (at < 0 || at >= count) continue
		out[at] = knownVibes(entry.vibes, custom).slice(0, 3)
	}
	return out
}
