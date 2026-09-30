// The Gardener runtime's shapes (docs/product/substrate/ai.md), mirrored by hand from the crate
// (`src-tauri/src/substrate/{audit,threads,policy}.rs` and the `gardener_send` stream): what a request carries, what
// the stream answers, the audit entry, the threads and messages with their blocks, and the policy rows the owner's
// edits live in. Rows cross the IPC as camelCase JSON, stamped like any row and ended by a tombstone.
import type { GrantAccess } from '../grants/types.js'
import type { FactProposal } from '../profile/types.js'
import type { ModelOverrides, ProviderEdits } from './types.js'

/** The policy row the Gardener's own settings live under. */
export const POLICY_KEY = 'gardener'
/** The keychain name of the Anthropic key. Nothing ever returns its value. */
export const SECRET_NAME = 'anthropic-api-key'

export interface GardenerRequest {
	/** The audit entry's id (a ULID the frontend makes); the key of `gardener_cancel`. */
	id: string
	model: string
	maxTokens: number
	/** A string or the API's list of text blocks (with cache_control); passed through verbatim. */
	system: unknown
	messages: unknown[]
	tools: unknown[]
}

export type GardenerEvent =
	| { type: 'start'; messageId: string; model: string }
	| { type: 'text_delta'; text: string }
	| { type: 'tool_use'; id: string; name: string; input: unknown }
	| { type: 'usage'; input: number; output: number; cacheRead: number; cacheWrite: number }
	| { type: 'stop'; reason: string; refusal: string | null }
	| { type: 'error'; status: number | null; message: string }

export type ThreadTier = 'T0' | 'T1' | 'T2'

export interface Thread {
	uri: string
	id: string
	domain: string | null
	title: string
	/** The highest tier the thread read; a T2 thread is never packed again without a grant. */
	tier: ThreadTier
	createdAt: string
	updatedAt: string
	deletedAt: string | null
}

export interface ThreadInput {
	id?: string
	domain?: string | null
	title: string
	tier?: ThreadTier
}

export interface ThreadPatch {
	title?: string
	tier?: ThreadTier
	domain?: string | null
}

export interface ThreadQuery {
	domain?: string
	includeDeleted?: boolean
}

export type MessageRole = 'owner' | 'gardener'

export interface Message {
	uri: string
	id: string
	threadId: string
	role: MessageRole
	blocks: unknown[]
	/** The audit entry of the request that produced a Gardener message. */
	requestId: string | null
	createdAt: string
	updatedAt: string
	deletedAt: string | null
}

export interface MessageInput {
	id?: string
	threadId: string
	role: MessageRole
	blocks: unknown[]
	requestId?: string | null
}

export interface PolicyRow {
	key: string
	value: unknown
	createdAt: string
	updatedAt: string
	deletedAt: string | null
}

export type AuditOutcome =
	'ok' | 'refusal' | 'max-tokens' | 'error' | 'cancelled' | 'declined' | 'budget' | 'interrupted'

export interface AuditRead {
	id: string
	count: number
	/** The bare ids of the rows the pack held. */
	rows: string[]
}

export interface AuditTool {
	id: string
	access: 'read' | 'write-draft' | 'write' | 'act-external'
	confirm: 'confirmed' | 'cancelled' | null
}

/** An image is logged as its hash and dimensions, never the image (OQ-11). */
export interface AuditImage {
	hash: string
	width: number
	height: number
}

export interface AuditEntry {
	id: string
	/** Milliseconds since the epoch. */
	at: number
	surface: string
	threadId: string | null
	parentRequestId: string | null
	tool: string | null
	domain: string | null
	declaredGrade: 'light' | 'standard' | 'deep' | null
	grade: 'light' | 'standard' | 'deep' | null
	source: 'tool-override' | 'domain-override' | 'map' | null
	provider: string
	model: string
	reads: AuditRead[]
	entities: string[]
	tools: AuditTool[]
	confirmOutcome: 'confirmed' | 'cancelled' | null
	tokensIn: number
	tokensOut: number
	cacheRead: number
	costUsd: number
	outcome: AuditOutcome
	grants: string[]
	image: AuditImage | null
}

export type AuditEntryInput = Omit<AuditEntry, 'id'> & { id?: string }

export interface AuditQuery {
	threadId?: string
	fromMs?: number
	toMs?: number
	limit?: number
}

// The blocks of a message: what the panel renders and what the pack reads back as the thread. They are the
// frontend's shape alone; the crate keeps them as JSON.

export type ToolState = 'pending' | 'done' | 'cancelled'
export type DraftState = 'pending' | 'committed' | 'discarded'

/** What a `write-draft` tool offers; nothing is stored until the owner commits it. */
export type DraftCard =
	| { kind: 'task'; title: string; due?: string; timeOfDay?: string; priority?: 'low' | 'high'; notes?: string }
	| {
			kind: 'plan'
			title: string
			tasks: { title: string; due?: string; notes?: string }[]
			events: { kind: string; title: string; day: string }[]
			meals?: { day: string; meals: { name: string; recipeId?: string }[] }[]
			/** What the plan's shop day needs, for the grocery list. */
			grocery?: { name: string; qty: string }[]
			/** The project the tasks belong to, when they do. */
			projectId?: string
	  }
	| { kind: 'grocery'; items: { name: string; qty: string; note?: string }[] }
	| { kind: 'code'; language: string; code: string; title?: string }
	| {
			kind: 'capture'
			/** The recognised rows, as the capture sheet takes them (D-13). */
			rows: {
				id: string
				name: string
				qty: number | string
				unit?: string
				location: 'fridge' | 'freezer' | 'pantry' | 'counter'
				expiry?: string
				estimated?: boolean
				merge?: string
			}[]
			/** Where the photo is on this device, for the attachment a commit makes; never the image itself. */
			path?: string
	  }

export type MessageBlock =
	| { kind: 'text'; text: string }
	| {
			kind: 'tool'
			call: {
				id: string
				name: string
				domain: string
				tool: string
				access: GrantAccess
				input: unknown
				output?: unknown
				error?: string
			}
			state: ToolState
	  }
	| { kind: 'proposal'; proposal: FactProposal; state: 'pending' | 'accepted' | 'dismissed' }
	| { kind: 'draft'; draft: DraftCard; state: DraftState; domain?: string }
	| {
			kind: 'can-see'
			items: { id: string; count: number }[]
			locked: string[]
			trimmed: string[]
			rows: Record<string, string[]>
	  }
	| { kind: 'error'; code: string; message: string }

/** The owner's Gardener settings, the value of the `gardener` policy row: synced as workspace policy (D-37). */
export interface GardenerPolicy {
	provider: 'anthropic'
	edits: ProviderEdits
	overrides: ModelOverrides
	/** The monthly hard stop across providers, USD. */
	monthlyCapUsd: number
	/** The per-request token cap; the model's context size when null. */
	requestTokenCap: number | null
}
