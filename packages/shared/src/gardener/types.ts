// Model grades (D-74): a model is picked by the job, not the place. A model-backed tool declares a grade and what it
// needs of a model; each provider lists its models, each with its flags and a pricing row, and maps each grade to one
// of them. Nothing here names a model: the seed in providers.ts is the only place a model id appears.
import type { ModelFlag, ModelGrade } from '../manifest/types.js'

export type { ModelFlag, ModelGrade }

/** The grades, lowest first. The resolver walks them upward from a tool's declared grade and never down. */
export const GRADES = ['light', 'standard', 'deep'] as const satisfies readonly ModelGrade[]

/** The conversation's grade until the owner switches it on the status-bar chip. */
export const CONVERSATION_GRADE: ModelGrade = 'standard'

/** Open on purpose: OpenAI, Google and a custom or local provider arrive as rows, not as changes to this type. */
export type ProviderId = string

export interface ModelRef {
	provider: ProviderId
	model: string
}

/** USD per million tokens, seeded and the owner's to edit. What every estimate is made from. */
export interface Pricing {
	input: number
	output: number
	cacheRead: number
	/** What writing the input to the provider's cache costs; a quarter over the input price when a row has none (D-116). */
	cacheWrite?: number
	/**
	 * What one web search costs, in USD for the one search, not per million (D-132): the provider's fee for running
	 * the search on its own side, on top of the tokens its results put into the input. Nothing when a row has none.
	 */
	search?: number
}

/** A tool the provider runs on its own side, as its API names it. */
export interface ServerTool {
	type: string
	name: string
}

export interface ModelRow {
	/** The provider's own id for the model, dated wherever the provider has a dated one. */
	id: string
	flags: readonly ModelFlag[]
	/** The tokens its context holds. */
	contextTokens: number
	pricing: Pricing
	/**
	 * It reasons before it answers whether asked to or not, and that reasoning counts toward a request's output
	 * limit: a request to it is given room for both.
	 */
	thinks?: boolean
}

export interface ProviderRow {
	id: ProviderId
	/** Every model the owner may choose, including those mapped to no grade. */
	models: readonly ModelRow[]
	/** The model id each grade runs on. A provider with one model maps all three to it. */
	grades: Readonly<Record<ModelGrade, string>>
	/**
	 * The tools the provider runs itself, by what Eden asks of a model: `search` is its web search (D-132). Each
	 * provider maps the need to its own tool; one with none cannot run a tool that needs it.
	 */
	serverTools?: { search?: ServerTool }
}

export type GradeMap = Readonly<Record<ModelGrade, ModelRef>>

/** What answers a model ref with its row, across every provider the owner has; nothing for a model none lists. */
export type ModelLookup = (ref: ModelRef) => ModelRow | undefined

/** The owner's overrides, each naming a model: per tool, keyed `<domain>.<tool>`, and per domain, keyed by its id. */
export interface ModelOverrides {
	tools?: Readonly<Record<string, ModelRef>>
	domains?: Readonly<Record<string, ModelRef>>
}

/**
 * The owner's changes to a seeded provider, kept as a sparse overlay so a new seed reaches everything they never
 * touched (`effectiveProvider`). A model edit names a listed model and the fields it changes, or a model the seed
 * does not list, whole.
 */
export interface ProviderEdits {
	grades?: Partial<Record<ModelGrade, string>>
	models?: readonly ModelEdit[]
}

export interface ModelEdit {
	id: string
	flags?: readonly ModelFlag[]
	contextTokens?: number
	pricing?: Partial<Pricing>
	thinks?: boolean
}

/** What a model lacks that a tool needs: one of its flags, or the context size. */
export type Unmet = ModelFlag | 'context'

/** How the model of a resolution was chosen, which the audit entry records. */
export type ResolutionSource = 'tool-override' | 'domain-override' | 'map'

/** A model the resolver passed over, and why. An unlisted one is treated as lacking every need. */
export interface Skipped {
	source: ResolutionSource
	provider: ProviderId
	model: string
	reason: 'unlisted' | 'lacking'
	missing: readonly Unmet[]
}

/**
 * The answer for one request. `plain` runs no model. `model` names the provider and the model, the grade it runs at
 * and the one declared; `confirm` is owed before it is sent. `unavailable` says why, in words the interface writes.
 */
export type Resolution =
	| { kind: 'plain' }
	| {
			kind: 'model'
			provider: ProviderId
			model: string
			grade: ModelGrade
			declared: ModelGrade
			source: ResolutionSource
			confirm: boolean
			skipped: readonly Skipped[]
	  }
	| {
			kind: 'unavailable'
			declared: ModelGrade
			reason: 'no-provider' | 'no-capable-model'
			missing: readonly Unmet[]
			skipped: readonly Skipped[]
	  }
