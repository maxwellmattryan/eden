// Signals and the inbox as the apps call them: the crate's commands under Tauri, the engine in a plain browser.
import { call } from '../data/call.js'
import { DataError } from '../data/errors.js'
import { validateSignal } from './rules.js'
import type { Emitted, InboxEntry, InboxQuery, SignalInput } from './types.js'

/**
 * Keeps a signal with the cards its rules ask for. A signal whose key was already emitted under the same name
 * changes nothing and answers `null`.
 */
export function emitSignal(input: SignalInput): Promise<Emitted | null> {
	const refusal = validateSignal(input)
	if (refusal) return Promise.reject(new DataError(refusal[0], refusal[1]))
	return call('emit_signal', { input }, (engine) => engine.emitSignal(input))
}

/** The cards behind the bell, the latest first. */
export function queryInbox(filter: InboxQuery = {}): Promise<InboxEntry[]> {
	return call('query_inbox', { filter }, (engine) => engine.queryInbox(filter))
}

/** Marks the cards as read. Answers how many were unread. */
export function markInboxRead(ids: string[]): Promise<number> {
	return call('mark_inbox_read', { ids }, (engine) => engine.markInboxRead(ids))
}

/**
 * Shows an OS notification with the words written for a card. Answers whether it was handed to the system: not while
 * the capability is off on this device, and never in a plain browser.
 */
export function showNotification(title: string, body: string): Promise<boolean> {
	return call('show_notification', { title, body }, () => false)
}
