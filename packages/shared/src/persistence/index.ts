// The document store: a JSON document per domain, read and written whole, for what stays on this device and out of
// every export (the Garden's feed until it moves onto signals, Sky's mirror). The owner's data lives in the data layer
// (`@eden/shared/data`). Under Tauri the crate keeps a document at <app data dir>/domains/<id>.json
// (`src-tauri/src/domains/documents.rs`); in a plain browser (`yarn dev:web`) it lives in localStorage under
// `documentKey(id)`. The store owns the document's shape and bumps `version` when it changes.
import { invoke } from '@tauri-apps/api/core'
import { logError } from '../api/diagnostics.js'
import { isTauri } from '../api/tauri.js'

/** A domain's persisted document: the store's own data behind a version it can migrate from. */
export interface DomainDocument<T> {
	version: number
	data: T
}

/** The localStorage key of a domain's document when the app runs outside Tauri. */
export const documentKey = (domain: string) => `eden:domain:${domain}`

function isDocument<T>(value: unknown): value is DomainDocument<T> {
	return typeof value === 'object' && value !== null && typeof (value as DomainDocument<T>).version === 'number'
}

/**
 * The domain's document, or null when there is none. Rejects when there is one and it cannot be read: what imports a
 * document must tell "nothing to bring over" from "could not look".
 */
export async function read<T>(domain: string): Promise<DomainDocument<T> | null> {
	let value: unknown = null
	if (isTauri()) {
		value = await invoke<unknown>('load_domain_document', { domain })
	} else if (typeof localStorage !== 'undefined') {
		const raw = localStorage.getItem(documentKey(domain))
		value = raw ? JSON.parse(raw) : null
	}
	if (value === null) return null
	if (!isDocument<T>(value)) throw new Error(`The ${domain} document is not a document`)
	return value
}

/** The domain's document, or null when there is none yet or it cannot be read; never throws. */
export async function load<T>(domain: string): Promise<DomainDocument<T> | null> {
	try {
		return await read<T>(domain)
	} catch (error) {
		await logError('persistence', `Could not load the ${domain} document`, String(error)).catch(() => null)
		return null
	}
}

/** Replaces the domain's document; rejects when nothing could be written, so the caller can say so. */
export async function save<T>(domain: string, document: DomainDocument<T>): Promise<void> {
	if (isTauri()) return invoke<void>('save_domain_document', { domain, document })
	if (typeof localStorage === 'undefined') throw new Error('No storage is available in this environment')
	localStorage.setItem(documentKey(domain), JSON.stringify(document))
}

/** Removes the domain's document; one that is not there is no error. */
export async function remove(domain: string): Promise<void> {
	if (isTauri()) return invoke<void>('remove_domain_document', { domain })
	if (typeof localStorage !== 'undefined') localStorage.removeItem(documentKey(domain))
}
