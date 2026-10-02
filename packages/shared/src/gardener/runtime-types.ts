// The Gardener runtime's shapes (docs/product/substrate/ai.md), mirrored by hand from the crate
// (`src-tauri/src/substrate/{audit,threads,policy}.rs` and the `gardener_send` stream): what a request carries, what
// the stream answers, the audit entry, the threads and messages with their blocks, and the policy rows the owner's
// edits live in. Rows cross the IPC as camelCase JSON, stamped like any row and ended by a tombstone.
import type { GrantAccess } from '../grants/types.js'
import type { FactProposal } from '../profile/types.js'
import type { DraftTask } from '../tasks/draft.js'
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
	/** The tools as the API is given them: Eden's own, and any the provider runs itself (web search, D-132). */
	tools: unknown[]
	/** A JSON schema the reply is held to (the API's structured output), for a delegated request a handler parses. */
	outputFormat?: unknown
}

export type GardenerEvent =
	| { type: 'start'; messageId: string; model: string }
	| { type: 'text_delta'; text: string }
	| { type: 'tool_use'; id: string; name: string; input: unknown }
	/** One whole reasoning block as the API sent it, to be sent back unchanged while its request continues. */
	| { type: 'thinking'; block: unknown }
	/**
	 * One block of a tool the provider ran on its own side (D-132), whole: the call with its input, or its result as
	 * the addresses and titles it returned, or its error code.
	 */
	| { type: 'server_block'; block: ServerBlock }
	/** `searches` is how many web searches the provider ran; it comes with the closing usage, and is absent before. */
	| { type: 'usage'; input: number; output: number; cacheRead: number; cacheWrite: number; searches?: number }
	| { type: 'stop'; reason: string; refusal: string | null }
	| { type: 'error'; status: number | null; message: string }

/** A server tool's block as the crate hands it over. */
export type ServerBlock =
	| { type: 'server_tool_use'; id: string; name: string; input: Record<string, unknown> }
	| { type: string; toolUseId: string; results: { url: string; title: string }[]; error: string | null }

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

/** A file attached to the owner's message is logged as its hash, type, size and dimensions, never its bytes (D-83). */
export interface AuditAttachment {
	hash: string
	mime: string
	size: number
	width?: number
	height?: number
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
	/** What the owner attached, as this request sent it: the message's files and the earlier ones still in the pack. */
	attachments: AuditAttachment[]
	/** The input the provider wrote to its cache, priced at its own rate (D-116). */
	cacheWrite: number
}

export type AuditEntryInput = Omit<AuditEntry, 'id' | 'attachments' | 'cacheWrite'> & {
	id?: string
	attachments?: AuditAttachment[]
	cacheWrite?: number
	/** The owner's day the request was made on, `YYYY-MM-DD`, for the usage rollup (D-115); the device's when left out. */
	day?: string
}

export interface AuditQuery {
	threadId?: string
	fromMs?: number
	toMs?: number
	limit?: number
}

export type AuditGrade = 'light' | 'standard' | 'deep'

/** What a request was: a turn of a conversation, a tool a conversation ran, or a tool a page ran (D-86). */
export type SurfaceKind = 'conversation' | 'tool' | 'page'

/** The column a page of the log is sorted by. */
export type AuditOrder = 'at' | 'tool' | 'grade' | 'model' | 'tokens-in' | 'tokens-out' | 'cost' | 'outcome'

/** One page of the log's table: what to keep, how to sort it, and which rows of the result (D-114). */
export interface AuditPageQuery {
	threadId?: string
	fromMs?: number
	toMs?: number
	kinds?: SurfaceKind[]
	/** Tools as `<domain or substrate>.<id>`. */
	tools?: string[]
	grades?: AuditGrade[]
	models?: string[]
	outcomes?: AuditOutcome[]
	/** A row id: only the entries that read it. */
	readRow?: string
	/** `at` when left out. */
	order?: AuditOrder
	/** The latest, the dearest first; so when left out. */
	descending?: boolean
	/** Fifty when left out, two hundred at most. */
	limit?: number
	offset?: number
}

export interface AuditPage {
	rows: AuditEntry[]
	/** How many entries the filters keep, whatever the page. */
	total: number
}

/** What the log holds that a filter may name. */
export interface AuditFacets {
	models: string[]
	/** Tools as `<domain or substrate>.<id>`. */
	tools: string[]
}

/** What one conversation's requests came to, over the entries the log still holds. */
export interface ThreadUsage {
	threadId: string
	requests: number
	tokensIn: number
	tokensOut: number
	costUsd: number
	lastAt: number
}

// The usage rollup (`usage.rs`, D-115): the log's sums by day, kept past the log's ninety days.

export interface UsageSums {
	requests: number
	tokensIn: number
	tokensOut: number
	cacheRead: number
	cacheWrite: number
	costUsd: number
}

/** One day's requests of one model at one grade, of one kind and tool; '' where the requests had no such thing. */
export interface UsageDay extends UsageSums {
	day: string
	provider: string
	model: string
	grade: AuditGrade | ''
	kind: SurfaceKind
	domain: string
	tool: string
}

