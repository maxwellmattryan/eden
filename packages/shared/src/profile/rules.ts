// The rules of the profile, the same ones the crate enforces (`src-tauri/src/substrate/facts.rs`): what a fact may
// name, what is refused, which rows a reader gets and in what order, and how long the history keeps a replaced value.
// The engine applies them in a plain browser; the client asks them before it sends a write.
import { resource } from '../registry/index.js'
import { HISTORY_DAYS, type Fact, type FactInput, type FactPatch, type Provenance } from './types.js'

/** The refusal's code (`fact:never`, `fact:invalid`) and why. */
export type Refusal = [code: string, detail: string]

const DAY = /^\d{4}-\d{2}-\d{2}$/
/** The fields a patch may name; `type` is not one, a fact of another type is another fact. */
export const PATCHABLE = ['value', 'confidence', 'validFrom', 'validUntil', 'source', 'note', 'provenance'] as const

const invalid = (detail: string): Refusal => ['fact:invalid', detail]

function isDay(day: string): boolean {
	if (!DAY.test(day)) return false
	const date = new Date(`${day}T00:00:00Z`)
	return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === day
}

/** Why the window does not hold, or nothing. */
export function checkWindow(from: string | null | undefined, until: string | null | undefined): Refusal | undefined {
	for (const day of [from, until]) {
		if (day != null && !isDay(day)) return invalid(`not a day: ${JSON.stringify(day)}`)
	}
	if (from != null && until != null && from > until) return invalid('a window ends after it starts')
	return undefined
}

/**
 * The rules of who wrote what: confidence for what was derived or inferred and for nothing else, a source for what
 * an integration wrote, and `system-derived` for the substrate's own types only.
 */
export function checkProvenance(
	fields: Pick<FactInput, 'type' | 'provenance' | 'confidence' | 'source'>,
	owner: string | undefined
): string | undefined {
	const { provenance, confidence, source } = fields
	const has = confidence != null
	if ((provenance === 'domain-derived' || provenance === 'ai-inferred') && !has) {
		return `a ${provenance} fact carries its confidence`
	}
	if ((provenance === 'user-asserted' || provenance === 'integration') && has) {
		return `a ${provenance} fact carries no confidence`
	}
	if (has && !(confidence >= 0 && confidence <= 1)) return 'a confidence is between 0 and 1'
	if (provenance === 'integration' && source == null) return 'an integration names itself as the source'
	if (provenance === 'system-derived' && owner !== undefined && owner !== 'substrate') {
		return `only the substrate derives a fact, and ${fields.type} is not its`
	}
	if (source != null && (source.length === 0 || source.length > 200)) return 'not a source'
	return undefined
}

/**
 * What the store refuses to hold: a type that is not a fact of Phase 1, anything T3, a value that is nothing, and a
 * provenance that does not fit its fields. Answers the code and the detail, or nothing.
 */
export function validateFact(input: FactInput): Refusal | undefined {
	const row = resource(input.type)
	if (!row || row.category !== 'fact') return invalid(`not a fact type: ${JSON.stringify(input.type)}`)
	if (row.tier === 'T3') return ['fact:never', `${input.type} is T3 and is never a fact`]
	if (!row.live) return invalid(`not a fact type of Phase 1: ${input.type}`)
	if (input.value === null || input.value === undefined) return invalid('a fact holds a value')
	const provenance = checkProvenance(input, row.owner)
	if (provenance) return invalid(provenance)
	return checkWindow(input.validFrom, input.validUntil)
}

/** Whether a patch names only what a fact has, and moves the provenance only to the owner's own word. */
export function validatePatch(patch: FactPatch): Refusal | undefined {
	const strange = Object.keys(patch).find((key) => !(PATCHABLE as readonly string[]).includes(key))
	if (strange) return invalid(`not a field of a fact: ${strange}`)
	if ('provenance' in patch && patch.provenance !== 'user-asserted') {
		return invalid("a fact becomes the owner's own or keeps its provenance")
	}
	if ('confidence' in patch && patch.confidence != null && typeof patch.confidence !== 'number') {
		return invalid('confidence is a number')
	}
	for (const key of ['validFrom', 'validUntil', 'source', 'note'] as const) {
		if (key in patch && patch[key] != null && typeof patch[key] !== 'string') return invalid(`${key} is text`)
	}
	return undefined
}

/** Whether the fact holds on the day. */
export function isInWindow(fact: Pick<Fact, 'validFrom' | 'validUntil'>, day: string): boolean {
	return (fact.validFrom == null || fact.validFrom <= day) && (fact.validUntil == null || fact.validUntil >= day)
}

/** Whether the fact's window has closed by the day: what the profile page greys and offers to renew. */
export function isExpired(fact: Pick<Fact, 'validUntil'>, day: string): boolean {
	return fact.validUntil != null && fact.validUntil < day
}

const rank = (provenance: Provenance) => (provenance === 'user-asserted' ? 0 : 1)
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** The order a reader gets facts in: by type, the owner's own word first, then the latest. */
export function effectiveOrder(a: Fact, b: Fact): number {
	return (
		byText(a.type, b.type) ||
		rank(a.provenance) - rank(b.provenance) ||
		byText(b.updatedAt, a.updatedAt) ||
		byText(a.id, b.id)
	)
}

/** The effective set: the live facts inside their window on the day, in the reader's order. */
export function effectiveFacts(facts: readonly Fact[], day: string): Fact[] {
	return facts.filter((fact) => !fact.deletedAt && isInWindow(fact, day)).sort(effectiveOrder)
}

/** The stamp a replaced value must be later than to stay in the history: thirty days before now. */
export function historyCutoff(nowMs: number): string {
	const cutoff = Math.max(0, nowMs - HISTORY_DAYS * 24 * 60 * 60 * 1000)
	return `${cutoff.toString(16).padStart(16, '0')}-00000000-00000000`
}
