// The grant store's shapes (docs/product/substrate/grants.md; D-70), mirrored by hand from the crate
// (`src-tauri/src/substrate/grants.rs`). A grant answers "may X see or do Y": a subject, a resource, an access level
// and a lifetime, stamped like any row and ended by a tombstone.
import type { DeviceCapability } from '../manifest/types.js'

/** What the resource names: for a model a registry id, for an integration a connector scope, for an action a tool id,
 * for a device a capability. */
export type GrantResourceType = 'registry' | 'scope' | 'tool' | 'capability'
/** The access vocabulary of D-8. `never` is not here: it is not a grant anyone can hold. */
export type GrantAccess = 'read' | 'write-draft' | 'write' | 'act-external'
export type GrantLifetime = 'standing' | 'session' | 'per-request'
/** Where the grant was given: the wizard, Settings, or an inline confirm sheet. */
export type GrantOrigin = 'onboarding' | 'settings' | 'confirm'
/** Why a check answered as it did. */
export type GrantReason = 'default' | 'grant' | 'never' | 'no-grant'

export interface Grant {
	uri: string
	id: string
	subject: string
	resource: string
	resourceType: GrantResourceType
	access: GrantAccess
	lifetime: GrantLifetime
	/** Optional: calendar ids, a place, a date range. A JSON object the consumer of the grant shapes. */
	narrowing: Record<string, unknown> | null
	origin: GrantOrigin
	createdAt: string
	updatedAt: string
	deletedAt: string | null
}

export interface GrantInput {
	/** A ULID the caller made; one is made when it is left out. */
	id?: string
	subject: string
	resource: string
	resourceType: GrantResourceType
	access: GrantAccess
	lifetime: GrantLifetime
	narrowing?: Record<string, unknown> | null
	origin: GrantOrigin
}

export interface GrantQuery {
	subject?: string
	resource?: string
	resourceType?: GrantResourceType
	includeRevoked?: boolean
}

/** The question a read or a confirm asks before it proceeds. */
export interface GrantCheck {
	subject: string
	resource: string
	resourceType: GrantResourceType
	access: GrantAccess
}

export interface GrantDecision {
	allowed: boolean
	reason: GrantReason
	/** The grant that allowed it, when one did: what an audit entry links to. */
	grantId?: string
}

/** The actions no subject is ever granted (D-8), the crate's list (`NEVER_AUTOMATED`). */
export const NEVER_AUTOMATED = [
	'send-message',
	'send-email',
	'pay',
	'transfer',
	'delete-external',
	'change-external-settings',
	'accept-terms',
] as const

/** The device capabilities a grant can name; the OS grants them per device, so these rows never sync or export. */
export const GRANT_CAPABILITIES: readonly DeviceCapability[] = [
	'camera',
	'location-precise',
	'os-notifications',
	'healthkit',
]
