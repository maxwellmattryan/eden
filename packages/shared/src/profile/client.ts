// The profile as the apps call it: the crate's commands under Tauri, the engine in a plain browser. The value's shape
// is checked here, before the call, since only the frontend knows it (D-72); the store's own rules are checked
// again on the other side.
import { call } from '../data/call.js'
import { DataError } from '../data/errors.js'
import { validateFact, validatePatch } from './rules.js'
import { validateValue } from './shapes.js'
import type { Fact, FactHistoryEntry, FactInput, FactPatch, FactQuery } from './types.js'

function refuse(refusal: [string, string] | undefined): void {
	if (refusal) throw new DataError(refusal[0], refusal[1])
}

/** Asserts a fact. A `system-derived` fact of a type the substrate already derived is renewed in place. */
export function assertFact(input: FactInput): Promise<Fact> {
	refuse(validateFact(input))
	const shape = validateValue(input.type, input.value)
	if (shape) return Promise.reject(new DataError('fact:invalid', shape))
	return call('assert_fact', { input }, (engine) => engine.assertFact(input))
}

/** Edits a fact in place; what it held goes to the history. */
export function updateFact(id: string, patch: FactPatch): Promise<Fact> {
	refuse(validatePatch(patch))
	return call('update_fact', { id, patch }, (engine) => engine.updateFact(id, patch))
}

/** Deletes a fact: readers stop seeing it at once, and the row stays as its tombstone. */
export function deleteFact(id: string): Promise<Fact> {
	return call('delete_fact', { id }, (engine) => engine.deleteFact(id))
}

/** Lifts a tombstone: what an undo of a delete calls. */
export function restoreFact(id: string): Promise<Fact> {
	return call('restore_fact', { id }, (engine) => engine.restoreFact(id))
}

/** The facts a reader gets: by type, the owner's own word first, then the latest. */
export function queryFacts(filter: FactQuery = {}): Promise<Fact[]> {
	return call('query_facts', { filter }, (engine) => engine.queryFacts(filter))
}

/** What a fact held before each of its edits, the latest first. */
export function queryFactHistory(factId: string): Promise<FactHistoryEntry[]> {
	return call('query_fact_history', { factId }, (engine) => engine.queryFactHistory(factId))
}
