// The requests that have been sent and have not settled, kept on this device (docs/engineering/gardener.md, "The
// audit log"). An audit entry is written once its request has ended, so a request cut off by the app closing would
// leave none and its cost would be missing from the month's spend. Each request's entry is kept here from the moment
// it is sent, with the outcome `interrupted`, and taken away when the real one is written; what is still here when
// the app starts is what was cut off, and is recorded as it stands. The audit log is this device's, so this is too.
import type { AuditEntryInput } from './runtime-types.js'

export const OPEN_REQUESTS_KEY = 'eden:gardener-open'

type Stored = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
type Counted = Pick<AuditEntryInput, 'tokensIn' | 'tokensOut' | 'cacheRead' | 'cacheWrite' | 'costUsd'>

export interface OpenRequests {
	/** Keeps a request's entry from the moment it is sent, as interrupted until it settles. */
	open(entry: AuditEntryInput): void
	/** What the provider has reported so far. */
	count(id: string, counted: Counted): void
	/** The request settled: its own entry is the log's now. */
	close(id: string): void
	/** Every entry still open, taken away: the caller records them. */
	take(): AuditEntryInput[]
}

/** Over `localStorage` in the app; a storage that is missing or throws keeps nothing, and nothing breaks. */
export function openRequests(storage: () => Stored | undefined): OpenRequests {
	const read = (): Record<string, AuditEntryInput> => {
		try {
			const parsed: unknown = JSON.parse(storage()?.getItem(OPEN_REQUESTS_KEY) ?? '{}')
			return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
				? (parsed as Record<string, AuditEntryInput>)
				: {}
		} catch {
			return {}
		}
	}
	const write = (entries: Record<string, AuditEntryInput>) => {
		try {
			if (Object.keys(entries).length) storage()?.setItem(OPEN_REQUESTS_KEY, JSON.stringify(entries))
			else storage()?.removeItem(OPEN_REQUESTS_KEY)
		} catch {
			// no storage: a request cut off leaves no entry, as before
		}
	}
	return {
		open(entry) {
			if (!entry.id) return
			write({ ...read(), [entry.id]: { ...entry, outcome: 'interrupted' } })
		},
		count(id, counted) {
			const entries = read()
			const entry = entries[id]
			if (!entry) return
			write({ ...entries, [id]: { ...entry, ...counted } })
		},
		close(id) {
			const entries = read()
			if (!(id in entries)) return
			delete entries[id]
			write(entries)
		},
		take() {
			const entries = Object.values(read())
			if (entries.length) write({})
			return entries
		},
	}
}
