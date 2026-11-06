// The call into the crate's document reader (D-190): the file's bytes cross as the raw body of `read_document` and its
// type in a header, so megabytes never cross as a JSON array, and the text comes back already masked. The browser
// build has no reader and answers `unavailable`.
import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '../../api/tauri.js'
import type { DocumentOutcome } from './reader.js'

/** Reads one document on this device. */
export async function readDocument(bytes: Uint8Array, mime: string): Promise<DocumentOutcome> {
	if (!isTauri()) return { outcome: 'failed', reason: 'unavailable' }
	return invoke<DocumentOutcome>('read_document', bytes, { headers: { 'x-eden-mime': mime } })
}

/** The SHA-256 of the file's bytes, as hex: how a document read before is known (D-189). */
export async function fingerprint(bytes: Uint8Array): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
