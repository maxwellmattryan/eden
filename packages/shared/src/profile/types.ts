// The profile's shapes (docs/product/substrate/profile.md; D-72), mirrored by hand from the crate
// (`src-tauri/src/substrate/facts.rs`). A fact is a typed statement about the owner: a registry fact id, a value the
// type's shape gives, and a provenance that says who wrote it, stamped like any row and ended by a tombstone.
import type { FactId, OwnerId } from '../registry/index.js'

/** Who wrote the fact: the owner, a domain, the substrate, an integration, or the Gardener once the owner accepted. */
export type Provenance = 'user-asserted' | 'domain-derived' | 'system-derived' | 'integration' | 'ai-inferred'
export const PROVENANCES: readonly Provenance[] = [
	'user-asserted',
	'domain-derived',
	'system-derived',
	'integration',
	'ai-inferred',
]

export interface Fact {
	uri: string
	id: string
	type: FactId
	value: unknown
	provenance: Provenance
	/** 0 to 1; with what was derived or inferred, never with the owner's own word. */
	confidence: number | null
	/** The first day the fact holds, `YYYY-MM-DD`. */
	validFrom: string | null
	/** The last day the fact holds, inclusive. */
	validUntil: string | null
	/** The entity or the integration that produced it. */
	source: string | null
	note: string | null
	createdAt: string
	updatedAt: string
	deletedAt: string | null
}

export interface FactInput {
	/** A ULID the caller made; one is made when it is left out. */
	id?: string
	type: FactId
	value: unknown
	provenance: Provenance
	confidence?: number | null
	validFrom?: string | null
	validUntil?: string | null
	source?: string | null
	note?: string | null
}

/** A value sets a field, `null` clears it, an absent field is left as it is. The provenance moves only to the
 * owner's own word, which drops the confidence. */
export interface FactPatch {
	value?: unknown
	confidence?: number | null
	validFrom?: string | null
	validUntil?: string | null
	source?: string | null
	note?: string | null
	provenance?: 'user-asserted'
}

export interface FactQuery {
	types?: FactId[]
	/** A domain id or `substrate`: the fact types the registry says it owns. */
	owner?: OwnerId
	includeExpired?: boolean
	includeDeleted?: boolean
	/** The day the validity window is judged on, `YYYY-MM-DD`; today when it is left out. */
	at?: string
}

/** A value a fact held before an edit replaced it. */
export interface FactHistoryEntry {
	factId: string
	type: FactId
	value: unknown
	note: string | null
	validFrom: string | null
	validUntil: string | null
	/** The stamp of the edit that replaced it. */
	replacedAt: string
}

/** What the Gardener noticed and offers to keep (docs/product/substrate/ai.md, "Proposal cards"). It is the shell's
 * state, never a row: nothing is stored until the owner accepts, and then the fact stays `ai-inferred`. */
export interface FactProposal {
	id: string
	type: FactId
	value: unknown
	confidence: number
	/** What the Gardener said, in its own words. */
	text?: string
	source?: string
}

/** How long a replaced value stays in the history, as in the crate. */
export const HISTORY_DAYS = 30
