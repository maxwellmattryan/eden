// The Gardener runtime as the apps call it: the crate's commands under Tauri, the engine in a plain browser for the
// stores, and nothing at all for the key and the stream, which only the app has (the key lives in the OS keychain
// and the request leaves from the crate). The egress ledger is the crate's to write on send; nothing here counts.
import { Channel, invoke } from '@tauri-apps/api/core'
import { isTauri } from '../api/tauri.js'
import { call } from '../data/call.js'
import { DataError } from '../data/errors.js'
import type {
	AuditEntry,
	AuditEntryInput,
	AuditQuery,
	GardenerEvent,
	GardenerRequest,
	Message,
	MessageInput,
	PolicyRow,
	Thread,
	ThreadInput,
	ThreadPatch,
	ThreadQuery,
} from './runtime-types.js'

const unavailable = () => new DataError('unavailable', 'the Gardener runs in the installed app')

// The key (`secret_store.rs`): per device, never in a table, never read back.

/** Keeps a secret under its name in the OS keychain, replacing what was there. */
export function setSecret(name: string, value: string): Promise<void> {
	if (!isTauri()) return Promise.reject(unavailable())
	return invoke<void>('set_secret', { name, value })
}

/** Whether a secret is kept under the name on this device. */
export function hasSecret(name: string): Promise<boolean> {
	if (!isTauri()) return Promise.resolve(false)
	return invoke<boolean>('has_secret', { name })
}

/** Forgets the secret. Answers whether there was one. */
export function deleteSecret(name: string): Promise<boolean> {
	if (!isTauri()) return Promise.reject(unavailable())
	return invoke<boolean>('delete_secret', { name })
}

// The stream.

export interface GardenerSend {
	/** Settles when the stream has ended, after the last event; rejects when the request could not be made. */
	done: Promise<void>
	/** Stops the request. Answers whether it was in flight. */
	cancel: () => Promise<boolean>
}

/** Sends one request and streams its events to `onEvent` as they arrive. */
export function gardenerSend(request: GardenerRequest, onEvent: (event: GardenerEvent) => void): GardenerSend {
	if (!isTauri()) return { done: Promise.reject(unavailable()), cancel: () => Promise.resolve(false) }
	const channel = new Channel<GardenerEvent>()
	channel.onmessage = onEvent
	return {
		done: invoke<void>('gardener_send', { request, onEvent: channel }),
		cancel: () => invoke<boolean>('gardener_cancel', { requestId: request.id }),
	}
}

// The audit log (`audit.rs`): this device's, never exported.

/** Keeps one entry, whole. */
export function recordAudit(entry: AuditEntryInput): Promise<AuditEntry> {
	return call('record_audit', { entry }, (engine) => engine.recordAudit(entry))
}

/** The entries within the filter, the newest first. */
export function queryAudit(filter: AuditQuery = {}): Promise<AuditEntry[]> {
	return call('query_audit', { filter }, (engine) => engine.queryAudit(filter))
}

/** Every row id any entry read, with how many entries read it. */
export function auditUsage(): Promise<Record<string, number>> {
	return call('audit_usage', {}, (engine) => engine.auditUsage())
}

/** What the entries at or after the instant cost, together, in USD. */
export function auditSpend(fromMs: number): Promise<number> {
	return call('audit_spend', { fromMs }, (engine) => engine.auditSpend(fromMs))
}

// Threads and messages (`threads.rs`).

export function createThread(input: ThreadInput): Promise<Thread> {
	return call('create_thread', { input }, (engine) => engine.createThread(input))
}

export function updateThread(id: string, patch: ThreadPatch): Promise<Thread> {
	return call('update_thread', { id, patch }, (engine) => engine.updateThread(id, patch))
}

/** Tombstones the thread and its live messages together. */
export function deleteThread(id: string): Promise<Thread> {
	return call('delete_thread', { id }, (engine) => engine.deleteThread(id))
}

/** Lifts the tombstone, and those of the messages deleted with it. */
export function restoreThread(id: string): Promise<Thread> {
	return call('restore_thread', { id }, (engine) => engine.restoreThread(id))
}

/** The threads, the latest updated first. */
export function queryThreads(filter: ThreadQuery = {}): Promise<Thread[]> {
	return call('query_threads', { filter }, (engine) => engine.queryThreads(filter))
}

export function appendMessage(input: MessageInput): Promise<Message> {
	return call('append_message', { input }, (engine) => engine.appendMessage(input))
}

/** Replaces the blocks whole, under a new stamp. */
export function updateMessage(id: string, blocks: unknown[]): Promise<Message> {
	return call('update_message', { id, blocks }, (engine) => engine.updateMessage(id, blocks))
}

/** The live messages of a thread, in the order they were made. */
export function queryMessages(threadId: string): Promise<Message[]> {
	return call('query_messages', { threadId }, (engine) => engine.queryMessages(threadId))
}

// Workspace policy (`policy.rs`, D-37).

export function getPolicy(key: string): Promise<PolicyRow | null> {
	return call('get_policy', { key }, (engine) => engine.getPolicy(key))
}

/** Sets the value under the key; the row is renewed in place. */
export function setPolicy(key: string, value: unknown): Promise<PolicyRow> {
	return call('set_policy', { key, value }, (engine) => engine.setPolicy(key, value))
}
