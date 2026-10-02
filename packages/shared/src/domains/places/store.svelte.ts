// Meadow's store (product/domains/places.md), shared by both apps as Sky's is. The rows live in the data layer: a
// saved place is a `venue` Place and its `place-profile` (D-133), read here as one `SavedPlace`; collections, visits
// and custom vibes are rows of their own; what was found and not saved is a mirror of this device. A write changes
// the store at once and is sent after, in order (`WriteQueue`), and every write hands back an undo for the toast
// (D-12). The store cannot import an app's shell, so what it needs of one is given at `bind`: the Garden's feed.
import { SvelteMap, SvelteSet } from 'svelte/reactivity'
import { logError } from '../../api/diagnostics.js'
import {
	applyBatch,
	attachBytes,
	deleteRows,
	newId,
	queryEntities,
	queryEvents,
	queryPlaces,
	readAttachment,
	restoreRows,
	toUri,
	WriteQueue,
	type BatchOp,
	type Write,
} from '../../data/index.js'
import { todayIso } from '../../dates/index.js'
import { boundsAround, throttle, type Geocoder, type LngLat } from '../../geo/index.js'
import { settings } from '../../settings/index.js'
import { assertFact, deleteFact, queryFacts, updateFact } from '../../profile/client.js'
import { emit } from '../../signals/runtime.js'
import type { SizedPicture } from '../../api/picture.js'
import { asCategory, categoryFromOsm } from './categories.js'
import {
	fetchDetail,
	lacksPicture,
	searchHours,
	type DetailAnswer,
	type HoursDetail,
	type PictureOutcome,
	type PlaceRef,
} from './details/index.js'
import {
	candidateKey,
	discoveryBrief,
	DISCOVERY_LIMIT,
	inputFromFilter,
	type Availability,
	type DiscoverySource,
	type SourceFailure,
} from './discovery.js'
import { favouriteChanges, favouriteVibes } from './favorites.js'
import { asFilter, distanceKm, filterPlaces, type FilterContext } from './filter.js'
import { areaPoint, areaWords, asArea, readHome } from './home.js'
import { listingKey, listingWindow, type ListingsQuery, type ListingsSource } from './listings.js'
import { outingInput, outingOf, outingStatus, toOuting, type OutingMark } from './outings.js'
import {
	draftPlace,
	joinPlaces,
	meadowRows,
	meadowUris,
	placePatch,
	placeUris,
	profilePayload,
	profileUri,
	saveOps,
	sortVisits,
	toCollection,
	toVibe,
	toVisit,
	instant,
	visitOps,
} from './rows.js'
import {
	EMPTY_FILTER,
	MEADOW,
	type Collection,
	type CollectionPayload,
	type CustomVibe,
	type DetailPayload,
	type DetailSlot,
	type Facet,
	type Listing,
	type ListingPayload,
	type Outing,
	type MeadowData,
	type PlaceCandidate,
	type PlaceDraft,
	type PlaceFilter,
	type PlaceProfilePayload,
	type SavedPlace,
	type SearchArea,
	type Suggestion,
	type SuggestionPayload,
	type VibePayload,
	type Visit,
	type VisitPayload,
} from './types.js'

export type Undo = () => void

/** The fields of a saved place a batch may change; one given as `undefined` is cleared. */
export type PlacePatch = Partial<
	Pick<SavedPlace, 'name' | 'category' | 'vibes' | 'price' | 'alcoholFree' | 'favourite' | 'notes' | 'url' | 'phone'>
>

/** One change: what the page sees of it and the way back, and the write that stores each. */
interface Change {
	apply: () => void
	revert: () => void
	write: Write
	unwrite: Write
}

/**
 * What the store needs of the app it runs in, given at `bind`: a line in the Garden's feed, which answers how to take
 * it back, and the sources that reach outside (D-128). A source that is not given is not there: on the phone, which
 * has no Gardener yet, nothing is discovered, and the pages say so.
 */
export interface MeadowShell {
	record(key: string, values?: Record<string, string | number>): () => void
	/** Finds places Meadow does not hold: the Gardener with a web search, on the desktop. */
	discovery?: DiscoverySource
	/** Finds a place by its name. */
	geocoder?: Geocoder
	/** Finds what is on: the Gardener with a web search, on the desktop. */
	listings?: ListingsSource
}

/** Where a search stands, for the page. */
export interface SearchState {
	status: 'idle' | 'searching' | 'failed'
	failure?: SourceFailure
	/** The source's own words for a failure, when it gave any. */
	detail?: string
	/** The names found that the geocoder could not put on the map. */
	unplaced: string[]
}

/** How far from the search area's point a found place may be and still be taken as the one meant, in kilometres. */
const SEARCH_REACH_KM = 60
/** How long a detail that was read stands before it is asked for again, and one that was not found. */
const DETAIL_FRESH_MS = 3 * 24 * 60 * 60 * 1000
const DETAIL_RETRY_MS = 24 * 60 * 60 * 1000
/** The source and the name a suggestion's mirror is kept under. */
const SUGGESTION_SOURCE = 'web-search'
const LISTING_SOURCE = 'web-search'
const mirrorUri = (type: string, id: string) => toUri(type, id)

const FILTER_KEY = 'eden:places:filter'
const AREA_KEY = 'eden:places:area'
const photoUri = (id: string) => toUri('attachment', id)

function kept<T>(key: string, read: (value: unknown) => T): T {
	try {
		return read(typeof localStorage === 'undefined' ? null : JSON.parse(localStorage.getItem(key) ?? 'null'))
	} catch {
		return read(null)
	}
}
function keep(key: string, value: unknown) {
	try {
		if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify(value))
	} catch {
		// no storage: the choice lives for this session only
	}
}

export class MeadowStore {
	ready = $state(false)
	/** A write failed, or the rows could not be read; the page shows it and offers a retry. */
	saveFailed = $state(false)
	places = $state<SavedPlace[]>([])
	vibes = $state<CustomVibe[]>([])
	collections = $state<Collection[]>([])
	visits = $state<Visit[]>([])
	/** What was found and not saved: mirrors of this device, gone in seven days (D-133). Dismissed ones are kept, hidden. */
	found = $state<Suggestion[]>([])
	search = $state<SearchState>({ status: 'idle', unplaced: [] })
	/** What is on, as the searches found it: mirrors of this device (D-133). */
	listings = $state<Listing[]>([])
	/** The `outing` Events: a listing the owner is interested in (tentative) or going to (confirmed). */
	outings = $state<Outing[]>([])
	listingSearch = $state<SearchState>({ status: 'idle', unplaced: [] })

	/** What narrows the saved places, and where a search looks: this device's, kept across launches. */
	filter = $state<PlaceFilter>(kept(FILTER_KEY, asFilter))
	area = $state<SearchArea>(kept(AREA_KEY, asArea))
	/** A place a tile or a tool asked the page to show; the page reads it once. */
	reveal = $state<string>()
	/** The minute "open now" is asked at; a page that shows it moves it on. */
	now = $state(Date.now())

	/** A picture's full image as an object URL, by attachment id, read the first time its place is shown. */
	#images = new SvelteMap<string, string>()
	// a plain set, never read reactively: a picture is asked for from inside a `$derived`, where writing state is
	// forbidden (state_unsafe_mutation)
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	#reading = new Set<string>()

