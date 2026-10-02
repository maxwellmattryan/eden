// Finding places Meadow does not hold yet (D-128, D-132): what is asked of a source, in words a model can be given,
// the shape its answer is held to, and how that answer is read. A discovery source is a seam; the Gardener with the
// provider's web search is the first, and its two requests are built from the prompts here. Nothing in this module
// reaches out to anything: it is the pure part, tested in Node.
//
// Two guards live here. A candidate's addresses must be among the ones the search returned, whole (never a prefix or
// a host), so an address a model composed is never kept or fetched (D-135). And a candidate is only a name and what
// the sources said: where it is on the map is the geocoder's to say, after.
import { normalLink, untrusted } from '../../gardener/links.js'
import { answer, type JsonSchema } from '../../gardener/tools.js'
import { asCategory, PLACE_CATEGORIES } from './categories.js'
import {
	FACETS,
	type CustomVibe,
	type PlaceCandidate,
	type PlaceFilter,
	type PriceLevel,
	type SourceLink,
} from './types.js'
import { BUNDLED_VIBES, facetOf, knownVibes } from './vibes.js'

/** Why a source found nothing, as a code the page puts its own words to. */
export type SourceFailure =
	| 'off'
	| 'no-key'
	| 'unavailable'
	| 'budget'
	| 'busy'
	| 'network'
	| 'refusal'
	| 'cancelled'
	| 'search-refused'
	| 'search-failed'
	| 'unreadable'
	| 'empty'

/** Whether a source can be asked now, and what asking would cost. */
export type Availability =
	| { available: true; provider?: string; model?: string; estimateUsd?: number }
	| { available: false; reason: SourceFailure }

export interface DiscoveryQuery {
	/** What is asked for: the vibes, the kinds of place, the free text. */
	filter: PlaceFilter
	/** Where, in words: a city and its region. Never a coordinate (D-60). */
	area: string
	/** The names of the places already saved, to be left out. */
	exclude: string[]
	limit: number
	lang: string
}

export interface DiscoveryResult {
	candidates: PlaceCandidate[]
	failure?: SourceFailure
	/** The source's own words for a failure, when it gave any. */
	detail?: string
}

export interface DiscoverySource {
	id: string
	available(query: DiscoveryQuery): Promise<Availability>
	discover(query: DiscoveryQuery): Promise<DiscoveryResult>
}

/** The most candidates one search answers. */
export const DISCOVERY_LIMIT = 8
/** The most web searches one research request may make (D-132). */
export const DISCOVERY_SEARCHES = 5

/** A vibe as a model is told it: the id read as words. */
const words = (id: string) => id.replace(/-/g, ' ')

/** What the tool takes, from a conversation or from the page's filter. */
export interface DiscoveryInput {
	query?: string
	vibes?: string[]
	categories?: string[]
	area?: string
	count?: number
	alcoholFree?: boolean
	maxPrice?: number
}

/** The page's filter as the tool's input. */
export function inputFromFilter(filter: PlaceFilter, area: string, limit = DISCOVERY_LIMIT): DiscoveryInput {
	return {
		...(filter.text.trim() ? { query: filter.text.trim() } : {}),
		vibes: [...filter.vibes],
		categories: [...filter.categories],
		area,
		count: limit,
		...(filter.alcoholFree ? { alcoholFree: true } : {}),
		...(filter.prices.length ? { maxPrice: Math.max(...filter.prices) } : {}),
	}
}

