// The home (D-38, D-141): the one Place of kind `home`, read once and held for Sky, Meadow, the profile and
// Settings alike. Until the owner chooses one it is the sample home, in memory only. Whoever starts the app binds
// `changed`, so what follows a move (the `home-area` fact, the forecast) happens in one place.
import { createPlace, deleteRows, queryPlaces, updatePlace } from '../data/client.js'
import { logError } from '../api/diagnostics.js'
import { clearLegacyHome, readLegacyHome } from '../settings/settings.svelte.js'
import { DEFAULT_HOME } from '../types/index.js'
import { draftOf, homeFromRow, homeInput, homePatch, resolveHome, type Home, type HomeDraft } from './rows.js'

export class HomeStore {
	current = $state<Home>(DEFAULT_HOME)
	ready = $state(false)
	/** Whether the owner has chosen a home: the sample has no row. */
	readonly chosen = $derived(this.current.id !== undefined)

	#reading: Promise<void> | null = null
	#changed: ((home: Home, moved: boolean) => void) | null = null

	/** What happens after the home is read, and after it is set or put back (`moved`). */
	bind(hooks: { changed: (home: Home, moved: boolean) => void }) {
		this.#changed = hooks.changed
	}

	#put(next: Home, moved: boolean) {
		this.current = next
		this.#changed?.($state.snapshot(next) as Home, moved)
	}

	#read(): Promise<void> {
		return (this.#reading ??= resolveHome({
			query: () => queryPlaces({ kinds: ['home'] }),
			create: createPlace,
			legacy: readLegacyHome,
			clear: clearLegacyHome,
		})
			.then((found) => this.#put(found ?? DEFAULT_HOME, false))
			// a home that cannot be read is the sample for this session, and the reason is in the log
			.catch((error: unknown) => logError('home', 'Could not read the home', String(error)).catch(() => null))
			.then(() => {
				this.ready = true
			}))
	}

	/** Reads the home once; everything that needs it awaits this. */
	load(): Promise<void> {
		return this.#read()
	}

	/** Reads it again, after an import replaced the rows. */
	reload(): Promise<void> {
		this.#reading = null
		return this.#read()
	}

	/** Changes the home, or chooses the first one: one write, and an undo that puts back what was. */
	async set(draft: HomeDraft): Promise<{ undo: () => Promise<void> }> {
		await this.#read()
		const was = $state.snapshot(this.current) as Home
		const row = was.id ? await updatePlace(was.id, homePatch(draft)) : await createPlace(homeInput(draft))
		const next = homeFromRow(row)
		if (next) this.#put(next, true)
		return {
			undo: async () => {
				if (was.id) {
					const back = homeFromRow(await updatePlace(was.id, homePatch(draftOf(was))))
					if (back) this.#put(back, true)
				} else {
					await deleteRows([row.uri])
					this.#put(DEFAULT_HOME, true)
				}
			},
		}
	}
}

export const home = new HomeStore()
