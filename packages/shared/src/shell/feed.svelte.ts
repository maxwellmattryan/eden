// The activity feed (product/substrate/signals-notifications.md), which every domain write appends to and the Garden
// shows. It is the shell's, so a domain may import it: a domain never imports another domain. Entries hold a locale
// key and its values rather than a sentence, so the feed reads in whichever locale is current. Persisted as the
// `garden` document, the name it had when the Garden kept it.
import { load, save } from '../persistence/index.js'
import { nowIso } from '../dates/index.js'

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

interface FeedData {
	feed: FeedEntry[]
}

const DOCUMENT = 'garden'
const VERSION = 1
/** The feed keeps the last fifty entries. */
const FEED_CAP = 50

export class FeedStore {
	/** True once the persisted document has been read. */
	ready = $state(false)
	/** The newest first. */
	entries = $state<FeedEntry[]>([])

	#loading: Promise<void> | null = null

	/** Reads the persisted feed once; every later call returns the same promise, so a write never races the read. */
	load(): Promise<void> {
		this.#loading ??= load<FeedData>(DOCUMENT).then((document) => {
			if (document?.data?.feed) this.entries = document.data.feed
			this.ready = true
		})
		return this.#loading
	}

	/** Appends an entry to the feed (after the feed has loaded) and persists it; returns the entry for `forget`. */
	record(domain: string, key: string, values?: Record<string, string | number>): FeedEntry {
		const entry: FeedEntry = { id: crypto.randomUUID(), domain, key, values, at: nowIso() }
		void this.load().then(() => {
			this.entries = [entry, ...this.entries].slice(0, FEED_CAP)
			return this.save()
		})
		return entry
	}

	/** Drops an entry, for an undone write. */
	forget(id: string) {
		void this.load().then(() => {
			this.entries = this.entries.filter((entry) => entry.id !== id)
			return this.save()
		})
	}

	private save() {
		return save<FeedData>(DOCUMENT, { version: VERSION, data: { feed: $state.snapshot(this.entries) } }).catch(
			() => null
		)
	}
}

export const feed = new FeedStore()