	/** What the detail sources answered, by `<place key>:<slot>`. */
	#details = new SvelteMap<string, DetailAnswer<DetailSlot> & { fetchedAt: string }>()
	/** A found place's picture, as its page showed it, until the place is saved or the app closes. */
	#pictures = new SvelteMap<string, SizedPicture>()
	#asking = new SvelteSet<string>()

	#shell: MeadowShell = { record: () => () => {} }
	#loading: Promise<void> | undefined
	readonly #queue = new WriteQueue(
		(failed) => (this.saveFailed = failed),
		(error) => void logError('data', 'A Meadow write failed', String(error)).catch(() => null)
	)

	/** Where the map opens and searches look near: home, rounded, or the area the owner searched. */
	readonly origin = $derived<LngLat>(areaPoint(this.area))
	/**
	 * Where the origin's pin stands and distances are measured from: the home itself, exactly, or the searched area.
	 * It is used on the device only; what is sent is `origin`, the rounded point (D-60, D-142).
	 */
	readonly originPin = $derived<LngLat>(this.area.kind === 'home' ? readHome().exact : areaPoint(this.area))
	readonly favourites = $derived(this.places.filter((place) => place.favourite))
	/** The found places the page shows: not dismissed, and not saved since. */
	readonly suggestions = $derived(
		this.found.filter(
			(entry) =>
				!entry.dismissed && !this.placeBySource('osm', entry.candidate.providerIds.osm) && entry.candidate.point
		)
	)
	/** Whether a source that finds new places was given to the store, and the owner has not turned it off. */
	get canDiscover(): boolean {
		return this.#shell.discovery !== undefined && settings.placesDiscovery
	}

	/** Gives the store what it needs of the app's shell. Called once, when the app's bindings are made. */
	bind(shell: Partial<MeadowShell>) {
		this.#shell = { ...this.#shell, ...shell }
	}

	// ---- Reading -----------------------------------------------------------------------------------------------

	load(): Promise<void> {
		return (this.#loading ??= this.#read())
	}

	async #read() {
		try {
			const [places, profiles, vibes, collections, visits, found, details, listings, outings] = await Promise.all([
				queryPlaces({ kinds: [MEADOW.venue] }),
				queryEntities<PlaceProfilePayload>({ type: MEADOW.profile }),
				queryEntities<VibePayload>({ type: MEADOW.vibe }),
				queryEntities<CollectionPayload>({ type: MEADOW.collection }),
				queryEntities<VisitPayload>({ type: MEADOW.visit }),
				queryEntities<SuggestionPayload>({ type: MEADOW.suggestion }),
				queryEntities<DetailPayload>({ type: MEADOW.detail }),
				queryEntities<ListingPayload>({ type: MEADOW.listing }),
				queryEvents({ kinds: [MEADOW.outing] }),
			])
			this.listings = listings
				.map((row) => ({
					...row.payload,
					id: row.id,
					source: row.source ?? LISTING_SOURCE,
					externalId: row.externalId ?? row.id,
				}))
				.sort((a, b) => a.startAt.localeCompare(b.startAt))
			this.outings = outings.flatMap((row) => toOuting(row) ?? [])
			this.found = found.map((row) => ({
				...row.payload,
				id: row.id,
				source: row.source ?? SUGGESTION_SOURCE,
				externalId: row.externalId ?? row.id,
			}))
			this.#details.clear()
			for (const row of details) {
				const { placeKey, slot, status, fetchedAt, data } = row.payload
				this.#details.set(`${placeKey}:${slot}`, {
					status,
					source: row.source ?? undefined,
					fetchedAt,
					...(data !== undefined ? { data: data as never } : {}),
				})
			}
			this.places = joinPlaces(places, profiles)
			this.vibes = vibes.map(toVibe)
			this.collections = collections.map(toCollection)
			this.visits = sortVisits(visits.map(toVisit))
			this.saveFailed = this.#queue.failed
		} catch (error) {
			// nothing was read: say so, and let the retry read again
			this.#loading = undefined
			this.saveFailed = true
			await logError('data', 'Could not read the Meadow rows', String(error)).catch(() => null)
		}
		this.ready = true
	}

	/** Reads the rows again, after an import changed them under the store. What is waiting to be sent is sent first. */
	async reload() {
		await this.#queue.settled()
		this.#loading = undefined
		await this.load()
	}

	/** The retry after a failure: reads again if the rows were never read, and sends what is waiting. */
	async flush() {
		if (!this.#loading) await this.load()
		await this.#queue.retry()
	}

	/** Resolves once every write made so far has been sent, or the queue stopped on one. */
	settled(): Promise<void> {
		return this.#queue.settled()
	}

	/** What the store holds, as plain data. */
	data(): MeadowData {
		return $state.snapshot({
			places: this.places,
			vibes: this.vibes,
			collections: this.collections,
			visits: this.visits,
		}) as MeadowData
	}

	placeById(id: string | undefined): SavedPlace | undefined {
		return id ? this.places.find((place) => place.id === id) : undefined
	}
	visitsOf(placeId: string): Visit[] {
		return this.visits.filter((visit) => visit.placeId === placeId)
	}
	collectionsOf(placeId: string): Collection[] {
		return this.collections.filter((collection) => collection.placeIds.includes(placeId))
	}
	/** The saved place a source's id names, if one is: how a found place is known to be saved already. */
	placeBySource(source: string, id: string | undefined): SavedPlace | undefined {
		return id ? this.places.find((place) => place.providerIds[source] === id) : undefined
	}
	distanceTo(place: { point?: LngLat }): number | undefined {
		return distanceKm(place, this.originPin)
	}

	/** What the filter is held against. */
	context(vibeLabel?: (id: string) => string): FilterContext {
		return {
			origin: this.origin,
			collections: this.collections,
			customVibes: this.vibes,
			now: this.now,
			timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
			vibeLabel,
		}
	}
	/** The saved places the filter leaves, nearest first. */
	filtered(vibeLabel?: (id: string) => string): SavedPlace[] {
		return filterPlaces(this.places, this.filter, this.context(vibeLabel))
	}

	setFilter(filter: PlaceFilter) {
		this.filter = filter
		keep(FILTER_KEY, filter)
	}
	clearFilter() {
		this.setFilter({ ...EMPTY_FILTER })
	}
	setArea(area: SearchArea) {
		this.area = area
		keep(AREA_KEY, area)
	}

	/**
	 * A place's whole picture as a URL the page may show: the small square its row carries until the file has been
	 * read, then the file itself. Nothing for a place with no picture.
	 */
	image(place: Pick<SavedPlace, 'photoId' | 'thumb'>): string | undefined {
		const id = place.photoId
		if (!id) return place.thumb
		const full = this.#images.get(id)
		if (full) return full
		if (!this.#reading.has(id)) {
			this.#reading.add(id)
			void readAttachment(id)
				.then((bytes) => {
					if (bytes?.length && !this.#images.has(id)) {
						const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' }))
						this.#images.set(id, url)
					}
				})
				.catch(() => null)
		}
		return place.thumb
	}

	// ---- Finding places ------------------------------------------------------------------------------------------

	/** What a search would be asked, from the filter as it stands and the area it looks in. */
	discoveryQuery(lang: string) {
		return {
			filter: $state.snapshot(this.filter) as PlaceFilter,
			area: areaWords(this.area),
			exclude: this.places.map((place) => place.name),
			limit: DISCOVERY_LIMIT,
			lang,
		}
	}
	/** The filter in the words a search is asked with. */
	brief(): string {
		return discoveryBrief(inputFromFilter(this.filter, areaWords(this.area)), this.vibes)
	}

	/**
	 * Asks the discovery source for places that fit the filter (D-128). Pressing the button is the consent, as Read is
	 * in a capture (D-86): the page shows what is sent and what it costs before. What comes back is put on the map by
	 * `receive`, which the source calls; this holds the page's state around it.
	 */
	async discover(lang: string): Promise<void> {
		const source = this.#shell.discovery
		if (!source || this.search.status === 'searching') return
		this.search = { status: 'searching', unplaced: [] }
		try {
			const result = await source.discover(this.discoveryQuery(lang))
			if (result.failure && result.failure !== 'cancelled') {
				this.search = { status: 'failed', failure: result.failure, detail: result.detail, unplaced: [] }
				return
			}
			this.search = { status: 'idle', unplaced: this.search.unplaced }
		} catch (error) {
			this.search = { status: 'failed', failure: 'network', unplaced: [] }
			await logError('places', 'A search for places failed', String(error)).catch(() => null)
		}
	}

	/** Whether a search can be asked now, with who would answer and about what it would cost; nothing is sent. */
	async availability(lang: string): Promise<Availability> {
		const source = this.#shell.discovery
		if (!source) return { available: false, reason: 'unavailable' }
		if (!settings.placesDiscovery) return { available: false, reason: 'off' }
		try {
			return await source.available(this.discoveryQuery(lang))
		} catch {
			return { available: false, reason: 'unavailable' }
		}
	}

	#geocode: ((name: string, lang: string) => ReturnType<Geocoder['search']>) | undefined
	/** The geocoder, one request a second: a name and the rounded point of the search area (D-131). */
	geocode(name: string, lang: string): ReturnType<Geocoder['search']> {
		const geocoder = this.#shell.geocoder
		if (!geocoder) return Promise.resolve([])
		this.#geocode ??= throttle(
			(text: string, language: string) =>
				geocoder.search({
					text,
					near: this.origin,
					within: boundsAround(this.origin, SEARCH_REACH_KM),
					lang: language,
					limit: 4,
				}),
			1
		)
		return this.#geocode(name, lang)
	}

	/**
	 * Takes what a source found: each candidate is looked up by its name near the search area, and one the geocoder
	 * finds there gets its point and its OpenStreetMap id and becomes a suggestion, a mirror of this device (D-133).
	 * One it cannot find gets no pin, since nothing says the place is where the words say; its name is listed as not
	 * placed. A place already saved, or one the owner dismissed, is passed over. Nothing is saved.
	 */
	async receive(
		query: string,
		candidates: PlaceCandidate[],
		lang: string
	): Promise<{ placed: Suggestion[]; unplaced: string[] }> {
		const placed: Suggestion[] = []
		const unplaced: string[] = []
		const at = instant()
		for (const candidate of candidates) {
			let hit
			try {
				const hits = await this.geocode([candidate.name, candidate.addressLine].filter(Boolean).join(', '), lang)
				hit = hits[0] ?? (candidate.addressLine ? (await this.geocode(candidate.name, lang))[0] : undefined)
			} catch {
				hit = undefined
			}
			if (!hit) {
				unplaced.push(candidate.name)
				continue
			}
			if (this.placeBySource('osm', hit.externalId)) continue
			const located: PlaceCandidate = {
				...candidate,
				point: hit.point,
				providerIds: { ...candidate.providerIds, osm: hit.externalId },
				category: candidate.category && candidate.category !== 'venue' ? candidate.category : categoryFromOsm(hit.kind),
				...(candidate.addressLine || !hit.addressLine ? {} : { addressLine: hit.addressLine }),
				...(candidate.locality || !hit.locality ? {} : { locality: hit.locality }),
			}
			const externalId = candidateKey(located)
			if (this.found.some((entry) => entry.externalId === externalId && entry.dismissed)) continue
			placed.push({ id: '', source: SUGGESTION_SOURCE, externalId, candidate: located, query, foundAt: at })
		}
		if (placed.length) {
			try {
				const result = await applyBatch(
					placed.map(({ candidate, externalId }) => ({
						op: 'putMirror',
						input: {
							type: MEADOW.suggestion,
							source: SUGGESTION_SOURCE,
							externalId,
							payload: { candidate, query, foundAt: at } satisfies SuggestionPayload,
						},
					}))
				)
				placed.forEach((entry, i) => (entry.id = result.rows[i]?.id ?? newId()))
			} catch (error) {
				// the mirrors could not be written: the pins still show for this session
				placed.forEach((entry) => (entry.id = newId()))
				await logError('data', 'The found places could not be kept', String(error)).catch(() => null)
			}
			const fresh = placed.map((entry) => entry.externalId)
			this.found = [...placed, ...this.found.filter((entry) => !fresh.includes(entry.externalId))]
		}
		this.search = { ...this.search, unplaced }
		return { placed, unplaced }
	}

	suggestionById(id: string | undefined): Suggestion | undefined {
		return id ? this.found.find((entry) => entry.id === id) : undefined
	}

	/** A found place as the place it would be saved as. */
	#draftOf(suggestion: Suggestion): PlaceDraft {
		const { candidate } = suggestion
		const hours = this.#details.get(`${suggestion.id}:hours`)
		const read = hours?.status === 'ok' ? (hours.data as HoursDetail | undefined) : undefined
		return {
			name: candidate.name,
			category: asCategory(candidate.category),
			...(candidate.point ? { point: candidate.point } : {}),
			...(candidate.website ? { url: candidate.website } : {}),
			vibes: [...candidate.vibes],
			...(candidate.price ? { price: candidate.price } : {}),
			...(candidate.alcoholFree !== undefined ? { alcoholFree: candidate.alcoholFree } : {}),
			// a source writes an address as one line; it is kept as the first until the owner gives it its parts
			...(candidate.addressLine ? { address: { line1: candidate.addressLine } } : {}),
			...(candidate.locality ? { locality: candidate.locality } : {}),
			providerIds: { ...candidate.providerIds },
			...(read
				? {
						hours: {
							source: hours?.source ?? 'search',
							asOf: hours!.fetchedAt,
							text: read.text,
							...(read.spec ? { spec: read.spec } : {}),
						},
					}
				: candidate.hoursText
					? { hours: { source: 'search', asOf: suggestion.foundAt, text: candidate.hoursText } }
					: {}),
			savedFrom: {
				via: 'suggestion',
				...(candidate.why ? { why: candidate.why } : {}),
				sources: candidate.sources,
				at: instant(),
			},
		}
	}

	/**
	 * Keeps a found place: it becomes a `venue` Place and its profile, and its mirror is dropped, as one change with
	 * one undo (D-133). The picture its page showed, if it was read this session, is kept with it.
	 */
	saveSuggestion(id: string): { place: SavedPlace | undefined; undo: Undo } {
		const suggestion = this.suggestionById(id)
		if (!suggestion) return { place: undefined, undo: () => {} }
		const before = $state.snapshot(this.found) as Suggestion[]
		const { id: _id, source, externalId, ...payload } = $state.snapshot(suggestion) as Suggestion
		const { place, change } = this.#adding(this.#draftOf(suggestion), this.#pictures.get(id), {
			ops: [{ op: 'dropMirror', uri: mirrorUri(MEADOW.suggestion, id) }],
			undoOps: [{ op: 'putMirror', input: { type: MEADOW.suggestion, source, externalId, payload } }],
		})
		const undo = this.#commit(
			{
				apply: () => {
					change.apply()
					this.found = this.found.filter((entry) => entry.id !== id)
				},
				revert: () => {
					change.revert()
					this.found = before
				},
				write: change.write,
				unwrite: change.unwrite,
			},
			'garden.feed.placeSaved',
			{ name: place.name }
		)
		this.#afterSave()
		return { place, undo }
	}

	/** Puts a found place out of sight; it stays a mirror until it is swept, so the same search does not bring it back. */
	dismissSuggestion(id: string): { undo: Undo } {
		const suggestion = this.suggestionById(id)
		if (!suggestion) return { undo: () => {} }
		const { id: _id, source, externalId, ...payload } = $state.snapshot(suggestion) as Suggestion
		const put = (dismissed: boolean) => () =>
			applyBatch([
				{ op: 'putMirror', input: { type: MEADOW.suggestion, source, externalId, payload: { ...payload, dismissed } } },
			])
		const show = (dismissed: boolean) =>
			(this.found = this.found.map((entry) => (entry.id === id ? { ...entry, dismissed } : entry)))
		const undo = this.#commit({
			apply: () => show(true),
			revert: () => show(false),
			write: put(true),
			unwrite: put(false),
		})
		return { undo }
	}

	// ---- Listings and outings ---------------------------------------------------------------------------------------

	/** The listings still to come, the soonest first. */
	get upcoming(): Listing[] {
		const today = todayIso()
		return this.listings.filter((listing) => (listing.endAt ?? listing.startAt).slice(0, 10) >= today)
	}
	get canFindListings(): boolean {
		return this.#shell.listings !== undefined && settings.placesDiscovery
	}

	/** What a search for listings would be asked: the days ahead, the area in words, the vibes the owner leans to. */
	listingsQuery(lang: string, interests?: string): ListingsQuery {
		return {
			...listingWindow(todayIso()),
			area: areaWords(this.area),
			vibes: favouriteVibes(this.places, this.visits)
				.slice(0, 5)
				.map((vibe) => this.vibes.find((custom) => custom.id === vibe.name)?.label ?? vibe.name.replace(/-/g, ' ')),
			...(interests?.trim() ? { interests: interests.trim() } : {}),
			lang,
		}
	}

	async listingsAvailability(lang: string): Promise<Availability> {
		const source = this.#shell.listings
		if (!source) return { available: false, reason: 'unavailable' }
		if (!settings.placesDiscovery) return { available: false, reason: 'off' }
		try {
			return await source.available(this.listingsQuery(lang))
		} catch {
			return { available: false, reason: 'unavailable' }
		}
	}

	/**
	 * Asks the listings source what is on (D-128). What comes back is kept by `receiveListings`, which the source
	 * calls. Answers how it went, for the weekly run (D-134): `busy` is the Gardener at another request.
	 */
	async findListings(lang: string, interests?: string): Promise<{ failure?: SourceFailure; found: Listing[] }> {
		const source = this.#shell.listings
		if (!source) return { failure: 'unavailable', found: [] }
		if (this.listingSearch.status === 'searching') return { failure: 'busy', found: [] }
		this.listingSearch = { status: 'searching', unplaced: [] }
		const before = this.listings.map((listing) => listing.externalId)
		try {
			const result = await source.fetch(this.listingsQuery(lang, interests))
			if (result.failure && result.failure !== 'cancelled') {
				this.listingSearch = { status: 'failed', failure: result.failure, detail: result.detail, unplaced: [] }
				return { failure: result.failure, found: [] }
			}
			this.listingSearch = { status: 'idle', unplaced: [] }
			return { found: this.listings.filter((listing) => !before.includes(listing.externalId)) }
		} catch (error) {
			this.listingSearch = { status: 'failed', failure: 'network', unplaced: [] }
			await logError('places', 'A search for listings failed', String(error)).catch(() => null)
			return { failure: 'network', found: [] }
		}
	}

	/** Takes what a source found: each listing becomes a mirror of this device, the same event found twice one row. */
	async receiveListings(payloads: ListingPayload[]): Promise<Listing[]> {
		if (!payloads.length) return []
		const keyed = payloads.map((payload) => ({ payload, externalId: listingKey(payload) }))
		let ids: (string | undefined)[] = []
		try {
			const result = await applyBatch(
				keyed.map(({ payload, externalId }) => ({
					op: 'putMirror',
					input: { type: MEADOW.listing, source: LISTING_SOURCE, externalId, payload },
				}))
			)
			ids = result.rows.map((row) => row.id)
		} catch (error) {
			await logError('data', 'The listings could not be kept', String(error)).catch(() => null)
		}
		const received = keyed.map(({ payload, externalId }, i): Listing => ({
			...payload,
			id: ids[i] ?? newId(),
			source: LISTING_SOURCE,
			externalId,
		}))
		const fresh = received.map((listing) => listing.externalId)
		this.listings = [...this.listings.filter((listing) => !fresh.includes(listing.externalId)), ...received].sort(
			(a, b) => a.startAt.localeCompare(b.startAt)
		)
		return received
	}

	listingById(id: string | undefined): Listing | undefined {
		return id ? this.listings.find((listing) => listing.id === id) : undefined
	}
	outingFor(listing: Pick<Listing, 'source' | 'externalId'>): Outing | undefined {
		return outingOf(listing, this.outings)
	}

	/**
	 * Marks a listing: interested makes a tentative `outing` Event, going confirms it, and no mark takes the outing
	 * away. Each is one write with one undo. The Event carries the listing's source, id and snapshot (D-37).
	 */
	markListing(id: string, mark: OutingMark | undefined): { outing: Outing | undefined; undo: Undo } {
		const listing = this.listingById(id)
		if (!listing) return { outing: undefined, undo: () => {} }
		const held = $state.snapshot(this.outings) as Outing[]
		const existing = outingOf(listing, held)
		const uri = (outingId: string) => toUri('event', outingId)
		if (!existing && !mark) return { outing: undefined, undo: () => {} }
		if (!existing && mark) {
			const input = outingInput(newId(), $state.snapshot(listing) as Listing, mark)
			const outing: Outing = {
				id: input.id!,
				status: outingStatus(mark),
				title: listing.title,
				startAt: listing.startAt,
				source: listing.source,
				externalId: listing.externalId,
			}
			const undo = this.#commit(
				{
					apply: () => (this.outings = [...this.outings, outing]),
					revert: () => (this.outings = held),
					write: () => applyBatch([{ op: 'createPrimitive', type: 'event', input }]),
					unwrite: () => deleteRows([uri(outing.id)]),
				},
				mark === 'going' ? 'garden.feed.outingGoing' : 'garden.feed.outingInterested',
				{ title: listing.title }
			)
			return { outing, undo }
		}
		const was = existing!
		if (!mark) {
			const undo = this.#commit(
				{
					apply: () => (this.outings = this.outings.filter((outing) => outing.id !== was.id)),
					revert: () => (this.outings = held),
					write: () => deleteRows([uri(was.id)]),
					unwrite: () => restoreRows([uri(was.id)]),
				},
				'garden.feed.outingRemoved',
				{ title: listing.title }
			)
			return { outing: undefined, undo }
		}
		const after: Outing = { ...was, status: outingStatus(mark) }
		if (after.status === was.status) return { outing: was, undo: () => {} }
		const put = (outing: Outing) =>
			(this.outings = this.outings.map((entry) => (entry.id === outing.id ? outing : entry)))
		const patch = (status: Outing['status']) => () =>
			applyBatch([{ op: 'updatePrimitive', type: 'event', id: was.id, patch: { status } }])
		const undo = this.#commit(
			{ apply: () => put(after), revert: () => put(was), write: patch(after.status), unwrite: patch(was.status) },
			mark === 'going' ? 'garden.feed.outingGoing' : 'garden.feed.outingInterested',
			{ title: listing.title }
		)
		return { outing: after, undo }
	}

	// ---- Details (D-128, D-135) ----------------------------------------------------------------------------------

	/** What a slot of a place is known to hold, or nothing while it has not been asked. */
	detail<S extends DetailSlot>(key: string, slot: S): (DetailAnswer<S> & { fetchedAt: string }) | undefined {
		return this.#details.get(`${key}:${slot}`) as (DetailAnswer<S> & { fetchedAt: string }) | undefined
	}
	/** Whether a slot of a place is being asked for now. */
	asking(key: string, slot: DetailSlot): boolean {
		return this.#asking.has(`${key}:${slot}`)
	}
	/** The picture a found place's page showed, as the small square, while the app has it. */
	foundPicture(id: string): string | undefined {
		return this.#pictures.get(id)?.thumbnail
	}

	/**
	 * Reads a place's details when the owner opens it (D-135): its hours, from the first source that has them, and
	 * the picture its own page shows. A saved place keeps what was read on its profile, with the source and the time;
	 * a found one keeps it as a mirror of this device. A slot that was read lately is not asked for again, and one
	 * that could not be read never holds up the rest.
	 */
	async openDetails(target: SavedPlace | Suggestion, lang: string): Promise<void> {
		await this.#readDetails(target, lang)
	}

	async #readDetails(
		target: SavedPlace | Suggestion,
		lang: string,
		options: { forcePhoto?: boolean } = {}
	): Promise<PictureOutcome> {
		const saved = 'candidate' in target ? undefined : target
		const suggestion = 'candidate' in target ? target : undefined
		const ref: PlaceRef = saved
			? {
					key: saved.id,
					name: saved.name,
					...(saved.providerIds.osm ? { osmId: saved.providerIds.osm } : {}),
					...(saved.url ? { url: saved.url } : {}),
					...(saved.hours?.source === searchHours.id && saved.hours.text ? { hoursText: saved.hours.text } : {}),
				}
			: {
					key: suggestion!.id,
					name: suggestion!.candidate.name,
					...(suggestion!.candidate.providerIds.osm ? { osmId: suggestion!.candidate.providerIds.osm } : {}),
					...(suggestion!.candidate.website ? { url: suggestion!.candidate.website } : {}),
					...(suggestion!.candidate.hoursText ? { hoursText: suggestion!.candidate.hoursText } : {}),
				}
		const off = settings.placesDetailsOff
		const due = (slot: DetailSlot) => {
			const known = this.#details.get(`${ref.key}:${slot}`)
			if (!known) return true
			const age = Date.now() - Date.parse(known.fetchedAt)
			return age > (known.status === 'ok' ? DETAIL_FRESH_MS : DETAIL_RETRY_MS)
		}
		const ask = async <S extends DetailSlot>(slot: S, force = false) => {
			const key = `${ref.key}:${slot}`
			if (this.#asking.has(key) || (!force && !due(slot))) return undefined
			this.#asking.add(key)
			try {
				const answer = await fetchDetail(slot, ref, { lang, off })
				const fetchedAt = instant()
				this.#details.set(key, { ...answer, fetchedAt })
				// the mirror says the slot was asked and what came of it; a picture's bytes are never in it
				const data =
					slot === 'photo' && answer.data ? { url: (answer.data as unknown as { url: string }).url } : answer.data
				void applyBatch([
					{
						op: 'putMirror',
						input: {
							type: MEADOW.detail,
							source: answer.source ?? 'none',
							externalId: key,
							payload: { slot, placeKey: ref.key, status: answer.status, fetchedAt, ...(data ? { data } : {}) },
						},
					},
				]).catch(() => null)
				return { answer, fetchedAt }
			} finally {
				this.#asking.delete(key)
			}
		}

		const hours = await ask('hours')
		if (hours?.answer.status === 'ok' && hours.answer.data && saved) {
			const { text, spec, website, phone } = hours.answer.data
			this.#quietly(saved.id, (place) => ({
				...place,
				hours: { source: hours.answer.source ?? 'osm', asOf: hours.fetchedAt, text, ...(spec ? { spec } : {}) },
				// what OpenStreetMap says of the place's page and phone fills what the owner left empty
				...(place.url || !website ? {} : { url: website }),
				...(place.phone || !phone ? {} : { phone }),
			}))
		}
		// the page may have been learnt from OpenStreetMap a moment ago
		const withPage: PlaceRef =
			!ref.url && hours?.answer.status === 'ok' && hours.answer.data?.website
				? { ...ref, url: hours.answer.data.website }
				: ref
		const wantsPicture = saved ? lacksPicture(saved) : !this.#pictures.has(ref.key)
		if (!wantsPicture) return 'had'
		if (!withPage.url) return 'noWebsite'
		Object.assign(ref, withPage)
		const photo = await ask('photo', options.forcePhoto)
		if (photo?.answer.status !== 'ok' || !photo.answer.data) return 'failed'
		if (saved) {
			// kept as the place's picture, as a recipe's page picture is (D-93); the owner may change it or take it away
			const now = this.placeById(saved.id)
			if (!now) return 'failed'
			if (now.photoId) return 'had'
			this.setPhoto(saved.id, photo.answer.data.picture)
		} else {
			this.#pictures.set(ref.key, photo.answer.data.picture)
		}
		return 'found'
	}

	/** A change to a saved place that is the app's own doing: no feed line and no undo, since the owner did nothing. */
	#quietly(id: string, change: (place: SavedPlace) => SavedPlace) {
		const before = this.placeById(id)
		if (!before) return
		const was = $state.snapshot(before) as SavedPlace
		const after = change({ ...was, profileId: was.profileId ?? newId() })
		const fields = this.#replaced(was, after)
		fields.apply()
		this.#queue.enqueue(fields.write)
	}

	// ---- Places ------------------------------------------------------------------------------------------------

	/** Saves a place the owner typed, or one a source found: a `venue` Place and its profile, in one write. */
	addPlace(draft: PlaceDraft, picture?: SizedPicture): { place: SavedPlace; undo: Undo } {
		const { place, change } = this.#adding(draft, picture)
		const undo = this.#commit(change, 'garden.feed.placeSaved', { name: place.name })
		this.#afterSave()
		return { place, undo }
	}

	/** Saves several places as one change with one undo: what an import commits. */
	addPlaces(drafts: PlaceDraft[]): { places: SavedPlace[]; undo: Undo } {
		const made = drafts.map((draft) => draftPlace(newId(), newId(), draft))
		if (!made.length) return { places: [], undo: () => {} }
		const before = $state.snapshot(this.places) as SavedPlace[]
		const undo = this.#commit(
			{
				apply: () => (this.places = this.#sorted([...this.places, ...made])),
				revert: () => (this.places = before),
				write: () => applyBatch(made.flatMap(saveOps)),
				unwrite: () => deleteRows(made.flatMap(placeUris)),
			},
			'garden.feed.placesImported',
			{ count: made.length }
		)
		this.#afterSave()
		return { places: made, undo }
	}

	#adding(draft: PlaceDraft, picture?: SizedPicture, extra: { ops?: BatchOp[]; undoOps?: BatchOp[] } = {}) {
		const photoId = picture ? newId() : undefined
		const place: SavedPlace = {
			...draftPlace(newId(), newId(), draft),
			...(photoId && picture ? { photoId, thumb: picture.thumbnail } : {}),
		}
		const before = $state.snapshot(this.places) as SavedPlace[]
		const change: Change = {
			apply: () => (this.places = this.#sorted([...this.places, place])),
			revert: () => (this.places = before),
			write: async () => {
				await applyBatch([...saveOps(place), ...(extra.ops ?? [])])
				if (photoId && picture) await this.#keepPicture(photoId, place, picture)
			},
			unwrite: async () => {
				await deleteRows([...placeUris(place), ...(photoId ? [photoUri(photoId)] : [])])
				if (extra.undoOps?.length) await applyBatch(extra.undoOps)
			},
		}
		return { place, change }
	}

	/** Changes a place's fields as one write with one undo. A plain `venue` gains its profile with the first change. */
	updatePlace(id: string, draft: PlaceDraft): { place: SavedPlace | undefined; undo: Undo } {
		const before = this.placeById(id)
		if (!before) return { place: undefined, undo: () => {} }
		const was = $state.snapshot(before) as SavedPlace
		const profileId = was.profileId ?? newId()
		const after: SavedPlace = {
			...draftPlace(id, profileId, { ...draft, favourite: draft.favourite ?? was.favourite }),
			// what a form does not hold stays as it was
			providerIds: { ...was.providerIds, ...(draft.providerIds ?? {}) },
			...((draft.hours ?? was.hours) ? { hours: draft.hours ?? was.hours } : {}),
			...(was.rating ? { rating: was.rating } : {}),
			...(was.photoId ? { photoId: was.photoId } : {}),
			...(was.thumb ? { thumb: was.thumb } : {}),
			...(was.savedFrom ? { savedFrom: was.savedFrom } : {}),
		}
		const undo = this.#commit(this.#replaced(was, after), 'garden.feed.placeChanged', { name: after.name })
		this.#afterSave()
		return { place: after, undo }
	}

	/**
	 * Changes several places as one write with one undo: what the Gardener's `update-places` commits (D-154). A patch
	 * holds only the fields that change, and one it holds as `undefined` is cleared; the rest of the place stands.
	 */
	changePlaces(changes: { id: string; patch: PlacePatch }[]): { places: SavedPlace[]; undo: Undo } {
		// one entry a place: a later patch for the same place is laid over the earlier
		const patches: Record<string, PlacePatch> = {}
		for (const { id, patch } of changes) patches[id] = { ...patches[id], ...patch }
		const made = Object.entries(patches).flatMap(([id, patch]) => {
			const before = this.placeById(id)
			if (!before) return []
			const was = $state.snapshot(before) as SavedPlace
			const after = Object.fromEntries(
				Object.entries({ ...was, profileId: was.profileId ?? newId(), ...patch }).filter(
					([, value]) => value !== undefined
				)
			) as unknown as SavedPlace
			return [{ after, step: this.#replaced(was, after) }]
		})
		if (!made.length) return { places: [], undo: () => {} }
		const steps = made.map((entry) => entry.step)
		const back = [...steps].reverse()
		const one = made.length === 1
		const undo = this.#commit(
			{
				apply: () => steps.forEach((step) => step.apply()),
				revert: () => back.forEach((step) => step.revert()),
				write: async () => {
					for (const step of steps) await step.write()
				},
				unwrite: async () => {
					for (const step of back) await step.unwrite()
				},
			},
			one ? 'garden.feed.placeChanged' : 'garden.feed.placesChanged',
			one ? { name: made[0]!.after.name } : { count: made.length }
		)
		this.#afterSave()
		return { places: made.map((entry) => entry.after), undo }
	}

	/**
	 * Asks after the picture of one saved place that has none, as opening it would, whether or not it was asked
	 * lately (D-153): what the owner asks for on the place, and what follows a website they have just confirmed for
	 * it (D-154).
	 */
	async findPicture(id: string, lang: string): Promise<PictureOutcome> {
		const place = this.placeById(id)
		if (!place) return 'failed'
		return this.#readDetails($state.snapshot(place) as SavedPlace, lang, { forcePhoto: true })
	}

	/** One place written over another of the same id: the Place's fields and the profile, as one batch each way. */
	#replaced(was: SavedPlace, after: SavedPlace): Change {
		const put = (place: SavedPlace) =>
			(this.places = this.#sorted(this.places.map((entry) => (entry.id === place.id ? place : entry))))
		const ops = (place: SavedPlace, other: SavedPlace): BatchOp[] => [
			{ op: 'updatePrimitive', type: 'place', id: place.id, patch: placePatch(place) },
			...(place.profileId
				? other.profileId
					? [{ op: 'updateEntity', id: place.profileId, payload: profilePayload(place) } satisfies BatchOp]
					: saveOps(place).slice(1)
				: []),
		]
		return {
			apply: () => put(after),
			revert: () => put(was),
			write: () => applyBatch(ops(after, was)),
			// a profile the change made is taken away again; one that was there is written back
			unwrite: async () => {
				await applyBatch(ops(was, after))
				if (after.profileId && !was.profileId) await deleteRows([profileUri(after.profileId)])
			},
		}
	}

	/** Puts a place where the owner clicked the map: the way a place no geocoder found gets its pin. */
	setPoint(id: string, point: LngLat): { place: SavedPlace | undefined; undo: Undo } {
		const before = this.placeById(id)
		if (!before) return { place: before, undo: () => {} }
		const was = $state.snapshot(before) as SavedPlace
		const after: SavedPlace = { ...was, point }
		const undo = this.#commit(this.#replaced(was, after), 'garden.feed.placeChanged', { name: was.name })
		return { place: after, undo }
	}

	setFavourite(id: string, favourite: boolean): { place: SavedPlace | undefined; undo: Undo } {
		const before = this.placeById(id)
		if (!before || before.favourite === favourite) return { place: before, undo: () => {} }
		const was = $state.snapshot(before) as SavedPlace
		const after: SavedPlace = { ...was, profileId: was.profileId ?? newId(), favourite }
		const undo = this.#commit(
			this.#replaced(was, after),
			favourite ? 'garden.feed.placeFavourited' : 'garden.feed.placeUnfavourited',
			{ name: was.name }
		)
		this.#afterSave()
		return { place: after, undo }
	}

	/**
	 * Deletes a place: its Place, its profile, its picture and its visits, and its name leaves every collection. All
	 * of it comes back with the undo.
	 */
	removePlace(id: string): { place: SavedPlace | undefined; undo: Undo } {
		const place = this.placeById(id)
		if (!place) return { place, undo: () => {} }
		const before = $state.snapshot({ places: this.places, visits: this.visits, collections: this.collections }) as {
			places: SavedPlace[]
			visits: Visit[]
			collections: Collection[]
		}
		const visits = before.visits.filter((visit) => visit.placeId === id)
		const held = before.collections.filter((collection) => collection.placeIds.includes(id))
		const uris = [
			...placeUris(place),
			...visits.map((visit) => toUri(MEADOW.visit, visit.id)),
			...(place.photoId ? [photoUri(place.photoId)] : []),
		]
		const collectionOps = (without: boolean): BatchOp[] =>
			held.map(({ id: collectionId, ...payload }) => ({
				op: 'updateEntity',
				id: collectionId,
				payload: without ? { ...payload, placeIds: payload.placeIds.filter((entry) => entry !== id) } : payload,
			}))
		const undo = this.#commit(
			{
				apply: () => {
					this.places = this.places.filter((entry) => entry.id !== id)
					this.visits = this.visits.filter((visit) => visit.placeId !== id)
					this.collections = this.collections.map((collection) =>
						collection.placeIds.includes(id)
							? { ...collection, placeIds: collection.placeIds.filter((entry) => entry !== id) }
							: collection
					)
				},
				revert: () => {
					this.places = before.places
					this.visits = before.visits
					this.collections = before.collections
				},
				write: () => applyBatch([...uris.map((uri): BatchOp => ({ op: 'delete', uri })), ...collectionOps(true)]),
				unwrite: () => applyBatch([...uris.map((uri): BatchOp => ({ op: 'restore', uri })), ...collectionOps(false)]),
			},
			'garden.feed.placeRemoved',
			{ name: place.name }
		)
		this.#afterSave()
		return { place, undo }
	}

	/**
	 * Gives a place a picture, or takes its picture away (D-133, as D-93 keeps a recipe's). The one it had is deleted
	 * with the change and comes back with the undo.
	 */
	setPhoto(id: string, picture: SizedPicture | undefined): { place: SavedPlace | undefined; undo: Undo } {
		const before = this.placeById(id)
		if (!before) return { place: before, undo: () => {} }
		const was = $state.snapshot(before) as SavedPlace
		const photoId = picture ? newId() : undefined
		const { photoId: _photo, thumb: _thumb, ...rest } = was
		const after: SavedPlace = {
			...rest,
			profileId: was.profileId ?? newId(),
			...(photoId && picture ? { photoId, thumb: picture.thumbnail } : {}),
		}
		const fields = this.#replaced(was, after)
		const undo = this.#commit({
			apply: fields.apply,
			revert: fields.revert,
			write: async () => {
				await fields.write()
				if (photoId && picture) await this.#keepPicture(photoId, after, picture)
				if (was.photoId) await deleteRows([photoUri(was.photoId)]).catch(() => null)
			},
			unwrite: async () => {
				if (was.photoId) await restoreRows([photoUri(was.photoId)]).catch(() => null)
				await fields.unwrite()
				if (photoId) await deleteRows([photoUri(photoId)]).catch(() => null)
			},
		})
		return { place: after, undo }
	}

	/** Stores a picture's file as a `place-photo`, linked `from` its place's profile. One that cannot be stored is logged. */
	async #keepPicture(photoId: string, place: SavedPlace, picture: SizedPicture) {
		try {
			await attachBytes(
				{
					id: photoId,
					kind: MEADOW.photo,
					fileName: 'place.jpg',
					mime: 'image/jpeg',
					thumbnail: picture.thumbnail,
					links: place.profileId ? [{ uri: profileUri(place.profileId), relation: 'from', label: place.name }] : [],
				},
				new Uint8Array(await picture.image.arrayBuffer())
			)
		} catch (error) {
			await logError('data', "A place's picture could not be stored", String(error)).catch(() => null)
		}
	}

	// ---- Visits ------------------------------------------------------------------------------------------------

	logVisit(
		placeId: string,
		visit: { day?: string; rating?: Visit['rating']; note?: string }
	): { visit: Visit | undefined; undo: Undo } {
		const place = this.placeById(placeId)
		if (!place) return { visit: undefined, undo: () => {} }
		const made: Visit = {
			id: newId(),
			placeId,
			day: visit.day ?? todayIso(),
			...(visit.rating ? { rating: visit.rating } : {}),
			...(visit.note?.trim() ? { note: visit.note.trim() } : {}),
		}
		const before = $state.snapshot(this.visits) as Visit[]
		const undo = this.#commit(
			{
				apply: () => (this.visits = sortVisits([...this.visits, made])),
				revert: () => (this.visits = before),
				write: async () => {
					await applyBatch(visitOps(made, place.name))
					// said once the visit is kept; a signal that cannot be emitted fails nothing
					await emit('visit.logged', { place: place.name, day: made.day }, { dedupeKey: made.id }).catch(() => null)
				},
				unwrite: () => deleteRows([toUri(MEADOW.visit, made.id)]),
			},
			'garden.feed.visitLogged',
			{ name: place.name }
		)
		this.#afterSave()
		return { visit: made, undo }
	}

	removeVisit(id: string): { visit: Visit | undefined; undo: Undo } {
		const visit = this.visits.find((entry) => entry.id === id)
		if (!visit) return { visit, undo: () => {} }
		const before = $state.snapshot(this.visits) as Visit[]
		const uri = toUri(MEADOW.visit, id)
		const undo = this.#commit(
			{
				apply: () => (this.visits = this.visits.filter((entry) => entry.id !== id)),
				revert: () => (this.visits = before),
				write: () => deleteRows([uri]),
				unwrite: () => restoreRows([uri]),
			},
			'garden.feed.visitRemoved',
			{ name: this.placeById(visit.placeId)?.name ?? '' }
		)
		this.#afterSave()
		return { visit, undo }
	}

	// ---- Collections ---------------------------------------------------------------------------------------------

	addCollection(name: string, note?: string): { collection: Collection; undo: Undo } {
		const collection: Collection = {
			id: newId(),
			name: name.trim(),
			placeIds: [],
			...(note?.trim() ? { note: note.trim() } : {}),
		}
		const { id, ...payload } = collection
		const before = $state.snapshot(this.collections) as Collection[]
		const undo = this.#commit(
			{
				apply: () => (this.collections = [...this.collections, collection]),
				revert: () => (this.collections = before),
				write: () => applyBatch([{ op: 'createEntity', input: { id, type: MEADOW.collection, payload } }]),
				unwrite: () => deleteRows([toUri(MEADOW.collection, id)]),
			},
			'garden.feed.collectionAdded',
			{ name: collection.name }
		)
		return { collection, undo }
	}

	/** Writes a collection's fields as they are given: its name, its note, the places in it. */
	#collectionChanged(
		id: string,
		change: (collection: Collection) => Collection,
		feedKey?: string,
		values?: Record<string, string | number>
	): { collection: Collection | undefined; undo: Undo } {
		const before = this.collections.find((entry) => entry.id === id)
		if (!before) return { collection: before, undo: () => {} }
		const was = $state.snapshot(before) as Collection
		const after = change(was)
		const put = (next: Collection) =>
			(this.collections = this.collections.map((entry) => (entry.id === id ? next : entry)))
		const payload = ({ id: _id, ...rest }: Collection): CollectionPayload => rest
		const undo = this.#commit(
			{
				apply: () => put(after),
				revert: () => put(was),
				write: () => applyBatch([{ op: 'updateEntity', id, payload: payload(after) }]),
				unwrite: () => applyBatch([{ op: 'updateEntity', id, payload: payload(was) }]),
			},
			feedKey,
			values
		)
		return { collection: after, undo }
	}

	updateCollection(id: string, fields: { name: string; note?: string }) {
		return this.#collectionChanged(id, ({ note: _note, ...rest }) => ({
			...rest,
			name: fields.name.trim() || rest.name,
			...(fields.note?.trim() ? { note: fields.note.trim() } : {}),
		}))
	}

	/** Puts places in a collection; one already in it is not put twice. */
	addToCollection(id: string, placeIds: string[]) {
		const collection = this.collections.find((entry) => entry.id === id)
		const added = placeIds.filter((placeId) => !collection?.placeIds.includes(placeId) && this.placeById(placeId))
		if (!collection || !added.length) return { collection, added: 0, undo: () => {} }
		const result = this.#collectionChanged(
			id,
			(was) => ({ ...was, placeIds: [...was.placeIds, ...added] }),
			'garden.feed.collectionGrew',
			{ name: collection.name, count: added.length }
		)
		return { ...result, added: added.length }
	}

	removeFromCollection(id: string, placeId: string) {
		return this.#collectionChanged(id, (was) => ({
			...was,
			placeIds: was.placeIds.filter((entry) => entry !== placeId),
		}))
	}

	removeCollection(id: string): { collection: Collection | undefined; undo: Undo } {
		const collection = this.collections.find((entry) => entry.id === id)
		if (!collection) return { collection, undo: () => {} }
		const before = $state.snapshot(this.collections) as Collection[]
		const uri = toUri(MEADOW.collection, id)
		const undo = this.#commit(
			{
				apply: () => {
					this.collections = this.collections.filter((entry) => entry.id !== id)
					if (this.filter.collection === id) this.setFilter({ ...this.filter, collection: undefined })
				},
				revert: () => (this.collections = before),
				write: () => deleteRows([uri]),
				unwrite: () => restoreRows([uri]),
			},
			'garden.feed.collectionRemoved',
			{ name: collection.name }
		)
		return { collection, undo }
	}

	// ---- Custom vibes ----------------------------------------------------------------------------------------------

	/** Adds a vibe of the owner's own to a facet; one of the same name there is answered as it is. */
	addVibe(label: string, facet: Facet): { vibe: CustomVibe; undo: Undo } {
		const name = label.trim().slice(0, 40)
		const same = this.vibes.find((vibe) => vibe.facet === facet && vibe.label.toLowerCase() === name.toLowerCase())
		if (same) return { vibe: same, undo: () => {} }
		const vibe: CustomVibe = { id: newId(), label: name, facet }
		const before = $state.snapshot(this.vibes) as CustomVibe[]
		const undo = this.#commit({
			apply: () => (this.vibes = [...this.vibes, vibe]),
			revert: () => (this.vibes = before),
			write: () =>
				applyBatch([
					{ op: 'createEntity', input: { id: vibe.id, type: MEADOW.vibe, payload: { label: name, facet } } },
				]),
			unwrite: () => deleteRows([toUri(MEADOW.vibe, vibe.id)]),
		})
		return { vibe, undo }
	}

	// ---- Sample data -------------------------------------------------------------------------------------------------

	/** Fills the store from a sample dataset; the undo puts back whatever was there. */
	seed(sample: MeadowData, domainName: string): Undo {
		const before = this.data()
		const after = meadowRows(sample, newId)
		const remove = (uris: string[]): BatchOp[] => uris.map((uri) => ({ op: 'delete', uri }))
		const restore = (uris: string[]): BatchOp[] => uris.map((uri) => ({ op: 'restore', uri }))
		// a plain venue is another domain's place: it stays where it is
		const own = { ...before, places: before.places.filter((place) => place.profileId) }
		const plain = before.places.filter((place) => !place.profileId)
		const old = meadowUris(own)
		const fresh = meadowUris(after.data)
		const show = (data: MeadowData, extra: SavedPlace[] = []) => {
			this.places = this.#sorted([...data.places, ...extra])
			this.vibes = data.vibes
			this.collections = data.collections
			this.visits = data.visits
		}
		const undo = this.#commit(
			{
				apply: () => show(after.data, plain),
				revert: () => show(before),
				write: () => applyBatch([...remove(old), ...after.ops]),
				unwrite: () => applyBatch([...remove(fresh), ...restore(old)]),
			},
			'garden.feed.sampleAdded',
			{ domain: domainName }
		)
		this.#afterSave()
		return undo
	}

	// ---- The way every write goes --------------------------------------------------------------------------------

	#sorted(places: SavedPlace[]): SavedPlace[] {
		return [...places].sort((a, b) => a.name.localeCompare(b.name))
	}

	/** Shows the change, queues its write and records it; the undo shows the way back and queues that. */
	#commit(change: Change, feedKey?: string, values?: Record<string, string | number>): Undo {
		change.apply()
		this.#queue.enqueue(change.write)
		const forget = feedKey ? this.#shell.record(feedKey, values) : undefined
		return () => {
			change.revert()
			this.#queue.enqueue(change.unwrite)
			forget?.()
			this.#afterSave()
		}
	}

	/** Queues the favourite vibes to be worked out again, behind the write that changed what they come from. */
	#afterSave() {
		this.#queue.enqueue(() => this.#syncFavourites().catch(() => null))
	}

	/**
	 * `favorite-vibe` (product/domains/places.md, "Facts"): the facts Meadow derived are made to say what the saved
	 * places and the visits now say. The owner's own facts of the type are never read or changed here.
	 */
	async #syncFavourites() {
		const want = favouriteVibes(this.places, this.visits)
		const have = (await queryFacts({ types: [MEADOW.favoriteVibe] })).filter(
			(fact) => fact.provenance === 'domain-derived'
		)
		const { assert, update, remove } = favouriteChanges(want, have)
		for (const id of remove) await deleteFact(id)
		for (const { id, value } of update) await updateFact(id, { value, confidence: value.weight })
		for (const value of assert) {
			await assertFact({
				type: MEADOW.favoriteVibe,
				value,
				provenance: 'domain-derived',
				confidence: value.weight,
			})
		}
	}
}

export const meadow = new MeadowStore()
