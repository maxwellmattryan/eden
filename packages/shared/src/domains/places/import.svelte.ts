// A list of places being imported (product/domains/places.md, "Import"): the pasted text, then a row for each name,
// looked up one a second as the geocoder's terms ask, with the rows resolving as they come. A name found once is
// matched; one found several times waits for the owner to say which; one not found is placed by a click on the map.
// The Gardener may tag the rows with vibes, which is optional and marked as suggested. Nothing is stored until Save
// all, which is one write with one undo. The state is a class on the model of Hearth's capture, and its sheet is the
// domain's overlay, so a list handed over in a conversation opens it on whatever page is showing.
import { logError } from '../../api/index.js'
import { newId } from '../../data/index.js'
import { categoryFromOsm } from './categories.js'
import { instant } from './rows.js'
import { meadow } from './store.svelte.js'
import { parseNameList, type ImportName } from './import.js'
import { type PlaceDraft, type SavedPlace } from './types.js'
import { type SourceFailure } from './discovery.js'
import { addressFromHit } from '../../address/index.js'
import type { GeocodeHit, LngLat } from '../../geo/index.js'
import type { DirectPreview } from '../../shell/gardener/types.js'

export const IMPORT_PLACES = 'places.import-places'

export type ImportRowState = 'waiting' | 'looking' | 'matched' | 'ambiguous' | 'not-found' | 'saved'

export interface ImportRow extends ImportName {
	id: string
	state: ImportRowState
	/** What the geocoder found by the name, the likeliest first. */
	hits: GeocodeHit[]
	/** Which of them the row is, once there is one. */
	pick?: number
	/** Where the owner put it by hand, when nothing was found. */
	point?: LngLat
	/** The place it already is, when it is saved. */
	savedAs?: string
	vibes: string[]
	/** The vibes came from the Gardener and not from the owner. */
	suggested: boolean
	/** Left out of the save. */
	skipped: boolean
}

/** How close two hits may be and still be the one place, in degrees: about fifty metres. */
const SAME = 0.0005

export class PlacesImport {
	open = $state(false)
	phase = $state<'paste' | 'rows'>('paste')
	text = $state('')
	rows = $state<ImportRow[]>([])
	/** The names are being looked up, one at a time. */
	resolving = $state(false)
	/** The row the owner is placing by a click on the map; the sheet stands aside while it waits. */
	placing = $state<{ id: string; name: string }>()
	tagging = $state(false)
	tagged = $state(false)
	tagFailure = $state<SourceFailure>()
	/** Who would tag the rows and about what it would cost, or why it cannot be asked. */
	preview = $state<DirectPreview>()

	#run = 0

	/** The rows that would be saved: found or placed, and not left out. */
	readonly ready = $derived(
		this.rows.filter((row) => !row.skipped && (row.state === 'matched' || (row.state === 'not-found' && row.point)))
	)
	readonly looked = $derived(this.rows.filter((row) => row.state !== 'waiting' && row.state !== 'looking').length)

	/** Open the sheet blank, to paste a list. */
	start() {
		this.#reset()
		this.phase = 'paste'
		this.open = true
	}

	/** Open the sheet on names already read (a list handed over in a conversation), each with the vibes suggested. */
	begin(names: ImportName[], lang: string, vibes: string[][] = []) {
		this.#reset()
		this.#rows(names, vibes)
		this.open = true
		void this.#resolve(lang)
	}