/** What is being looked for, in a sentence: the line the page shows and the search is asked with. */
export function discoveryBrief(input: DiscoveryInput, custom: readonly CustomVibe[] = []): string {
	const vibes = knownVibes(input.vibes ?? [], custom)
	const byFacet = FACETS.map((facet) =>
		vibes
			.filter((vibe) => facetOf(vibe, custom) === facet)
			.map((vibe) => custom.find((entry) => entry.id === vibe)?.label ?? words(vibe))
	).filter((group) => group.length)
	const kinds = (input.categories ?? []).filter((category) =>
		(PLACE_CATEGORIES as readonly string[]).includes(category)
	)
	const parts = [
		input.query?.trim(),
		kinds.length ? `a ${kinds.join(' or ')}` : undefined,
		// any of within a facet, all of across them, as the filter reads
		...byFacet.map((group) => group.join(' or ')),
		input.alcoholFree ? 'alcohol-free, or with good choices without alcohol' : undefined,
		input.maxPrice && input.maxPrice < 4 ? `no dearer than ${'$'.repeat(input.maxPrice)}` : undefined,
	].filter(Boolean)
	return parts.length ? parts.join('; ') : 'somewhere good to go'
}

/** The research request's message: what to search for, where, and what to leave out. */
export function researchPrompt(
	input: DiscoveryInput,
	context: { area: string; exclude: string[]; custom?: readonly CustomVibe[] }
): string {
	const count = Math.max(1, Math.min(DISCOVERY_LIMIT, input.count ?? DISCOVERY_LIMIT))
	const area = input.area?.trim() || context.area
	return [
		`Find up to ${count} places in or near ${area} that fit this: ${discoveryBrief(input, context.custom)}.`,
		'They are places to go: cafes, restaurants, bars, parks, museums, venues, shops, libraries. Look for ones that are open now as businesses or public places, not ones that have closed for good.',
		'The context holds what the owner eats and avoids, where it is shared: when the place serves food or drink, prefer places that suit it, and say in the notes what a source says on it.',
		context.exclude.length
			? `The owner already has these saved, so leave them out: ${context.exclude.slice(0, 60).join('; ')}.`
			: undefined,
		'For each place, note also its opening hours when a result states them, and its price level when a result gives one.',
	]
		.filter(Boolean)
		.join('\n')
}

/** The answer the reading request is held to. */
export function candidatesSchema(custom: readonly CustomVibe[] = []): JsonSchema {
	const vibeIds = [...FACETS.flatMap((facet) => BUNDLED_VIBES[facet]), ...custom.map((vibe) => vibe.id)]
	return answer.object({
		candidates: answer.list(
			answer.object({
				name: answer.text('The place’s name, as the notes write it.'),
				category: answer.oneOf(PLACE_CATEGORIES, 'What kind of place it is; `venue` when none of the others fits.'),
				address: answer.text('Its street address when the notes give one; an empty string otherwise.'),
				locality: answer.text('The part of town or the town it is in, when the notes say; an empty string otherwise.'),
				why: answer.text('One sentence on why it fits what was asked, from what the notes say of it.'),
				vibes: answer.list(
					answer.oneOf(vibeIds, 'A vibe’s id.'),
					'The vibes the notes support for this place, from the ids given; none is better than a guess.'
				),
				price: answer.integer('Its price level from 1 to 4 when the notes give one; 0 otherwise.'),
				alcoholFree: answer.oneOf(
					['yes', 'no', 'unknown'],
					'`yes` when the notes say it serves no alcohol or has good choices without it; `unknown` when they do not say.'
				),
				hours: answer.text('Its opening hours as the notes state them; an empty string when they do not.'),
				website: answer.text(
					'The place’s own website, exactly as the notes give its address; an empty string when they give none.'
				),
				sources: answer.list(
					answer.text(),
					'The web addresses in the notes that the facts about this place came from, each exactly as written.'
				),
			})
		),
	})
}

/** The reading request's message: the notes, as untrusted text, and what to make of them. */
export function readingPrompt(input: DiscoveryInput, notes: string, custom: readonly CustomVibe[] = []): string {
	const count = Math.max(1, Math.min(DISCOVERY_LIMIT, input.count ?? DISCOVERY_LIMIT))
	const facets = FACETS.map((facet) => {
		const ids = [...BUNDLED_VIBES[facet], ...custom.filter((vibe) => vibe.facet === facet).map((vibe) => vibe.id)]
		return `- ${facet}: ${ids.join(', ')}`
	})
	return [
		`Below are notes from a web search for places that fit this: ${discoveryBrief(input, custom)}.`,
		`Read them into candidates, ${count} at most, the best fits first. A candidate is a place the notes name: do not add one they do not name, and do not fill a field from memory. A field the notes say nothing on stays empty.`,
		'The vibes, by what kind each is, as the ids to use:',
		...facets,
		untrusted('web-search', notes),
	].join('\n')
}

