// Meadow's tools (product/domains/places.md, "Gardener tools and guardrails"), bound to its declaration in the
// manifest. `suggest-places` is a searching tool (D-132): its research request searches the web and answers notes,
// and its reading request turns the notes into candidates, which are held to the addresses the search returned,
// looked up on the map and shown as suggestions. Nothing here saves a place: the owner does, on the map.
import { get } from 'svelte/store'
import { locale, t } from '@eden/shared/i18n'
import {
	areaWords,
	candidatesSchema,
	discoveryBrief,
	DISCOVERY_LIMIT,
	DISCOVERY_SEARCHES,
	inputFromFilter,
	listingsReadingPrompt,
	listingsResearchPrompt,
	listingsSchema,
	LISTINGS_SEARCHES,
	meadow,
	parseListings,
	parseCandidates,
	parseNameList,
	parseTags,
	readHome,
	readingPrompt,
	researchPrompt,
	tagPrompt,
	tagSchema,
	type DiscoveryInput,
	type DiscoverySource,
	type ListingsQuery,
	type ListingsSource,
	type SourceFailure,
	type WeeklyOutcome,
} from '@eden/shared/domains/places'
import {
	int,
	parseJson,
	str,
	type ToolContext,
	type ToolFailure,
	type ToolHandler,
} from '../../shell/gardener/types.js'
import { placesImport } from './import.svelte.js'

export const SUGGEST_PLACES = 'places.suggest-places'

