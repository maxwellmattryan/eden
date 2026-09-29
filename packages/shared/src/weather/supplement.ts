// Filling a supplementary slot (D-59): the sources in order, the first that covers the place. Never rejects: a slot
// that could not be filled says why, and the forecast is untouched.
import type { HomePlace } from '../types/index.js'
import type { SupplementSlot } from './model.js'

interface Source<T> {
	name: string
	fetch(place: HomePlace): Promise<T | null>
}

export async function fillSlot<T>(
	sources: readonly Source<T>[],
	place: HomePlace,
	fetchedAt: string
): Promise<SupplementSlot<T>> {
	let failed: string | null = null
	for (const source of sources) {
		try {
			const data = await source.fetch(place)
			if (data !== null) return { source: source.name, fetchedAt, status: 'ok', data }
		} catch {
			failed ??= source.name
		}
	}
	return { source: failed, fetchedAt, status: failed ? 'failed' : 'unavailable', data: null }
}

/** Whether a slot wants filling again: never filled, older than its cache, or last time a source could not be reached. */
export function slotStale<T>(slot: SupplementSlot<T>, maxAgeMs: number, now: number): boolean {
	if (!slot.fetchedAt || slot.status === 'failed') return true
	return now - Date.parse(slot.fetchedAt) > maxAgeMs
}
