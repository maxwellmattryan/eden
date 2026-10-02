// The bundled vibes (D-133): constants with locale keys, never rows, so nothing is seeded. A custom vibe is a `vibe`
// row with a label and a facet of its own. A filter is any of within a facet and all of across them, which is why
// each vibe belongs to exactly one.
import { FACETS, type CustomVibe, type Facet } from './types.js'

export const BUNDLED_VIBES: Readonly<Record<Facet, readonly string[]>> = {
	purpose: ['deep-work', 'work-friendly', 'read', 'meet-people', 'catch-up', 'date', 'unwind', 'celebrate'],
	mood: ['calm', 'cozy', 'lively', 'buzzing', 'romantic', 'playful'],
	setting: ['quiet', 'spacious', 'outdoors', 'natural-light', 'intimate', 'industrial', 'late-night'],
	crowd: ['solo-friendly', 'locals', 'laptop-crowd', 'social', 'kid-friendly'],
}

export const BUNDLED_VIBE_IDS: readonly string[] = FACETS.flatMap((facet) => BUNDLED_VIBES[facet])

const camel = (id: string) => id.replace(/-([a-z0-9])/g, (_, letter: string) => letter.toUpperCase())

/** The locale key of a bundled vibe's name, and of a facet's. */
export const vibeKey = (id: string) => `domains.places.vibes.${camel(id)}`
export const facetKey = (facet: Facet) => `domains.places.facets.${facet}`

export function isBundledVibe(id: string): boolean {
	return BUNDLED_VIBE_IDS.includes(id)
}

/** The facet a vibe belongs to: a bundled one's, or a custom one's from its row; nothing for an id nobody knows. */
export function facetOf(id: string, custom: readonly CustomVibe[] = []): Facet | undefined {
	return FACETS.find((facet) => BUNDLED_VIBES[facet].includes(id)) ?? custom.find((vibe) => vibe.id === id)?.facet
}

/** A vibe by its facet and the id it is filed under. */
export interface VibeChoice {
	id: string
	facet: Facet
	/** A custom vibe's own words; a bundled one is named through its locale key. */
	label?: string
}

/** Every vibe on offer, by facet: the bundled ones in their order, then the custom ones as they were made. */
export function vibesByFacet(custom: readonly CustomVibe[] = []): Record<Facet, VibeChoice[]> {
	const out = { purpose: [], mood: [], setting: [], crowd: [] } as Record<Facet, VibeChoice[]>
	for (const facet of FACETS) {
		out[facet] = [
			...BUNDLED_VIBES[facet].map((id): VibeChoice => ({ id, facet })),
			...custom
				.filter((vibe) => vibe.facet === facet)
				.map((vibe): VibeChoice => ({ id: vibe.id, facet, label: vibe.label })),
		]
	}
	return out
}

/** The vibe ids among `values` that are known, each once, in the order given: what a model's answer is held to. */
export function knownVibes(values: unknown, custom: readonly CustomVibe[] = []): string[] {
	if (!Array.isArray(values)) return []
	const out: string[] = []
	for (const value of values) {
		if (typeof value === 'string' && !out.includes(value) && facetOf(value, custom)) out.push(value)
	}
	return out
}
