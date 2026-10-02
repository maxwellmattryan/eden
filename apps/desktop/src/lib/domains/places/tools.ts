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
	isCategory,
	knownVibes,
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
	type PlacePatch,
	type PriceLevel,
	type SourceFailure,
	type Undo,
	type WeeklyOutcome,
} from '@eden/shared/domains/places'
import { normalLink } from '@eden/shared/gardener'
import { entries, given, ids, preview, together, unknown, withFields, type Fields } from '@eden/shared/shell/gardener'
import { int, parseJson, str, type ToolContext, type ToolFailure, type ToolHandler } from '@eden/shared/shell/gardener'
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

const say = (key: 'change' | 'remove', what: string) =>
	get(t)(`domains.places.gardener.preview.${key}`, { values: { what } })

/** The ids a row names under a key, each once. */
const listed = (row: Fields, key: string): string[] => [...new Set(ids(row, key))]

/** The names of the collections a card's row names, or nothing when one of them is not there. */
const collectionNames = (value: unknown): string | undefined => {
	const names = (Array.isArray(value) ? value : []).map(
		(id) => meadow.collections.find((entry) => entry.id === id)?.name
	)
	return names.length && names.every(Boolean) ? names.join(' + ') : undefined
}

/**
 * Asks after a place's picture once the owner has confirmed a website for it (D-154), in the background. The undo it
 * answers takes the picture back, whether it has arrived or is still on its way.
 */
function fetchPlacePicture(id: string): Undo {
	let stopped = false
	let photoId: string | undefined
	const take = () => {
		if (photoId && meadow.placeById(id)?.photoId === photoId) meadow.setPhoto(id, undefined)
	}
	void meadow
		.findPicture(id, get(locale) ?? 'en')
		.then((outcome) => {
			if (outcome !== 'found') return
			photoId = meadow.placeById(id)?.photoId
			if (stopped) take()
		})
		.catch(() => null)
	return () => {
		stopped = true
		take()
	}
}

const nothingChanged = (error: string) => ({ output: { error: `${error} Nothing was changed.` } })

// The batch write (D-154), on the pattern of Hearth's (D-108): every id and every field is checked before anything
// is written, and the whole call is one confirm and one undo.
placesTools['update-places'] = {
	preview: preview('update-places', (input) => [
		...entries(input, 'update').map((row) => {
			const named = withFields(meadow.placeById(String(row.id ?? ''))?.name, row, ['id'], {
				addTo: collectionNames,
				removeFrom: collectionNames,
			})
			return named && say('change', named)
		}),
		...ids(input, 'remove').map((id) => {
			const place = meadow.placeById(id)
			return place && say('remove', place.name)
		}),
	]),
	// a call that deletes asks every time
	asks: (input) => ids(input, 'remove').length > 0,
	run: async (input, ctx) => {
		await meadow.load()
		const update = entries(input, 'update')
		const remove = [...new Set(ids(input, 'remove'))]
		if (!update.length && !remove.length) return { output: { error: 'Nothing to change: pass `update` or `remove`.' } }
		const missing = [...update.map((row) => String(row.id ?? '')), ...remove].filter((id) => !meadow.placeById(id))
		if (missing.length) return unknown('place', 'venue', missing)
		const lost = update
			.flatMap((row) => [...listed(row, 'addTo'), ...listed(row, 'removeFrom')])
			.filter((id) => !meadow.collections.some((entry) => entry.id === id))
		if (lost.length) return unknown('collection', 'collection', [...new Set(lost)])

		// every field is read before anything is written
		const changes: { id: string; patch: PlacePatch }[] = []
		for (const row of update) {
			const id = row.id as string
			const patch: PlacePatch = {}
			const name = given(row, 'name')
			if (name) patch.name = name.slice(0, 200)
			if ('category' in row) {
				if (!isCategory(row.category)) return nothingChanged(`${JSON.stringify(row.category)} is not a kind of place.`)
				patch.category = row.category
			}
			if ('vibes' in row) {
				const asked = Array.isArray(row.vibes) ? [...new Set(row.vibes)] : undefined
				const vibes = knownVibes(asked, meadow.vibes)
				if (!asked || vibes.length !== asked.length)
					return nothingChanged(
						`${JSON.stringify((asked ?? [row.vibes]).filter((vibe) => !vibes.includes(vibe as string)))} are not vibes: pass ids the tool lists, or the \`id\` of a row under \`vibe\`.`
					)
				patch.vibes = vibes
			}
			if ('price' in row) {
				const price = row.price
				if (typeof price !== 'number' || !Number.isInteger(price) || price < 0 || price > 4)
					return nothingChanged(`${JSON.stringify(price)} is not a price: pass 1 to 4, or 0 to clear it.`)
				patch.price = price ? (price as PriceLevel) : undefined
			}
			if (typeof row.alcoholFree === 'boolean') patch.alcoholFree = row.alcoholFree || undefined
			if (typeof row.favourite === 'boolean') patch.favourite = row.favourite
			const notes = given(row, 'notes')
			if (notes !== undefined) patch.notes = notes.slice(0, 2000) || undefined
			const phone = given(row, 'phone')
			if (phone !== undefined) patch.phone = phone.slice(0, 40) || undefined
			const url = given(row, 'url')
			if (url) {
				const site = normalLink(url)
				if (!site)
					return nothingChanged(`${JSON.stringify(url)} is not a website: pass an address starting with https://.`)
				patch.url = site
			} else if (url === '') patch.url = undefined
			if (Object.keys(patch).length) changes.push({ id, patch })
		}

		const before = new Map(update.map((row) => [row.id as string, meadow.placeById(row.id as string)?.url]))
		const undos: Undo[] = []
		const touched = new Set<string>()
		if (changes.length) {
			undos.push(meadow.changePlaces(changes).undo)
			for (const { id, patch } of changes) {
				touched.add(id)
				// the website the owner confirmed on the card is read on the device, for a place with no picture
				const place = meadow.placeById(id)
				if (patch.url && patch.url !== before.get(id) && place && !place.photoId && !place.thumb)
					undos.push(fetchPlacePicture(id))
			}
		}
		for (const row of update) {
			const id = row.id as string
			for (const collection of listed(row, 'addTo')) {
				const { added, undo } = meadow.addToCollection(collection, [id])
				if (!added) continue
				undos.push(undo)
				touched.add(id)
			}
			for (const collection of listed(row, 'removeFrom')) {
				if (!meadow.collections.find((entry) => entry.id === collection)?.placeIds.includes(id)) continue
				undos.push(meadow.removeFromCollection(collection, id).undo)
				touched.add(id)
			}
		}
		const updated = [...touched].map((id) => ({ id, name: meadow.placeById(id)?.name ?? '' }))
		const removed = remove.map((id) => {
			const { place, undo } = meadow.removePlace(id)
			undos.push(undo)
			return { id, name: place?.name ?? '' }
		})
		if (undos.length)
			ctx.undo(
				get(t)('domains.places.gardener.toast.places', { values: { count: updated.length + removed.length } }),
				together(undos)
			)
		return {
			output: { updated, removed },
			touched: [...updated, ...removed].map((place) => `eden://place/${place.id}`),
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
	const { gardenerSetup } = await import('@eden/shared/shell/gardener')
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
