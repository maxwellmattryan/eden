// The refresh coordinator (docs/engineering/signals.md, "The refresh coordinator"; D-73): what decides when a mirror
// is fetched again, by who needs it. A resource is refreshed on its short interval while a view or a widget reads it
// and the window is seen; when its schedule fires, seen or not, if it has one, which is its background reason to stay
// fresh; and not at all otherwise. The scheduler owns the clock for what must happen unobserved, since a timer in a
// hidden webview is slowed or stopped; the coordinator owns freshness for what is on screen, where a late check costs
// nothing because a return to the window checks again.

export interface Refreshable {
	id: string
	/** Fetches it again. A failure is the resource's own to show; here it is only reported. */
	refresh: () => Promise<void>
	/** How long ago it was last fetched, in milliseconds; `Infinity` when it never was. */
	age: () => number
	/** While something reads it and the window is seen, it is refreshed once it is this old. */
	foreground?: number
	/** The schedule that refreshes it whether or not anything reads it. */
	schedule?: string
}

export interface Coordinator {
	/** Makes a resource known; the answer takes it away. One that is already read and due is refreshed at once. */
	register(resource: Refreshable): () => void
	/** A view or a widget starts reading a resource, which is refreshed at once when it is due; the answer stops. */
	watch(id: string): () => void
	/** Refreshes what is read and due. Nothing is due while the window is not seen. */
	check(visible: boolean): Promise<void>
	/** Refreshes what is bound to a schedule that fired, read or not, seen or not. */
	fired(schedule: string): Promise<void>
	/** Refreshes one resource now; a call while it is already being fetched joins that fetch. */
	refresh(id: string): Promise<void>
}

export function createCoordinator(onError: (id: string, error: unknown) => void = () => {}): Coordinator {
	const resources = new Map<string, Refreshable>()
	const readers = new Map<string, number>()
	const fetching = new Map<string, Promise<void>>()

	const due = (resource: Refreshable) =>
		resource.foreground !== undefined && (readers.get(resource.id) ?? 0) > 0 && resource.age() >= resource.foreground

	function refresh(id: string): Promise<void> {
		const resource = resources.get(id)
		if (!resource) return Promise.resolve()
		let running = fetching.get(id)
		if (!running) {
			running = (async () => {
				try {
					await resource.refresh()
				} catch (error) {
					onError(id, error)
				} finally {
					fetching.delete(id)
				}
			})()
			fetching.set(id, running)
		}
		return running
	}

	const all = (chosen: Refreshable[]) => Promise.all(chosen.map((resource) => refresh(resource.id))).then(() => {})

	return {
		register(resource) {
			resources.set(resource.id, resource)
			if (due(resource)) void refresh(resource.id)
			return () => {
				if (resources.get(resource.id) === resource) resources.delete(resource.id)
			}
		},
		watch(id) {
			readers.set(id, (readers.get(id) ?? 0) + 1)
			const resource = resources.get(id)
			if (resource && due(resource)) void refresh(id)
			let released = false
			return () => {
				if (released) return
				released = true
				readers.set(id, Math.max(0, (readers.get(id) ?? 0) - 1))
			}
		},
		check(visible) {
			return visible ? all([...resources.values()].filter(due)) : Promise.resolve()
		},
		fired(schedule) {
			return all([...resources.values()].filter((resource) => resource.schedule === schedule))
		},
		refresh,
	}
}
