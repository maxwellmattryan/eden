// A request the webview makes itself, to one of the few hosts its CSP names: a GET for JSON that gives up after ten
// seconds, reads every failure as the source being out of reach, and is entered in the egress ledger as it leaves,
// answered or not (D-71). Sky's providers and Meadow's geocoder and hours source share it.
import { requestBytes } from './bytes.js'
import { recordEgress } from './client.js'
import type { Destination } from './types.js'

/** A source that could not be reached, or answered something that is not an answer. */
export class OfflineError extends Error {
	constructor(
		/** The source's name as it is written: "Open-Meteo". */
		readonly source: string,
		message = `${source} could not be reached`
	) {
		super(message)
		this.name = 'OfflineError'
	}
}

export const TIMEOUT_MS = 10_000

/**
 * A GET that gives up after ten seconds and reads every failure as the source being offline. The request is entered
 * in the egress ledger as it leaves, answered or not (D-71).
 */
export async function getJson<T>(
	source: string,
	destination: Destination,
	url: string,
	headers?: Record<string, string>
): Promise<T> {
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
	try {
		recordEgress(destination, requestBytes(url))
		const response = await fetch(url, { signal: controller.signal, headers })
		if (!response.ok) throw new OfflineError(source, `${source} answered ${response.status}`)
		return (await response.json()) as T
	} catch (error) {
		throw error instanceof OfflineError ? error : new OfflineError(source, String(error))
	} finally {
		clearTimeout(timer)
	}
}
