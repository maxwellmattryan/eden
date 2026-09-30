// The provider registry (docs/product/substrate/ai.md, "Providers and models"; D-74): the seed, the only place a model
// id appears, and what the owner's edits may do to it. Only Anthropic is seeded; OpenAI and Google arrive with their
// adapters as rows of their own, and a provider with no row resolves to `no-provider`.
import {
	GRADES,
	type GradeMap,
	type ModelEdit,
	type ModelFlag,
	type ModelLookup,
	type ModelRow,
	type Pricing,
	type ProviderEdits,
	type ProviderId,
	type ProviderRow,
} from './types.js'

export const ANTHROPIC: ProviderId = 'anthropic'

const EVERY_FLAG: readonly ModelFlag[] = ['tools', 'vision']

/**
 * Anthropic's models, from the provider's docs on 2026-09-30: dated ids wherever one exists, and the pricing per
 * million tokens. Fable is listed for the owner to choose and mapped to no grade: it costs two and a half times Opus.
 */
export const ANTHROPIC_SEED: ProviderRow = {
	id: ANTHROPIC,
	models: [
		{
			id: 'claude-haiku-4-5-20251001',
			flags: EVERY_FLAG,
			contextTokens: 200_000,
			pricing: { input: 1, output: 5, cacheRead: 0.1 },
		},
		{
			id: 'claude-sonnet-5-5',
			flags: EVERY_FLAG,
			contextTokens: 1_000_000,
			pricing: { input: 2, output: 10, cacheRead: 0.2 },
		},
		{
			id: 'claude-opus-5-5',
			flags: EVERY_FLAG,
			contextTokens: 1_000_000,
			pricing: { input: 4, output: 20, cacheRead: 0.2 },
		},
		{
			id: 'claude-fable-5-1',
			flags: EVERY_FLAG,
			contextTokens: 1_000_000,
			pricing: { input: 10, output: 50, cacheRead: 0.25 },
		},
	],
	grades: { light: 'claude-haiku-4-5-20251001', standard: 'claude-sonnet-5-5', deep: 'claude-opus-5-5' },
}

/** Every seeded provider. */
export const PROVIDERS: readonly ProviderRow[] = [ANTHROPIC_SEED]

/** A provider's map from grade to model, as refs. */
export function gradeMapOf(provider: ProviderRow): GradeMap {
	return {
		light: { provider: provider.id, model: provider.grades.light },
		standard: { provider: provider.id, model: provider.grades.standard },
		deep: { provider: provider.id, model: provider.grades.deep },
	}
}

/** Answers a ref with its row from the providers given; nothing for a provider or a model they do not list. */
export function modelLookup(providers: readonly ProviderRow[]): ModelLookup {
	const rows = new Map(providers.map((provider) => [provider.id, provider]))
	return (ref) => rows.get(ref.provider)?.models.find((model) => model.id === ref.model)
}

const PROVIDER_ID = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/
const MODEL_ID = /^\S{1,200}$/
const PRICES = ['input', 'output', 'cacheRead'] as const

function modelProblems(provider: ProviderId, row: ModelEdit): string[] {
	const problems: string[] = []
	const what = `${provider}: the model ${JSON.stringify(row.id)}`
	if (typeof row.id !== 'string' || !MODEL_ID.test(row.id)) problems.push(`${what} is not a model id`)
	const flags = Array.isArray(row.flags) ? row.flags : []
	if (!Array.isArray(row.flags)) problems.push(`${what} has no list of flags`)
	for (const flag of flags) {
		if (!EVERY_FLAG.includes(flag)) problems.push(`${what} has the flag ${JSON.stringify(flag)}`)
	}
	if (new Set(flags).size !== flags.length) problems.push(`${what} lists a flag twice`)
	if (!(Number.isInteger(row.contextTokens) && (row.contextTokens ?? 0) > 0))
		problems.push(`${what} holds ${JSON.stringify(row.contextTokens)} tokens; a whole number above zero`)
	for (const price of PRICES) {
		const value = row.pricing?.[price]
		if (!(typeof value === 'number' && Number.isFinite(value) && value >= 0))
			problems.push(`${what} costs ${JSON.stringify(value)} per million ${price} tokens; a number, zero or more`)
	}
	return problems
}

/**
 * What is wrong with a provider's row, or nothing: its id, each model's id, flags, context size and pricing, a model
 * listed twice, and a grade mapped to a model the provider does not list. The seed is held to it in tests, and the
 * Gardener tab holds the owner's edits to it before they are kept.
 */
export function validateProvider(row: ProviderRow): string[] {
	const problems: string[] = []
	if (!PROVIDER_ID.test(row.id)) problems.push(`${JSON.stringify(row.id)} is not a provider id`)
	if (!row.models.length) problems.push(`${row.id}: lists no model`)
	const ids = new Set<string>()
	for (const model of row.models) {
		problems.push(...modelProblems(row.id, model))
		if (ids.has(model.id)) problems.push(`${row.id}: the model "${model.id}" is listed twice`)
		ids.add(model.id)
	}
	for (const grade of GRADES) {
		const model = row.grades[grade]
		if (!ids.has(model))
			problems.push(`${row.id}: the ${grade} grade names "${model}", which the provider does not list`)
	}
	return problems
}

/**
 * The seed with the owner's edits laid over it. An edit that would not hold is refused and the seed's value stands,
 * so a seed that retires a model the owner chose falls back to its own choice and says why. Refusals name the edit.
 */
export function effectiveProvider(
	seed: ProviderRow,
	edits: ProviderEdits = {}
): { provider: ProviderRow; refused: string[] } {
	const refused: string[] = []
	const models = [...seed.models]
	for (const edit of edits.models ?? []) {
		const at = models.findIndex((model) => model.id === edit.id)
		const listed = models[at]
		const row: ModelEdit = listed
			? {
					id: listed.id,
					flags: edit.flags ?? listed.flags,
					contextTokens: edit.contextTokens ?? listed.contextTokens,
					pricing: { ...listed.pricing, ...edit.pricing },
				}
			: edit
		const problems = modelProblems(seed.id, row)
		if (problems.length) refused.push(...problems)
		else if (listed) models[at] = row as ModelRow
		else models.push(row as ModelRow)
	}
	const grades = { ...seed.grades }
	for (const grade of GRADES) {
		const model = edits.grades?.[grade]
		if (model === undefined) continue
		if (models.some((row) => row.id === model)) grades[grade] = model
		else refused.push(`${seed.id}: the ${grade} grade names "${model}", which the provider does not list`)
	}
	return { provider: { id: seed.id, models, grades }, refused }
}

/**
 * How many times dearer one model is than another: the larger of the input and the output ratios. What the Gardener
 * tab says when the owner chooses a model dearer than the seeded one for its grade; it is never written down per model.
 */
export function priceRatio(candidate: { pricing: Pricing }, baseline: { pricing: Pricing }): number {
	const ratio = (price: number, base: number) => (base > 0 ? price / base : price > 0 ? Infinity : 1)
	return Math.max(
		ratio(candidate.pricing.input, baseline.pricing.input),
		ratio(candidate.pricing.output, baseline.pricing.output)
	)
}
