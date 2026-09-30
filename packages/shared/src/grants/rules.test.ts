import { describe, expect, it } from 'vitest'
import { checkShape, decide, liveMatch, validateGrant } from './rules.js'
import { NEVER_AUTOMATED, type Grant, type GrantCheck, type GrantInput } from './types.js'

const ID = '01J9ZQ4M3T8R5V2X7Y6W1B0CDE'

function input(over: Partial<GrantInput> = {}): GrantInput {
	return {
		subject: 'anthropic',
		resource: 'allergy',
		resourceType: 'registry',
		access: 'read',
		lifetime: 'standing',
		origin: 'onboarding',
		...over,
	}
}

function live(over: Partial<Grant> = {}): Grant {
	return {
		uri: `eden://grant/${ID}`,
		id: ID,
		subject: 'anthropic',
		resource: 'allergy',
		resourceType: 'registry',
		access: 'read',
		lifetime: 'standing',
		narrowing: null,
		origin: 'onboarding',
		createdAt: '0000000000000001-00000000-00000001',
		updatedAt: '0000000000000001-00000000-00000001',
		deletedAt: null,
		...over,
	}
}

const ask = (over: Partial<GrantCheck> = {}): GrantCheck => ({
	subject: 'anthropic',
	resource: 'allergy',
	resourceType: 'registry',
	access: 'read',
	...over,
})

describe('decide', () => {
	it('decides registry reads by tier', () => {
		expect(decide(ask({ resource: 'recipe' }), [])).toEqual({ allowed: true, reason: 'default' })
		expect(decide(ask({ resource: 'task' }), [])).toEqual({ allowed: true, reason: 'default' })
		expect(decide(ask({ resource: 'event' }), [])).toEqual({ allowed: false, reason: 'no-grant' })
		expect(decide(ask(), [])).toEqual({ allowed: false, reason: 'no-grant' })
		expect(decide(ask(), [live()])).toEqual({ allowed: true, reason: 'grant', grantId: ID })
	})

	it('never allows T3 or the never-automated list', () => {
		expect(decide(ask({ resource: 'identity-document' }), [live({ resource: 'identity-document' })])).toEqual({
			allowed: false,
			reason: 'never',
		})
		for (const action of NEVER_AUTOMATED) {
			expect(decide(ask({ resource: action, resourceType: 'tool', access: 'write' }), []).reason).toBe('never')
		}
	})

	it('act-external is never authorized by a stored grant', () => {
		const check = ask({ resource: 'open-issue', resourceType: 'tool', access: 'act-external' })
		const confirmed = live({
			resource: 'open-issue',
			resourceType: 'tool',
			access: 'act-external',
			lifetime: 'per-request',
		})
		expect(decide(check, [confirmed])).toEqual({ allowed: false, reason: 'no-grant' })
	})

	it('write-draft needs no grant', () => {
		expect(decide(ask({ resource: 'capture-haul', resourceType: 'tool', access: 'write-draft' }), [])).toEqual({
			allowed: true,
			reason: 'default',
		})
	})

	it('matches a live standing or session grant and never a per-request one', () => {
		expect(liveMatch(ask(), [live({ lifetime: 'session' })])?.id).toBe(ID)
		expect(liveMatch(ask(), [live({ lifetime: 'per-request' })])).toBeUndefined()
		expect(liveMatch(ask(), [live({ deletedAt: '0000000000000002-00000000-00000001' })])).toBeUndefined()
		expect(liveMatch(ask({ access: 'write' }), [live()])).toBeUndefined()
		expect(liveMatch(ask({ subject: 'openai' }), [live()])).toBeUndefined()
		// A scope needs a grant whatever the access.
		const scope = ask({ subject: 'google-calendar', resource: 'calendar:work:read', resourceType: 'scope' })
		expect(decide(scope, []).reason).toBe('no-grant')
		expect(
			decide(scope, [live({ subject: 'google-calendar', resource: 'calendar:work:read', resourceType: 'scope' })])
				.reason
		).toBe('grant')
	})
})

describe('validateGrant', () => {
	it('accepts what the crate accepts', () => {
		expect(validateGrant(input())).toBeUndefined()
		expect(validateGrant(input({ narrowing: { calendars: ['work'] } }))).toBeUndefined()
		expect(
			validateGrant(input({ resource: 'camera', resourceType: 'capability', subject: 'this-device' }))
		).toBeUndefined()
		expect(
			validateGrant(
				input({ resource: 'open-issue', resourceType: 'tool', access: 'act-external', lifetime: 'per-request' })
			)
		).toBeUndefined()
	})

	it('refuses what the crate refuses', () => {
		const code = (over: Partial<GrantInput>) => validateGrant(input(over))?.[0]
		expect(code({ resource: 'pay', resourceType: 'tool', access: 'write' })).toBe('grant:never')
		expect(code({ resource: 'identity-document' })).toBe('grant:never')
		expect(code({ access: 'write-draft' })).toBe('grant:invalid')
		expect(code({ resource: 'open-issue', resourceType: 'tool', access: 'act-external' })).toBe('grant:invalid')
		expect(code({ resource: 'secret-sauce' })).toBe('grant:invalid')
		expect(code({ subject: 'Anthropic' })).toBe('grant:invalid')
		expect(code({ resource: 'microphone', resourceType: 'capability' })).toBe('grant:invalid')
		expect(code({ resource: 'calendar work', resourceType: 'scope' })).toBe('grant:invalid')
		expect(code({ narrowing: ['work'] as unknown as Record<string, unknown> })).toBe('grant:invalid')
		expect(checkShape(ask({ resource: 'Recipe' }))?.[0]).toBe('grant:invalid')
	})
})
