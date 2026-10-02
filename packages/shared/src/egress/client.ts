// The egress ledger as the apps call it: the crate's commands under Tauri, the engine in a plain browser. Recording
// is fire-and-forget: a request that is leaving is not held up, and a ledger that cannot be written is not an error
// the caller sees (and never one that is logged over IPC, which would leave again).
import { call } from '../data/call.js'
import type { Destination, EgressQuery, EgressRow } from './types.js'

/**
 * Counts a request to the destination today, with the bytes it hands over. `requests` is how many the entry stands
 * for, where they are counted in batches (a map's tiles, D-131); one unless given.
 */
export function recordEgress(destination: Destination, bytesOut: number, requests = 1): void {
	void call('record_egress', { destination, bytesOut, requests }, (engine) =>
		engine.recordEgress(destination, bytesOut, requests)
	).catch(() => undefined)
}

/** The rows within the days asked for, the latest day first. */
export function queryEgress(filter: EgressQuery = {}): Promise<EgressRow[]> {
	return call('query_egress', { filter }, (engine) => engine.queryEgress(filter))
}
