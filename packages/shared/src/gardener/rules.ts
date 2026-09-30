// The rules of the Gardener's stores, the same ones the crate enforces (`src-tauri/src/substrate/{audit,threads,
// policy}.rs`): what a thread, a message, an audit entry and a policy row may hold. The engine applies them in a plain
// browser; a page may ask them before it asks the store.
import { isUlid } from '../data/ulid.js'
import type {
	AuditEntryInput,
	AuditOutcome,
	MessageInput,
	MessageRole,
	ThreadInput,
	ThreadPatch,
	ThreadTier,
} from './runtime-types.js'

/** The refusal's code and why. */
export type Refusal = [code: string, detail: string]

export const THREAD_TIERS: readonly ThreadTier[] = ['T0', 'T1', 'T2']
export const MESSAGE_ROLES: readonly MessageRole[] = ['owner', 'gardener']
export const AUDIT_OUTCOMES: readonly AuditOutcome[] = [
	'ok',
	'refusal',
	'max-tokens',
	'error',
	'cancelled',
	'declined',
	'budget',
	'interrupted',
]

/** How long an audit entry is kept, as in the crate. */
export const AUDIT_RETENTION_DAYS = 90

const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/

/** Whether `key` can name a policy row or a secret: kebab-case, as a registry id. */
export function isKebabKey(key: string): boolean {
	return typeof key === 'string' && KEBAB.test(key)
}

export function isThreadTier(value: unknown): value is ThreadTier {
	return (THREAD_TIERS as readonly unknown[]).includes(value)
}

export function isMessageRole(value: unknown): value is MessageRole {
	return (MESSAGE_ROLES as readonly unknown[]).includes(value)
}

export function isAuditOutcome(value: unknown): value is AuditOutcome {
	return (AUDIT_OUTCOMES as readonly unknown[]).includes(value)
}

const thread = (detail: string): Refusal => ['thread:invalid', detail]
const audit = (detail: string): Refusal => ['audit:invalid', detail]

const isText = (value: unknown): value is string => typeof value === 'string'
const isTitle = (value: unknown): value is string => isText(value) && value.trim().length > 0
const isDomain = (value: unknown) => value === null || value === undefined || (isText(value) && KEBAB.test(value))

/** Why the store would not keep the thread, or nothing. */
export function validateThread(input: ThreadInput): Refusal | undefined {
	if (input.id !== undefined && !isUlid(input.id)) return thread(`not an id: ${JSON.stringify(input.id)}`)
	if (!isTitle(input.title)) return thread('a thread has a title')
	if (input.tier !== undefined && !isThreadTier(input.tier)) return thread(`not a tier: ${JSON.stringify(input.tier)}`)
	if (!isDomain(input.domain)) return thread(`not a domain: ${JSON.stringify(input.domain)}`)
	return undefined
}

/** Why the store would not apply the patch, or nothing. */
export function validateThreadPatch(patch: ThreadPatch): Refusal | undefined {
	if ('title' in patch && !isTitle(patch.title)) return thread('a thread has a title')
	if ('tier' in patch && !isThreadTier(patch.tier)) return thread(`not a tier: ${JSON.stringify(patch.tier)}`)
	if ('domain' in patch && !isDomain(patch.domain)) return thread(`not a domain: ${JSON.stringify(patch.domain)}`)
	return undefined
}

/** Why the store would not keep the message, or nothing. The thread's presence is the store's to check. */
export function validateMessage(input: MessageInput): Refusal | undefined {
	if (input.id !== undefined && !isUlid(input.id)) return thread(`not an id: ${JSON.stringify(input.id)}`)
	if (!isUlid(input.threadId)) return thread(`not a thread id: ${JSON.stringify(input.threadId)}`)
	if (!isMessageRole(input.role)) return thread(`not a role: ${JSON.stringify(input.role)}`)
	if (!Array.isArray(input.blocks)) return thread('blocks are a list')
	if (input.requestId != null && !isUlid(input.requestId))
		return thread(`not a request id: ${JSON.stringify(input.requestId)}`)
	return undefined
}

const isCount = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0

/** Why the log would not keep the entry, or nothing. */
export function validateAudit(input: AuditEntryInput): Refusal | undefined {
	if (input.id !== undefined && !isUlid(input.id)) return audit(`not an id: ${JSON.stringify(input.id)}`)
	if (!(Number.isInteger(input.at) && input.at >= 0)) return audit('an entry is at an instant in milliseconds')
	if (!isTitle(input.surface)) return audit('an entry names its surface')
	if (input.threadId != null && !isUlid(input.threadId)) return audit('not a thread id')
	if (input.parentRequestId != null && !isUlid(input.parentRequestId)) return audit('not a request id')
	if (!isText(input.provider) || !isText(input.model)) return audit('an entry names its provider and model')
	if (!isAuditOutcome(input.outcome)) return audit(`not an outcome: ${JSON.stringify(input.outcome)}`)
	if (!Array.isArray(input.reads) || !Array.isArray(input.entities) || !Array.isArray(input.tools))
		return audit('reads, entities and tools are lists')
	if (!Array.isArray(input.grants)) return audit('grants are a list')
	for (const read of input.reads) {
		if (!isText(read?.id) || !isCount(read.count) || !Array.isArray(read.rows)) return audit('not a read')
	}
	for (const field of ['tokensIn', 'tokensOut', 'cacheRead', 'costUsd'] as const) {
		if (!isCount(input[field])) return audit(`${field} is a number, zero or more`)
	}
	return undefined
}

/** Why the store would not keep the policy row, or nothing. */
export function validatePolicy(key: string, value: unknown): Refusal | undefined {
	if (!isKebabKey(key)) return ['policy:invalid', `not a key: ${JSON.stringify(key)}`]
	if (value === undefined) return ['policy:invalid', 'a policy row holds a JSON value']
	return undefined
}

/** The instant an audit entry must be at or after to stay in the log: ninety days before now. */
export function auditCutoff(nowMs: number): number {
	return Math.max(0, nowMs - AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000)
}
