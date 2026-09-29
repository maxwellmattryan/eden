// The one narrow adapter every domain store persists through: a JSON document per domain, read and written whole.
// Under Tauri the crate keeps it at <app data dir>/domains/<id>.json (`src-tauri/src/domains/documents.rs`); in a
// plain browser (`yarn dev:web`) it lives in localStorage under `documentKey(id)`. The store owns the document's shape
// and bumps `version` when it changes. The data layer (docs/product/substrate/data.md) replaces this module alone: the
// stores keep calling `load` and `save`.
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

/** The domain's document, or null when there is none yet or it cannot be read; never throws. */
export async function load<T>(domain: string): Promise<DomainDocument<T> | null> {
	try {
		let value: unknown = null
		if (isTauri()) {
			value = await invoke<unknown>('load_domain_document', { domain })
		} else if (typeof localStorage !== 'undefined') {
			const raw = localStorage.getItem(documentKey(domain))
			value = raw ? JSON.parse(raw) : null
		}
		return isDocument<T>(value) ? value : null
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
