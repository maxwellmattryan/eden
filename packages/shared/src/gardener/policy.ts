// The Gardener's policy row (docs/product/substrate/ai.md, "Providers and models"; D-37): the owner's edits to the
// seed, their overrides and their caps, kept as workspace policy under one key and read back tolerantly, since a row
// written by a later build may hold fields this one does not know, and a hand-edited one may hold anything.
import { ANTHROPIC_SEED, effectiveProvider, gradeMapOf, modelLookup } from './providers.js'
import type { GardenerPolicy, PolicyRow } from './runtime-types.js'
import type { GradeMap, ModelLookup, ModelOverrides, ProviderEdits, ProviderRow } from './types.js'

export const DEFAULT_POLICY: GardenerPolicy = {
	provider: 'anthropic',
	edits: {},
	overrides: {},
	monthlyCapUsd: 10,
	requestTokenCap: null,
}

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value)
const isMoney = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0
const isCap = (value: unknown): value is number => Number.isInteger(value) && (value as number) > 0

/** The policy a row holds, with the default for every field that is missing or not what it should be. */
export function readPolicy(row: PolicyRow | null): GardenerPolicy {
	const value = row && !row.deletedAt && isObject(row.value) ? row.value : {}
	return {
		provider: 'anthropic',
		edits: isObject(value.edits) ? (value.edits as ProviderEdits) : {},
		overrides: isObject(value.overrides) ? (value.overrides as ModelOverrides) : {},
		monthlyCapUsd: isMoney(value.monthlyCapUsd) ? value.monthlyCapUsd : DEFAULT_POLICY.monthlyCapUsd,
		requestTokenCap: isCap(value.requestTokenCap) ? value.requestTokenCap : null,
	}
}

export interface EffectiveSetup {
	provider: ProviderRow
	map: GradeMap
	models: ModelLookup
	/** The owner's edits that would not hold, in words. */
	refused: string[]
}

/** The provider the policy resolves to: the seed with the edits over it, its map and its lookup. */
export function effectiveSetup(policy: GardenerPolicy): EffectiveSetup {
	const { provider, refused } = effectiveProvider(ANTHROPIC_SEED, policy.edits)
	return { provider, map: gradeMapOf(provider), models: modelLookup([provider]), refused }
}
