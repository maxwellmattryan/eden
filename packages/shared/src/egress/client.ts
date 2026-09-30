// The egress ledger as the apps call it: the crate's commands under Tauri, the engine in a plain browser. Recording
// is fire-and-forget: a request that is leaving is not held up, and a ledger that cannot be written is not an error
// the caller sees (and never one that is logged over IPC, which would leave again).
import { call } from '../data/call.js'
import type { Destination, EgressQuery, EgressRow } from './types.js'

/** Counts one request to the destination today, with the bytes it hands over. */
export function recordEgress(destination: Destination, bytesOut: number): void {
	void call('record_egress', { destination, bytesOut }, (engine) => engine.recordEgress(destination, bytesOut)).catch(
		() => undefined
	)
}

/** The rows within the days asked for, the latest day first. */
export function queryEgress(filter: EgressQuery = {}): Promise<EgressRow[]> {
	return call('query_egress', { filter }, (engine) => engine.queryEgress(filter))
}
