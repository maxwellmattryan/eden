// `favorite-vibe`, the one fact Meadow writes (product/domains/places.md, "Facts"): which vibes the owner leans to,
// worked out from what they keep and where they go, never asked for. A vibe counts once for each saved place that
// carries it, more for a favourite, and again for each visit there, more for a visit rated well; the weights are
// set against the strongest, so they read from 0 to 1. It is `domain-derived`, written when a place is saved and
// when a visit is logged, and the owner's own facts of the type are never touched.
import type { SavedPlace, Visit } from './types.js'

export interface VibeWeight {
	/** The vibe's id. */
	name: string
	/** 0 to 1, against the strongest. */
	weight: number
}

const SAVED = 1
const FAVOURITE = 2
const VISIT = 1
/** What a visit adds for its rating: a five counts double, a one or a two takes back what the visit gave. */
const RATED: Readonly<Record<number, number>> = { 1: -1, 2: -0.5, 3: 0, 4: 0.5, 5: 1 }
/** A vibe below this share of the strongest is not said. */
const FLOOR = 0.2
const MOST = 8

/** The vibes the owner leans to, strongest first, at most eight. */
export function favouriteVibes(places: readonly SavedPlace[], visits: readonly Visit[]): VibeWeight[] {
	const score = new Map<string, number>()
	const add = (vibes: readonly string[], amount: number) => {
		for (const vibe of vibes) score.set(vibe, (score.get(vibe) ?? 0) + amount)
	}
	for (const place of places) add(place.vibes, SAVED + (place.favourite ? FAVOURITE : 0))
	for (const visit of visits) {
		const place = places.find((entry) => entry.id === visit.placeId)
		if (place) add(place.vibes, VISIT + (RATED[visit.rating ?? 3] ?? 0))
	}
	const top = Math.max(0, ...score.values())
	if (top <= 0) return []
	return [...score]
		.map(([name, value]) => ({ name, weight: Math.round((value / top) * 100) / 100 }))
		.filter((vibe) => vibe.weight >= FLOOR)
		.sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name))
		.slice(0, MOST)
}

/**
 * What to write so the stored facts say what was worked out: the vibes to assert, the facts whose weight moved, and
 * the facts of vibes no longer leaned to. Only the facts Meadow derived are compared; the owner's own stand.
 */
export function favouriteChanges(
	want: readonly VibeWeight[],
	have: readonly { id: string; value: unknown }[]
): { assert: VibeWeight[]; update: { id: string; value: VibeWeight }[]; remove: string[] } {
	const read = (value: unknown): VibeWeight | undefined => {
		const raw = value as Partial<VibeWeight> | null
		return raw && typeof raw.name === 'string' && typeof raw.weight === 'number'
			? { name: raw.name, weight: raw.weight }
			: undefined
	}
	const held = have.map((fact) => ({ id: fact.id, value: read(fact.value) }))
	const assert = want.filter((vibe) => !held.some((fact) => fact.value?.name === vibe.name))
	const update: { id: string; value: VibeWeight }[] = []
	const remove: string[] = []
	const seen = new Set<string>()
	for (const fact of held) {
		const wanted =
			fact.value && !seen.has(fact.value.name) ? want.find((vibe) => vibe.name === fact.value!.name) : undefined
		if (!wanted) {
			remove.push(fact.id)
			continue
		}
		seen.add(wanted.name)
		if (Math.abs(wanted.weight - fact.value!.weight) >= 0.05) update.push({ id: fact.id, value: wanted })
	}
	return { assert, update, remove }
}
