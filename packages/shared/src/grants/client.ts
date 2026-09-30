// The grant store as the apps call it: the crate's commands under Tauri, the engine in a plain browser.
import { call } from '../data/call.js'
import type { Grant, GrantCheck, GrantDecision, GrantInput, GrantQuery } from './types.js'

/** Gives a grant. A standing or session grant that is already there is renewed rather than doubled. */
export function grant(input: GrantInput): Promise<Grant> {
	return call('grant', { input }, (engine) => engine.grant(input))
}

/** Ends a grant: future reads stop at once, and what was read under it stays as it is. */
export function revoke(id: string): Promise<Grant> {
	return call('revoke', { id }, (engine) => engine.revoke(id))
}

/** The grants, by id: the live ones unless the query asks for the revoked ones too. */
export function queryGrants(filter: GrantQuery = {}): Promise<Grant[]> {
	return call('query_grants', { filter }, (engine) => engine.queryGrants(filter))
}

/** Whether the subject may do this now, and by what right. */
export function checkGrant(query: GrantCheck): Promise<GrantDecision> {
	return call('check_grant', { query }, (engine) => engine.checkGrant(query))
}
