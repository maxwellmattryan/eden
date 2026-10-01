import { describe, expect, it } from 'vitest'
import { DEFAULT_POLICY, effectiveSetup, readPolicy } from './policy.js'
import { ANTHROPIC_SEED } from './providers.js'
import type { PolicyRow } from './runtime-types.js'

const row = (value: unknown, deletedAt: string | null = null): PolicyRow => ({
	key: 'gardener',
	value,
	createdAt: '0000000000000001-00000000-00000001',
	updatedAt: '0000000000000001-00000000-00000001',
	deletedAt,
})

describe('the policy row', () => {
	it('is the default with no row, a deleted row, or a row that holds nonsense', () => {
		expect(DEFAULT_POLICY).toEqual({
			provider: 'anthropic',
			edits: {},
			overrides: {},
			monthlyCapUsd: 10,
			requestTokenCap: null,
		})
		expect(readPolicy(null)).toEqual(DEFAULT_POLICY)
		expect(readPolicy(row({ monthlyCapUsd: 50 }, '0000000000000002-00000000-00000001'))).toEqual(DEFAULT_POLICY)
		expect(readPolicy(row('gardener'))).toEqual(DEFAULT_POLICY)
		expect(readPolicy(row([1, 2]))).toEqual(DEFAULT_POLICY)
	})

	it('reads each field it knows and falls back field by field', () => {
		expect(
			readPolicy(
				row({
					provider: 'openai',
					edits: { grades: { deep: 'claude-fable-5-1' } },
					overrides: 'none',
					monthlyCapUsd: -3,
					requestTokenCap: 50_000,
					later: true,
				})
			)
		).toEqual({
			provider: 'anthropic',
			edits: { grades: { deep: 'claude-fable-5-1' } },
			overrides: {},
			monthlyCapUsd: 10,
			requestTokenCap: 50_000,
		})
		expect(readPolicy(row({ monthlyCapUsd: 25, requestTokenCap: 1.5 }))).toMatchObject({
			monthlyCapUsd: 25,
			requestTokenCap: null,
		})
		expect(readPolicy(row({ monthlyCapUsd: 0 })).monthlyCapUsd).toBe(0)
	})

	it('resolves the setup from the seed with the edits over it', () => {
		const plain = effectiveSetup(DEFAULT_POLICY)
		expect(plain.provider).toEqual(ANTHROPIC_SEED)
		expect(plain.refused).toEqual([])
		expect(plain.map.standard).toEqual({ provider: 'anthropic', model: 'claude-sonnet-5-5' })
		expect(plain.models({ provider: 'anthropic', model: 'claude-opus-5-5' })?.pricing.input).toBe(4)
		expect(plain.models({ provider: 'openai', model: 'gpt' })).toBeUndefined()

		const edited = effectiveSetup({
			...DEFAULT_POLICY,
			edits: { grades: { deep: 'claude-fable-5-1', light: 'claude-retired' } },
		})
		expect(edited.map.deep).toEqual({ provider: 'anthropic', model: 'claude-fable-5-1' })
		expect(edited.map.light).toEqual({ provider: 'anthropic', model: 'claude-haiku-4-5-20251001' })
		expect(edited.refused).toEqual([
			'anthropic: the light grade names "claude-retired", which the provider does not list',
		])
	})
})
