// The one-time import of a domain's old document. Before the data layer a store kept everything in one JSON document
// (`../persistence`); when the store moves onto rows, what the owner had is brought over once and the document is
// removed.
import { read, remove } from '../persistence/index.js'
import { applyBatch } from './client.js'
import type { BatchOp } from './types.js'

/**
 * Brings the domain's old document into the data layer, once. The rows and the marker that says so are written in
 * one transaction, and the document is removed only after it: if anything fails before, nothing was written, the
 * document is still there and the next launch tries again. With no document the marker is still set, so there is
 * nothing to look for next time.
 */
export async function importLegacyDocument<T>(domain: string, toOps: (data: T) => BatchOp[]): Promise<void> {
	const document = await read<T>(domain)
	await applyBatch(document ? toOps(document.data) : [], `legacy-import:${domain}`)
	if (document) await remove(domain)
}
