// The Garden's own store: the activity feed (product/substrate/signals-notifications.md), which every domain write
// appends to. Entries hold a locale key and its values rather than a sentence, so the feed reads in whichever locale
// is current. Persisted as the `garden` document.
import { load, save } from '@eden/shared/persistence'
import { nowIso } from '@eden/shared/dates'

export interface FeedEntry {
	id: string
	/** The plain domain id, for the glyph. */
	domain: string
	/** The locale key of the line, under `garden.feed`. */
	key: string
	values?: Record<string, string | number>
	/** When it happened, as an ISO timestamp. */
	at: string
}

interface GardenData {
	feed: FeedEntry[]
}

const DOCUMENT = 'garden'
const VERSION = 1
/** The feed keeps the last fifty entries. */
const FEED_CAP = 50

export class GardenStore {
	/** True once the persisted document has been read. */
	ready = $state(false)
	feed = $state<FeedEntry[]>([])

	#loading: Promise<void> | null = null

	/** Reads the persisted feed once; every later call returns the same promise, so a write never races the read. */
	load(): Promise<void> {
		this.#loading ??= load<GardenData>(DOCUMENT).then((document) => {
			if (document?.data?.feed) this.feed = document.data.feed
			this.ready = true
		})
		return this.#loading
	}

	/** Appends an entry to the feed (after the feed has loaded) and persists it; returns the entry for `forget`. */
	record(domain: string, key: string, values?: Record<string, string | number>): FeedEntry {
		const entry: FeedEntry = { id: crypto.randomUUID(), domain, key, values, at: nowIso() }
		void this.load().then(() => {
			this.feed = [entry, ...this.feed].slice(0, FEED_CAP)
			return this.save()
		})
		return entry
	}

	/** Drops an entry, for an undone write. */
	forget(id: string) {
		void this.load().then(() => {
			this.feed = this.feed.filter((entry) => entry.id !== id)
			return this.save()
		})
	}

	private save() {
		return save<GardenData>(DOCUMENT, { version: VERSION, data: { feed: $state.snapshot(this.feed) } }).catch(
			() => null
		)
	}
}

export const garden = new GardenStore()
