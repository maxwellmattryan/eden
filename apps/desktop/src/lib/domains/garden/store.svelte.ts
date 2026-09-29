// The Garden's own store: the activity feed (product/substrate/signals-notifications.md), which every domain write
// appends to. Entries hold a locale key and its values rather than a sentence, so the feed reads in whichever locale
// is current. Persisted as the `garden` document.
import { load, save } from '@eden/shared/persistence'
import { nowIso } from '../dates.js'

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

	async load() {
		const document = await load<GardenData>(DOCUMENT)
		if (document?.data?.feed) this.feed = document.data.feed
		this.ready = true
	}

	/** Appends an entry to the feed and persists it. */
	record(domain: string, key: string, values?: Record<string, string | number>) {
		const entry: FeedEntry = { id: crypto.randomUUID(), domain, key, values, at: nowIso() }
		this.feed = [entry, ...this.feed].slice(0, FEED_CAP)
		void this.save()
	}

	/** Drops an entry, for an undone write. */
	forget(id: string) {
		this.feed = this.feed.filter((entry) => entry.id !== id)
		void this.save()
	}

	private save() {
		return save<GardenData>(DOCUMENT, { version: VERSION, data: { feed: $state.snapshot(this.feed) } }).catch(
			() => null
		)
	}
}

export const garden = new GardenStore()
