// The rules of the grant store, the same ones the crate enforces (`src-tauri/src/substrate/grants.rs`): what a grant
// may name, what is refused, and what a subject may do given the resource's tier, the access asked for and the live
// grants. The engine applies them in a plain browser; a page may ask them before it asks the store.
import { resource } from '../registry/index.js'
import {
	GRANT_CAPABILITIES,
	NEVER_AUTOMATED,
	type Grant,
	type GrantCheck,
	type GrantDecision,
	type GrantInput,
} from './types.js'

const SUBJECT = /^[a-z0-9._:-]{1,100}$/
const RESOURCE_ID = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/

/** The refusal's code (`grant:never`, `grant:invalid`) and why, or nothing when the subject and resource are sound. */
export function checkShape(
	check: Pick<GrantCheck, 'subject' | 'resource' | 'resourceType'>
): [string, string] | undefined {
	if (!SUBJECT.test(check.subject)) return ['grant:invalid', `not a subject: ${JSON.stringify(check.subject)}`]
	const fits =
		check.resourceType === 'registry'
			? resource(check.resource) !== undefined
			: check.resourceType === 'tool'
				? RESOURCE_ID.test(check.resource)
				: check.resourceType === 'capability'
					? (GRANT_CAPABILITIES as readonly string[]).includes(check.resource)
					: check.resource.length > 0 && !/\s/.test(check.resource)
	if (!fits) return ['grant:invalid', `not a ${check.resourceType} resource: ${JSON.stringify(check.resource)}`]
	return undefined
}

function tierOf(check: Pick<GrantCheck, 'resource' | 'resourceType'>) {
	return check.resourceType === 'registry' ? resource(check.resource)?.tier : undefined
}

/**
 * What the store refuses to hold: the never-automated list, anything T3, a draft (which needs no grant) and an
 * external action remembered past its request. Answers the code and the detail, or nothing.
 */
export function validateGrant(input: GrantInput): [string, string] | undefined {
	if ((NEVER_AUTOMATED as readonly string[]).includes(input.resource)) {
		return ['grant:never', `${input.resource} is never automated`]
	}
	const shape = checkShape(input)
	if (shape) return shape
	if (tierOf(input) === 'T3') return ['grant:never', `${input.resource} is T3 and cannot be granted`]
	if (input.access === 'write-draft') {
		return ['grant:invalid', 'a draft needs no grant: nothing is stored until the owner commits']
	}
	if (input.access === 'act-external' && input.lifetime !== 'per-request') {
		return ['grant:invalid', 'an external action is confirmed per request and never remembered']
	}
	const narrowing = input.narrowing
	if (narrowing != null && (typeof narrowing !== 'object' || Array.isArray(narrowing))) {
		return ['grant:invalid', 'a narrowing is a JSON object']
	}
	return undefined
}

/** The live grant, standing or for this session, that matches the key exactly. */
export function liveMatch(check: GrantCheck, grants: readonly Grant[]): Grant | undefined {
	return grants.find(
		(grant) =>
			!grant.deletedAt &&
			grant.lifetime !== 'per-request' &&
			grant.subject === check.subject &&
			grant.resourceType === check.resourceType &&
			grant.resource === check.resource &&
			grant.access === check.access
	)
}

/**
 * The one rule of the store, apart from the data. The never-automated list and T3 are `never`; a draft needs
 * nothing; an external action is never authorized by a stored grant; a read of T0 or T1 is the default; everything
 * else needs a live grant that matches exactly.
 */
export function decide(check: GrantCheck, grants: readonly Grant[]): GrantDecision {
	if ((NEVER_AUTOMATED as readonly string[]).includes(check.resource)) return { allowed: false, reason: 'never' }
	const tier = tierOf(check)
	if (tier === 'T3') return { allowed: false, reason: 'never' }
	if (check.access === 'write-draft') return { allowed: true, reason: 'default' }
	if (check.access === 'act-external') return { allowed: false, reason: 'no-grant' }
	if (check.access === 'read' && (tier === 'T0' || tier === 'T1')) return { allowed: true, reason: 'default' }
	const live = liveMatch(check, grants)
	return live ? { allowed: true, reason: 'grant', grantId: live.id } : { allowed: false, reason: 'no-grant' }
}
