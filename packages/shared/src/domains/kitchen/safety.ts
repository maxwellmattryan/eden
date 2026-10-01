// Hearth's safety filter (D-25): deterministic, local, and applied to whatever is about to be suggested, whatever a
// model saw. The words are the owner's allergens, medical restrictions and dislikes, read from the profile on this
// device and never sent. A suggestion that names one anywhere is withheld. When the words cannot be read the filter
// fails closed: `null` for the words withholds everything, since an unread allergy is not an absent one.
import { singular } from './match.js'

/** What a fact's value says of the substance: an allergy holds an object, a restriction and a dislike a string. */
function substance(value: unknown): string | undefined {
	if (typeof value === 'string') return value
	const named = (value as { substance?: unknown } | null)?.substance
	return typeof named === 'string' ? named : undefined
}

/**
 * The words to look for, lower case, each with its singular beside it: "peanuts" is also looked for as "peanut", so
 * "peanut butter" is caught.
 */
export function forbiddenWords(facts: readonly { value: unknown }[]): string[] {
	const found = new Set<string>()
	for (const fact of facts) {
		const word = substance(fact.value)?.trim().toLowerCase()
		if (!word) continue
		found.add(word)
		found.add(word.split(/\s+/).map(singular).join(' '))
	}
	return [...found]
}

/**
 * Whether nothing in the texts names a forbidden word. The match is by substring, which errs towards withholding
 * ("nut" also withholds "nutmeg"): a missed suggestion costs less than an unsafe one.
 */
export function isSafe(texts: readonly (string | undefined)[], words: readonly string[] | null): boolean {
	if (words === null) return false
	if (!words.length) return true
	const text = texts.filter(Boolean).join(' ').toLowerCase()
	return !words.some((word) => text.includes(word))
}
