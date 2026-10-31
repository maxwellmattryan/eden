// The Gardener's policy row (docs/product/substrate/ai.md, "Providers and models"; D-37): the owner's edits to the
// seed, their overrides and their caps, kept as workspace policy under one key and read back tolerantly, since a row
// written by a later build may hold fields this one does not know, and a hand-edited one may hold anything.
import { ANTHROPIC, effectiveProvider, gradeMapOf, modelLookup, seedOf } from './providers.js'
import type { GardenerPolicy, GardenerProviderId, PolicyRow } from './runtime-types.js'
import type { GradeMap, ModelLookup, ModelOverrides, ProviderEdits, ProviderRow } from './types.js'

export const DEFAULT_POLICY: GardenerPolicy = {
	provider: 'anthropic',
	edits: {},
	overrides: {},
	monthlyCapUsd: 10,
	requestTokenCap: null,
	usageWarnAt: 0.8,
	usageStopAt: 0.95,
}

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value)
const isMoney = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0
const isCap = (value: unknown): value is number => Number.isInteger(value) && (value as number) > 0
const isShare = (value: unknown): value is number =>
	typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1

/** The usage-window thresholds a row holds (D-180): both, in (0, 1] with warn ≤ stop, or the defaults for both. */
function thresholdsOf(value: Record<string, unknown>): Pick<GardenerPolicy, 'usageWarnAt' | 'usageStopAt'> {
	const warn = isShare(value.usageWarnAt) ? value.usageWarnAt : DEFAULT_POLICY.usageWarnAt
	const stop = isShare(value.usageStopAt) ? value.usageStopAt : DEFAULT_POLICY.usageStopAt
	if (warn > stop) return { usageWarnAt: DEFAULT_POLICY.usageWarnAt, usageStopAt: DEFAULT_POLICY.usageStopAt }
	return { usageWarnAt: warn, usageStopAt: stop }
}

/**
 * The policy a row holds, with the default for every field that is missing or not what it should be. `provider` is
 * the build's (D-178), never the row's.
 */
export function readPolicy(row: PolicyRow | null, providerId: GardenerProviderId = 'anthropic'): GardenerPolicy {
	const value = row && !row.deletedAt && isObject(row.value) ? row.value : {}
	return {
		provider: providerId,
		edits: isObject(value.edits) ? (value.edits as ProviderEdits) : {},
		overrides: isObject(value.overrides) ? (value.overrides as ModelOverrides) : {},
		monthlyCapUsd: isMoney(value.monthlyCapUsd) ? value.monthlyCapUsd : DEFAULT_POLICY.monthlyCapUsd,
		requestTokenCap: isCap(value.requestTokenCap) ? value.requestTokenCap : null,
		...thresholdsOf(value),
	}
}

/**
 * The Settings fields' whole percentages, 1 to 100 with warn ≤ stop, as the policy's fractions; null for anything
 * else, so nothing is saved.
 */
export function parseThresholds(
	warnText: string,
	stopText: string
): Pick<GardenerPolicy, 'usageWarnAt' | 'usageStopAt'> | null {
	const percent = (text: string): number | null => {
		const trimmed = text.trim()
		if (!/^\d+$/.test(trimmed)) return null
		const value = Number(trimmed)
		return value >= 1 && value <= 100 ? value : null
	}
	const warn = percent(warnText)
	const stop = percent(stopText)
	if (warn === null || stop === null || warn > stop) return null
	return { usageWarnAt: warn / 100, usageStopAt: stop / 100 }
}

export interface EffectiveSetup {
	provider: ProviderRow
	map: GradeMap
	models: ModelLookup
	/** The owner's edits that would not hold, in words. */
	refused: string[]
}

/** The provider the policy resolves to: the seed of `providerId` with the edits over it, its map and its lookup. */
export function effectiveSetup(policy: GardenerPolicy, providerId: string = ANTHROPIC): EffectiveSetup {
	const { provider, refused } = effectiveProvider(seedOf(providerId), policy.edits)
	return { provider, map: gradeMapOf(provider), models: modelLookup([provider]), refused }
}