const strings = (input: unknown, key: string): string[] => {
	const value = (input as Record<string, unknown> | null)?.[key]
	return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

/** The tool's input, from a conversation or from the page, held to what it may be. */
function discoveryInput(input: unknown): DiscoveryInput {
	const raw = input as Record<string, unknown> | null
	return {
		...(str(input, 'query') ? { query: str(input, 'query')!.slice(0, 200) } : {}),
		vibes: strings(input, 'vibes'),
		categories: strings(input, 'categories'),
		...(str(input, 'area') ? { area: str(input, 'area')!.slice(0, 80) } : {}),
		count: int(input, 'count', 6, 1, DISCOVERY_LIMIT),
		...(raw?.alcoholFree === true ? { alcoholFree: true } : {}),
		...(typeof raw?.maxPrice === 'number' ? { maxPrice: raw.maxPrice } : {}),
	}
}

/** Where the search looks, as coarsely as a city: what the provider may use to place its results (D-60). */
function searchLocation() {
	const area = meadow.area
	const home = readHome()
	const city = area.kind === 'named' ? (area.city ?? area.label) : home.city
	const region = area.kind === 'named' ? area.region : home.region
	return {
		...(city ? { city } : {}),
		...(region ? { region } : {}),
		timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
	}
}

const saved = () => meadow.places.map((place) => place.name)

export const placesTools: Record<string, ToolHandler> = {
	'suggest-places': {
		delegate: {
			maxTokens: 3072,
			// the vibes on offer include the owner's own, so the shape is read when it is asked for
			get schema() {
				return candidatesSchema(meadow.vibes)
			},
			research: {
				maxUses: DISCOVERY_SEARCHES,
				prompt: async (input) => {
					await meadow.load()
					return researchPrompt(discoveryInput(input), {
						area: areaWords(meadow.area),
						exclude: saved(),
						custom: meadow.vibes,
					})
				},
				// an area the owner named in the conversation is in the prompt; the provider is told only home's
				location: (input) => (str(input, 'area') ? undefined : searchLocation()),
			},
			prompt: (input, ctx) => readingPrompt(discoveryInput(input), ctx.research?.notes ?? '', meadow.vibes),
			parse: async (text, input, ctx: ToolContext) => {
				await meadow.load()
				const asked = discoveryInput(input)
				const candidates = parseCandidates(parseJson(text), {
					sources: ctx.research?.sources ?? [],
					exclude: saved(),
					custom: meadow.vibes,
					limit: asked.count,
				})
				if (!candidates.length)
					return {
						output: {
							error: 'The search found no place it could name with a source. Tell the owner; do not invent one.',
						},
						failure: 'empty',
					}
				const { placed, unplaced } = await meadow.receive(discoveryBrief(asked, meadow.vibes), candidates, ctx.lang)
				return {
					output: {
						found: placed.map(({ candidate }) => ({
							name: candidate.name,
							kind: candidate.category,
							where: [candidate.addressLine, candidate.locality].filter(Boolean).join(', '),
							why: candidate.why ?? '',
							readAt: candidate.sources.map((source) => source.url),
						})),
						couldNotBePlaced: unplaced,
						note: 'These are on the Meadow map as suggestions. None is saved: the owner saves the ones they want there.',
					},
				}
			},
		},
	},
}

/** The names an `import-places` call carries, each read as a line of a pasted list is. */
const importNames = (input: unknown) => parseNameList(strings(input, 'names').join('\n'))

placesTools['import-places'] = {
	delegate: {
		check: (input) => (importNames(input).length ? undefined : 'Pass `names`: the places to import, one to an entry.'),
		get schema() {
			return tagSchema(meadow.vibes)
		},
		prompt: async (input) => {
			await meadow.load()
			return tagPrompt(importNames(input), meadow.vibes)
		},
		parse: (text, input, ctx) => {
			const names = importNames(input)
			const tagged = parseTags(parseJson(text), names.length, meadow.vibes)
			// in a conversation the list is handed to the import sheet, where the owner checks it and saves; a page
			// that asked for the tags itself only wants them back
			if (ctx.threadId) placesImport.begin(names, ctx.lang, tagged)
			return {
				output: ctx.threadId
					? {
							opened: names.length,
							note: 'The import sheet is open with these names, each being looked up on the map. Nothing is saved until the owner saves there.',
						}
					: { tagged },
			}
		},
	},
}

export const SUGGEST_LISTINGS = 'places.suggest-listings'
const DAY = /^\d{4}-\d{2}-\d{2}$/

/** What `suggest-listings` is asked, from a conversation or from the page: the store's own query, with what was said. */
function listingsQuery(input: unknown, ctx: ToolContext): ListingsQuery {
	const base = meadow.listingsQuery(ctx.lang, str(input, 'interests'))
	const from = str(input, 'from')
	const to = str(input, 'to')
	const first = from && DAY.test(from) ? from : base.from
	const last = to && DAY.test(to) && to >= first ? to : base.to < first ? first : base.to
	return { ...base, from: first, to: last, ...(str(input, 'area') ? { area: str(input, 'area')!.slice(0, 80) } : {}) }
}

placesTools['suggest-listings'] = {
	delegate: {
		maxTokens: 3072,
		schema: listingsSchema(),
		research: {
			maxUses: LISTINGS_SEARCHES,
			prompt: async (input, ctx) => {
				await meadow.load()
				return listingsResearchPrompt(listingsQuery(input, ctx))
			},
			location: (input) => (str(input, 'area') ? undefined : searchLocation()),
		},
		prompt: (input, ctx) => listingsReadingPrompt(listingsQuery(input, ctx), ctx.research?.notes ?? ''),
		parse: async (text, input, ctx) => {
			await meadow.load()
			const query = listingsQuery(input, ctx)
			const listings = parseListings(parseJson(text), {
				sources: ctx.research?.sources ?? [],
				from: query.from,
				to: query.to,
				timezone: ctx.zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
				foundAt: new Date().toISOString(),
			})
			if (!listings.length)
				return {
					output: {
						error: 'The search found nothing on in those days that it could name with a source. Tell the owner.',
					},
					failure: 'empty',
				}
			const kept = await meadow.receiveListings(listings)
			return {
				output: {
					listings: kept.map((listing) => ({
						id: listing.id,
						title: listing.title,
						when: listing.startAt,
						where: listing.venueName ?? '',
						price: listing.price ?? '',
						why: listing.why ?? '',
						readAt: listing.url,
					})),
					note: 'These are on Meadow’s Listings tab. None is in the calendar until the owner marks one, or asks you to with `places_add-to-calendar`.',
				},
			}
		},
	},
}

placesTools['add-to-calendar'] = {
	preview: (input) => {
		const listing = meadow.listingById(str(input, 'listingId'))
		return listing
			? `Add “${listing.title}” to the calendar as an outing, ${listing.startAt.replace('T', ' ').slice(0, 16)}`
			: undefined
	},
	run: async (input, ctx) => {
		await meadow.load()
		const id = str(input, 'listingId')
		const listing = meadow.listingById(id)
		if (!listing)
			return {
				output: {
					error: `No listing has the id ${JSON.stringify(id ?? '')}. Pass the \`id\` of a row under \`listing\`, or of an entry \`places_suggest-listings\` returned.`,
				},
			}
		const { outing, undo } = meadow.markListing(listing.id, 'going')
		if (!outing) return { output: { error: 'The outing could not be made.' } }
		ctx.undo(get(t)('domains.places.listings.toast.going', { values: { title: listing.title } }), undo)
		return {
			output: { added: listing.title, when: listing.startAt, status: 'confirmed' },
			touched: [`eden://event/${outing.id}`],
		}
	},
}

const FAILURES: Partial<Record<ToolFailure, SourceFailure>> = {
	'max-tokens': 'unreadable',
	'no-files': 'unavailable',
}

/** The Gardener as Meadow's listings source: the Listings tab and the weekly search both run `suggest-listings`. */
export const gardenerListings: ListingsSource = {
	id: 'gardener',
	async available(query) {
		const { runtime } = await import('$lib/shell/gardener/runtime.svelte')
		const preview = await runtime.previewDirect(SUGGEST_LISTINGS, {
			from: query.from,
			to: query.to,
			interests: query.interests,
		})
		return 'unavailable' in preview
			? { available: false, reason: preview.unavailable }
			: { available: true, provider: preview.provider, model: preview.model, estimateUsd: preview.estimateUsd }
	},
	async fetch(query) {
		const { runtime } = await import('$lib/shell/gardener/runtime.svelte')
		const result = await runtime.runDirect(
			SUGGEST_LISTINGS,
			{ from: query.from, to: query.to, interests: query.interests },
			{ confirmed: true }
		)
		if (!result.failure) return { listings: [] }
		const detail = (result.output as { error?: unknown } | null)?.error
		return {
			listings: [],
			failure: FAILURES[result.failure] ?? (result.failure as SourceFailure),
			...(typeof detail === 'string' && result.failure === 'search-refused' ? { detail } : {}),
		}
	},
}

/**
 * The weekly listings search (D-134), as the schedule runs it: one `suggest-listings` nobody pressed. It is skipped,
 * and the week settled, where D-134 says it must not run: with no key on the device, when the month's cap would be
 * passed, or when the tool would run at the deep grade. A Gardener busy with another request is tried again tomorrow.
 */
export async function weeklyListings(): Promise<WeeklyOutcome> {
	await meadow.load()
	const lang = get(locale) ?? 'en'
	const { runtime } = await import('$lib/shell/gardener/runtime.svelte')
	const preview = await runtime.previewDirect(SUGGEST_LISTINGS, {})
	if ('unavailable' in preview) return { outcome: 'skipped' }
	const { gardenerSetup } = await import('$lib/shell/gardener/setup.svelte')
	if (preview.model === gardenerSetup.map.deep.model && preview.model !== gardenerSetup.map.standard.model)
		return { outcome: 'skipped' }
	const { failure, found } = await meadow.findListings(lang)
	if (failure === 'busy') return { outcome: 'busy' }
	if (failure) return { outcome: 'skipped' }
	return found.length ? { outcome: 'found', titles: found.map((listing) => listing.title) } : { outcome: 'nothing' }
}

/**
 * The Gardener as Meadow's discovery source (D-128): the page's "Find more" runs `suggest-places` itself, with no
 * conversation (`runDirect`, D-86). Pressing the button is the consent; the page shows the estimate before.
 */
export const gardenerDiscovery: DiscoverySource = {
	id: 'gardener',
	async available(query) {
		const { runtime } = await import('$lib/shell/gardener/runtime.svelte')
		const preview = await runtime.previewDirect(SUGGEST_PLACES, inputFromFilter(query.filter, query.area, query.limit))
		return 'unavailable' in preview
			? { available: false, reason: preview.unavailable }
			: { available: true, provider: preview.provider, model: preview.model, estimateUsd: preview.estimateUsd }
	},
	async discover(query) {
		const { runtime } = await import('$lib/shell/gardener/runtime.svelte')
		const result = await runtime.runDirect(SUGGEST_PLACES, inputFromFilter(query.filter, query.area, query.limit), {
			confirmed: true,
		})
		if (!result.failure) return { candidates: [] }
		const detail = (result.output as { error?: unknown } | null)?.error
		return {
			candidates: [],
			failure: FAILURES[result.failure] ?? (result.failure as SourceFailure),
			...(typeof detail === 'string' && result.failure === 'search-refused' ? { detail } : {}),
		}
	},
}
