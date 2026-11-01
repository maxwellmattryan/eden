import { describe, expect, it } from 'vitest'
import { DEFAULT_POLICY, effectiveSetup, parseThresholds, readPolicy } from './policy.js'
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
			usageWarnAt: 0.8,
			usageStopAt: 0.95,
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
			usageWarnAt: 0.8,
			usageStopAt: 0.95,
		})
		expect(readPolicy(row({ monthlyCapUsd: 25, requestTokenCap: 1.5 }))).toMatchObject({
			monthlyCapUsd: 25,
			requestTokenCap: null,
		})
		expect(readPolicy(row({ monthlyCapUsd: 0 })).monthlyCapUsd).toBe(0)
	})

	it('reports the build’s provider, never the row’s', () => {
		expect(readPolicy(row({ provider: 'anthropic' }), 'claude-code').provider).toBe('claude-code')
		expect(readPolicy(null, 'claude-code')).toEqual({ ...DEFAULT_POLICY, provider: 'claude-code' })
	})

	it('reads the usage-window thresholds as shares in (0, 1], warn never above stop (D-180)', () => {
		const shares = (value: unknown) => {
			const { usageWarnAt, usageStopAt } = readPolicy(row(value))
			return [usageWarnAt, usageStopAt]
		}
		expect(shares({ usageWarnAt: 0.7, usageStopAt: 0.9 })).toEqual([0.7, 0.9])
		expect(shares({ usageWarnAt: 0.9, usageStopAt: 0.9 })).toEqual([0.9, 0.9])
		expect(shares({ usageWarnAt: 1, usageStopAt: 1 })).toEqual([1, 1])
		expect(shares({ usageWarnAt: 0.5 })).toEqual([0.5, 0.95])
		expect(shares({ usageStopAt: 0.85 })).toEqual([0.8, 0.85])
		// one out of range falls back alone; a pair that crosses falls back whole
		expect(shares({ usageWarnAt: 0, usageStopAt: 0.9 })).toEqual([0.8, 0.9])
		expect(shares({ usageWarnAt: 0.7, usageStopAt: 1.5 })).toEqual([0.7, 0.95])
		expect(shares({ usageWarnAt: '0.7', usageStopAt: Number.NaN })).toEqual([0.8, 0.95])
		expect(shares({ usageWarnAt: 0.96, usageStopAt: 0.95 })).toEqual([0.8, 0.95])
		expect(shares({ usageWarnAt: 0.9, usageStopAt: 0.5 })).toEqual([0.8, 0.95])
	})

	it('parses the Settings fields’ whole percentages, and nothing else', () => {
		expect(parseThresholds('80', '95')).toEqual({ usageWarnAt: 0.8, usageStopAt: 0.95 })
		expect(parseThresholds(' 70 ', '90')).toEqual({ usageWarnAt: 0.7, usageStopAt: 0.9 })
		expect(parseThresholds('1', '1')).toEqual({ usageWarnAt: 0.01, usageStopAt: 0.01 })
		expect(parseThresholds('100', '100')).toEqual({ usageWarnAt: 1, usageStopAt: 1 })
		const refused: [string, string][] = [
			['', '95'],
			['80', ''],
			['80.5', '95'],
			['8e1', '95'],
			['-5', '95'],
			['0', '95'],
			['80', '101'],
			['96', '95'],
			['abc', '95'],
		]
		for (const [warn, stop] of refused) {
			expect(parseThresholds(warn, stop), `${warn} / ${stop}`).toBeNull()
		}
	})

	it('resolves Claude Code’s setup from its own seed, with the same edits over it', () => {
		const edits = { grades: { deep: 'claude-fable-5-1' } }
		const cli = effectiveSetup({ ...DEFAULT_POLICY, edits }, 'claude-code')
		const api = effectiveSetup({ ...DEFAULT_POLICY, edits })
		expect(cli.provider.id).toBe('claude-code')
		expect(cli.map.deep).toEqual({ provider: 'claude-code', model: 'claude-fable-5-1' })
		expect(cli.provider.grades).toEqual(api.provider.grades)
		expect(cli.provider.models).toEqual(api.provider.models)
		expect(cli.models({ provider: 'claude-code', model: 'claude-opus-5-5' })?.pricing.input).toBe(4)
		expect(cli.models({ provider: 'anthropic', model: 'claude-opus-5-5' })).toBeUndefined()
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
