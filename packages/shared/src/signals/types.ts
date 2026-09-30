// The shapes of signals and the inbox (docs/product/substrate/signals-notifications.md; D-73), the same ones the
// crate keeps (`src-tauri/src/substrate/signals.rs`).
import type { NotificationChannel } from '../manifest/types.js'

/** The tier of what a signal names: the highest among its URIs. It decides what an OS notification may say. */
export type SignalTier = 'T0' | 'T1' | 'T2' | 'T3'
export const SIGNAL_TIERS: readonly SignalTier[] = ['T0', 'T1', 'T2', 'T3']

/** How long a signal, and the cards made of it, are kept. */
export const SIGNAL_RETENTION_DAYS = 30
/** A payload names things and carries a few fields, never a whole entity. */
export const MAX_PAYLOAD_BYTES = 4096
export const MAX_KEY_CHARS = 200

/** Who holds a device capability: this device, whoever asks on it. */
export const DEVICE = 'this-device'
/** The capability an OS notification needs (docs/product/substrate/grants.md). */
export const OS_NOTIFICATIONS = 'os-notifications'

/**
 * The substrate's own signals that are emitted, by the frontend from `@eden/shared/tasks` (D-75): only the names
 * the Tasks substrate emits are listed, since a name here compiles as one `emit` takes. The rest of the substrate's
 * list (`event.*`, `attachment.added`, `task.due`) waits on the changes seam and the issues that consume them.
 */
export const SUBSTRATE_SIGNALS = ['task.created', 'task.completed'] as const
export type SubstrateSignal = (typeof SUBSTRATE_SIGNALS)[number]

/** What a signal carries: the URIs of what it is about under `uris`, and a few fields for its rules and its words. */
export type SignalPayload = Record<string, unknown>

/** One rule's card for a signal: the rule is the domain and the notification kind, `weather.severe-alert`. */
export interface Delivery {
	rule: string
	channel: NotificationChannel
}

export interface SignalInput {
	/** The subject and what happened to it: `stock.expiring`. */
	name: string
	payload?: SignalPayload
	tier: SignalTier
	/** What makes this occurrence the same one if it is emitted again: an alert's id, a day. */
	dedupeKey?: string | null
	deliveries?: Delivery[]
}

export interface Signal {
	id: string
	name: string
	payload: SignalPayload
	tier: SignalTier
	dedupeKey: string | null
	createdAt: string
	/** When it was emitted, in milliseconds since the epoch. */
	at: number
}

/** A card with what it is made of: the signal's name, payload, tier and time. */
export interface InboxEntry {
	id: string
	signalId: string
	rule: string
	channel: NotificationChannel
	read: boolean
	name: string
	payload: SignalPayload
	tier: SignalTier
	at: number
}

export interface Emitted {
	signal: Signal
	deliveries: InboxEntry[]
}

export interface InboxQuery {
	unreadOnly?: boolean
	/** Fifty when it is left out, two hundred at most. */
	limit?: number
}