export type UsageSpan = 'day' | 'week' | 'month' | 'year'
export type UsageGroup = UsageSpan | 'provider' | 'model' | 'grade' | 'kind' | 'domain' | 'tool'

export interface UsageQuery {
	/** The earliest day, inclusive, `YYYY-MM-DD`. */
	fromDay?: string
	/** The latest day, inclusive. */
	toDay?: string
	/** Nothing sums the whole range into one row. */
	groupBy?: UsageGroup[]
}

/** One group's sums. A field the query did not group by is null. */
export interface UsageRow extends UsageSums {
	/** The day, the Monday of the week, the month (`YYYY-MM`) or the year, by the span asked for. */
	bucket: string | null
	provider: string | null
	model: string | null
	grade: string | null
	kind: string | null
	domain: string | null
	tool: string | null
}

// The blocks of a message: what the panel renders and what the pack reads back as the thread. They are the
// frontend's shape alone; the crate keeps them as JSON.

/** pending waits on the owner's confirm; running is the handler at work; failed is an error, cancelled the owner's no. */
export type ToolState = 'pending' | 'running' | 'done' | 'failed' | 'cancelled'
export type DraftState = 'pending' | 'committed' | 'discarded'

/** What a `write-draft` tool offers; nothing is stored until the owner commits it. */
export type DraftCard =
	| ({ kind: 'task' } & DraftTask)
	| {
			kind: 'plan'
			title: string
			tasks: DraftTask[]
			events: { kind: string; title: string; day: string }[]
			meals?: { day: string; meals: { name: string; recipeId?: string }[] }[]
			/** What the plan's shop day needs, for the grocery list. */
			grocery?: { name: string; brand?: string; size?: string; qty: string }[]
			/** The project the tasks belong to, when they do. */
			projectId?: string
	  }
	| {
			kind: 'grocery'
			items: { name: string; brand?: string; size?: string; qty: string; note?: string }[]
			/** The store whose list the items go on when kept; with none, each is filed where it was last bought (D-97). */
			storeId?: string
	  }
	| { kind: 'code'; language: string; code: string; title?: string }
	| {
			kind: 'capture'
			/** What the files were read as: a shop just brought home, or the shelves as they stand (D-89). */
			mode?: 'haul' | 'stock'
			/** The rows read from the owner's files, as Hearth's capture sheet takes them (D-13, D-86). */
			rows: {
				id: string
				name: string
				brand?: string
				size?: string
				/** What one of it cost, from a receipt or an order (D-105). */
				price?: number
				qty: string
				unit?: string
				location: 'fridge' | 'freezer' | 'pantry' | 'counter' | 'household'
				/** An ISO date. */
				expiry?: string
				estimated?: boolean
				category?: string
				tip?: string
				/** The stock item the row would be added to, as the sheet names it, and whether it will be. */
				merge?: { id: string; name: string; on: boolean }
				/** The file the item is seen in, counted from 1, and where in it, as fractions of the photo (D-90). */
				seen?: { file: number; box: { left: number; top: number; right: number; bottom: number } }
			}[]
			/** The files the rows were read from, by their Attachment ids: never a path, never the bytes. */
			sources?: { id: string; name: string; mime: string }[]
			/** The shop the haul's receipt names, as printed, and its day as an ISO date (D-105). */
			store?: string
			boughtOn?: string
	  }
	| {
			kind: 'recipe'
			/** A recipe to check before it is saved: it opens in Hearth's Recipes view as a draft. */
			recipe: {
				name: string
				serves: number
				minutes: number
				tags: string[]
				ingredients: { name: string; qty: string; unit?: string; note?: string }[]
				steps: string[]
				sourceUrl?: string
				sourceName?: string
				author?: string
				tip?: string
				/** False for a recipe whose amounts do not follow its servings. */
				scales?: boolean
				/** Where the source shows a picture of the dish, for the draft to fetch. */
				imageUrl?: string
			}
	  }

/**
 * A file the owner attached to their message (D-82, D-83): the Attachment row by id, with what the panel and the pack
 * need of it without reading the row or the bytes. Never a path; the bytes stay in the workspace's attachments.
 */
export interface AttachmentBlock {
	kind: 'attachment'
	/** The Attachment row's id. */
	id: string
	name: string
	mime: string
	/** Bytes, as stored. */
	size: number
	/** The SHA-256 of the bytes, as hex. */
	hash: string
	/** An image's pixels, as stored. */
	width?: number
	height?: number
}

export type MessageBlock =
	| { kind: 'text'; text: string }
	| AttachmentBlock
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
	| { kind: 'proposal'; proposal: FactProposal; state: 'pending' | 'accepted' | 'dismissed'; callId?: string }
	/** `callId` is the tool call that left it, so that call's card can say what became of it. */
	| { kind: 'draft'; draft: DraftCard; state: DraftState; domain?: string; callId?: string }
	| {
			kind: 'can-see'
			items: { id: string; count: number }[]
			locked: string[]
			trimmed: string[]
			rows: Record<string, string[]>
			/** The owner's files this request carried, by name (D-82). */
			attachments?: string[]
	  }
	| { kind: 'error'; code: string; message: string }
	/** On a reply while its request runs, and taken off when it settles: one left behind was interrupted. */
	| { kind: 'writing' }

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