	#reset() {
		this.#run += 1
		this.text = ''
		this.rows = []
		this.resolving = false
		this.placing = undefined
		this.tagging = false
		this.tagged = false
		this.tagFailure = undefined
	}

	#rows(names: ImportName[], vibes: string[][] = []) {
		this.rows = names.map((entry, i) => ({
			...entry,
			id: newId(),
			state: 'waiting',
			hits: [],
			vibes: vibes[i] ?? [],
			suggested: (vibes[i]?.length ?? 0) > 0,
			skipped: false,
		}))
		this.tagged = vibes.some((list) => list.length > 0)
		this.phase = 'rows'
	}

	/** Reads the pasted text into rows and begins to look them up. Nothing is sent but each name to the geocoder. */
	find(lang: string) {
		const names = parseNameList(this.text)
		if (!names.length) return
		this.#rows(names)
		void this.#resolve(lang)
		void this.refresh()
	}

	/** Looks each name up in turn; the geocoder is asked one name a second, so the rows resolve as they come. */
	async #resolve(lang: string) {
		const run = ++this.#run
		this.resolving = true
		await meadow.load()
		for (const row of this.rows) {
			if (run !== this.#run) return
			const at = () => this.rows.find((entry) => entry.id === row.id)
			const known = meadow.places.find((place) => place.name.toLowerCase() === row.name.toLowerCase())
			if (known) {
				this.#set(row.id, { state: 'saved', savedAs: known.id })
				continue
			}
			this.#set(row.id, { state: 'looking' })
			let hits: GeocodeHit[] = []
			try {
				hits = await meadow.geocode(row.name, lang)
			} catch (error) {
				void logError('places', 'A name could not be looked up', String(error)).catch(() => null)
			}
			if (run !== this.#run || !at()) return
			const saved = hits.map((hit) => meadow.placeBySource('osm', hit.externalId)).find(Boolean)
			if (saved) {
				this.#set(row.id, { state: 'saved', savedAs: saved.id, hits })
				continue
			}
			// answers a few metres apart are the one place, mapped twice
			const distinct = hits.filter(
				(hit, i) =>
					hits.findIndex(
						(other) =>
							Math.abs(other.point.lat - hit.point.lat) < SAME && Math.abs(other.point.lng - hit.point.lng) < SAME
					) === i
			)
			if (!distinct.length) this.#set(row.id, { state: 'not-found', hits: [] })
			else if (distinct.length === 1) this.#set(row.id, { state: 'matched', hits: distinct, pick: 0 })
			else this.#set(row.id, { state: 'ambiguous', hits: distinct.slice(0, 4) })
		}
		if (run === this.#run) this.resolving = false
	}

	#set(id: string, change: Partial<ImportRow>) {
		this.rows = this.rows.map((row) => (row.id === id ? { ...row, ...change } : row))
	}

	/** The owner says which of the places found a row is. */
	choose(id: string, pick: number) {
		this.#set(id, { state: 'matched', pick })
	}
	skip(id: string, skipped: boolean) {
		this.#set(id, { skipped })
	}
	toggleVibe(id: string, vibe: string) {
		const row = this.rows.find((entry) => entry.id === id)
		if (!row) return
		const vibes = row.vibes.includes(vibe) ? row.vibes.filter((entry) => entry !== vibe) : [...row.vibes, vibe]
		this.#set(id, { vibes })
	}

	/** Stands the sheet aside so the owner can click the map where a place is. */
	placeByHand(id: string) {
		const row = this.rows.find((entry) => entry.id === id)
		if (!row) return
		this.placing = { id, name: row.name }
		this.open = false
	}
	/** The click on the map, or its Cancel: the sheet comes back either way. */
	placed(point: LngLat | undefined) {
		const placing = this.placing
		this.placing = undefined
		if (placing && point) this.#set(placing.id, { point })
		this.open = true
	}

	/** Works out who would tag the rows and what it would cost; nothing is sent. */
	async refresh(): Promise<void> {
		try {
			const { runtime } = await import('../../shell/gardener/runtime.svelte.js')
			this.preview = await runtime.previewDirect(IMPORT_PLACES, { names: this.#lines() })
		} catch {
			this.preview = { unavailable: 'unavailable' }
		}
	}

	#lines(): string[] {
		return this.rows.map((row) => (row.note ? `${row.name} — ${row.note}` : row.name))
	}

	/** Asks the Gardener to tag the rows with vibes: one request, no search. Pressing the button is the consent. */
	async tag(): Promise<void> {
		if (this.tagging || !this.rows.length) return
		this.tagging = true
		this.tagFailure = undefined
		try {
			const { runtime } = await import('../../shell/gardener/runtime.svelte.js')
			const result = await runtime.runDirect(IMPORT_PLACES, { names: this.#lines() }, { confirmed: true })
			const tags = (result.output as { tagged?: string[][] } | null)?.tagged
			if (result.failure || !Array.isArray(tags)) {
				if (result.failure !== 'cancelled') this.tagFailure = (result.failure as SourceFailure) ?? 'network'
				return
			}
			this.rows = this.rows.map((row, i) => {
				const vibes = tags[i] ?? []
				// what the owner chose stands; the Gardener's are added and marked
				const added = vibes.filter((vibe) => !row.vibes.includes(vibe))
				return vibes.length ? { ...row, vibes: [...row.vibes, ...added], suggested: true } : row
			})
			this.tagged = true
		} catch (error) {
			this.tagFailure = 'network'
			void logError('gardener', 'Tagging an import failed', String(error)).catch(() => null)
		} finally {
			this.tagging = false
		}
	}

	/** A row as the place it becomes. */
	#draft(row: ImportRow): PlaceDraft {
		const hit = row.pick === undefined ? undefined : row.hits[row.pick]
		const at = instant()
		return {
			name: hit?.name ?? row.name,
			category: categoryFromOsm(hit?.kind),
			point: hit?.point ?? row.point,
			vibes: [...row.vibes],
			...(row.note ? { notes: row.note } : {}),
			...(hit && addressFromHit(hit) ? { address: addressFromHit(hit) } : {}),
			...(hit?.locality ? { locality: hit.locality } : {}),
			providerIds: hit ? { osm: hit.externalId } : {},
			savedFrom: { via: 'import', at },
		}
	}

	/** Saves every row that is found or placed, as one change with one undo, and closes the sheet. */
	save(): { places: SavedPlace[]; undo: () => void } {
		const result = meadow.addPlaces(this.ready.map((row) => this.#draft(row)))
		this.open = false
		this.#reset()
		return result
	}

	close() {
		this.open = false
		this.#reset()
	}
}

export const placesImport = new PlacesImport()