/** A model's candidate as it arrives. */
interface RawCandidate {
	name?: unknown
	category?: unknown
	address?: unknown
	locality?: unknown
	why?: unknown
	vibes?: unknown
	price?: unknown
	alcoholFree?: unknown
	hours?: unknown
	website?: unknown
	sources?: unknown
}

const line = (value: unknown, max = 200): string =>
	typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''

/**
 * The candidates of an answer. Each needs a name. Its addresses are held to the ones the search returned: a source
 * that is not one of them, whole, is dropped, and so is a website that is not; a candidate left with no source at
 * all is dropped too, since nothing then says where it came from. A name already saved is left out.
 */
export function parseCandidates(
	raw: unknown,
	context: {
		sources: readonly SourceLink[]
		exclude?: readonly string[]
		custom?: readonly CustomVibe[]
		limit?: number
	}
): PlaceCandidate[] {
	const list = (raw as { candidates?: unknown } | null)?.candidates
	if (!Array.isArray(list)) return []
	const returned = new Map<string, SourceLink>()
	for (const source of context.sources) {
		const key = normalLink(source.url)
		if (key && !returned.has(key)) returned.set(key, { url: key, title: line(source.title, 160) })
	}
	const known = (value: unknown): SourceLink | undefined => {
		const key = typeof value === 'string' ? normalLink(value) : undefined
		return key ? returned.get(key) : undefined
	}
	const saved = new Set((context.exclude ?? []).map((name) => name.trim().toLowerCase()))
	const seen = new Set<string>()
	const out: PlaceCandidate[] = []
	for (const entry of list as RawCandidate[]) {
		const name = line(entry?.name, 120)
		const key = name.toLowerCase()
		if (!name || saved.has(key) || seen.has(key)) continue
		const sources = (Array.isArray(entry.sources) ? entry.sources : []).flatMap((url) => known(url) ?? [])
		const unique = sources.filter((source, at) => sources.findIndex((other) => other.url === source.url) === at)
		if (!unique.length) continue
		seen.add(key)
		const price = typeof entry.price === 'number' && entry.price >= 1 && entry.price <= 4 ? Math.round(entry.price) : 0
		const website = known(entry.website)?.url
		const why = line(entry.why, 300)
		const address = line(entry.address)
		const locality = line(entry.locality, 80)
		const hours = line(entry.hours, 200)
		out.push({
			name,
			category: asCategory(entry.category),
			...(address ? { addressLine: address } : {}),
			...(locality ? { locality } : {}),
			...(why ? { why } : {}),
			vibes: knownVibes(entry.vibes, context.custom),
			...(price ? { price: price as PriceLevel } : {}),
			...(entry.alcoholFree === 'yes'
				? { alcoholFree: true }
				: entry.alcoholFree === 'no'
					? { alcoholFree: false }
					: {}),
			...(hours ? { hoursText: hours } : {}),
			...(website ? { website } : {}),
			sources: unique.slice(0, 4),
			providerIds: {},
		})
		if (out.length >= (context.limit ?? DISCOVERY_LIMIT)) break
	}
	return out
}

/** The name a suggestion's mirror is kept under at its source: the same place found twice is one row. */
export function candidateKey(candidate: Pick<PlaceCandidate, 'name' | 'locality' | 'providerIds'>): string {
	if (candidate.providerIds.osm) return `osm-${candidate.providerIds.osm}`
	const slug = `${candidate.name} ${candidate.locality ?? ''}`
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
	return slug.slice(0, 80) || 'place'
}
