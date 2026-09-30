// Which model runs a request (D-74). Pure and never throws: a request that cannot run says why. The per-tool
// override, then the per-domain override, each naming a model, then the provider's map at the declared grade; where a
// model lacks a need, the next grade up that has it, never down. A confirm is owed on what costs more than the owner
// chose: every tool request that runs at `deep`, and every request above its declared grade.
import type { ToolDeclaration } from '../manifest/types.js'
import {
	GRADES,
	type GradeMap,
	type ModelFlag,
	type ModelGrade,
	type ModelLookup,
	type ModelOverrides,
	type ModelRef,
	type ModelRow,
	type Resolution,
	type ResolutionSource,
	type Skipped,
	type Unmet,
} from './types.js'

const rank = (grade: ModelGrade) => GRADES.indexOf(grade)

/** What the row lacks of the needs; an unlisted model lacks them all. */
function lacks(row: ModelRow | undefined, needs: readonly ModelFlag[], minContext: number | null): Unmet[] {
	const missing: Unmet[] = needs.filter((flag) => !row?.flags.includes(flag))
	if (minContext !== null && !(row && row.contextTokens >= minContext)) missing.push('context')
	return missing
}

interface Need {
	declared: ModelGrade
	needs: readonly ModelFlag[]
	minContext: number | null
}

/** The ref when its model can run the request; otherwise it goes into `skipped`, once. */
function capable(
	ref: ModelRef,
	source: ResolutionSource,
	need: Need,
	models: ModelLookup,
	skipped: Skipped[]
): ModelRef | undefined {
	const row = models(ref)
	const missing = lacks(row, need.needs, need.minContext)
	if (row && !missing.length) return ref
	const seen = skipped.some(
		(entry) => entry.source === source && entry.provider === ref.provider && entry.model === ref.model
	)
	if (!seen) {
		const reason = row ? 'lacking' : 'unlisted'
		skipped.push({ source, provider: ref.provider, model: ref.model, reason, missing })
	}
	return undefined
}

/** The map from the declared grade upward. */
function fromMap(
	need: Need,
	map: GradeMap | null | undefined,
	models: ModelLookup,
	skipped: Skipped[],
	confirmDeep: boolean
): Resolution {
	const { declared, needs } = need
	if (!map) return { kind: 'unavailable', declared, reason: 'no-provider', missing: [], skipped }
	for (const grade of GRADES.slice(rank(declared))) {
		const ref = capable(map[grade], 'map', need, models, skipped)
		if (!ref) continue
		const confirm = (confirmDeep && grade === 'deep') || rank(grade) > rank(declared)
		return { kind: 'model', provider: ref.provider, model: ref.model, grade, declared, source: 'map', confirm, skipped }
	}
	// What the map's models lacked, each once, in the order the request needs it.
	const lacked = new Set(skipped.filter((entry) => entry.source === 'map').flatMap((entry) => entry.missing))
	const missing = ([...needs, 'context'] as const).filter((unmet) => lacked.has(unmet))
	return { kind: 'unavailable', declared, reason: 'no-capable-model', missing, skipped }
}

export interface ToolRequest {
	tool: Pick<ToolDeclaration, 'id' | 'grade' | 'needs' | 'minContext'>
	/** The domain that declares the tool; its override is keyed by this, the tool's by `<domain>.<tool>`. */
	domain: string
	overrides?: ModelOverrides
	/** The active provider's map; none when no provider is configured. */
	map: GradeMap | null | undefined
	models: ModelLookup
}

/**
 * The model a tool request runs on. A plain tool runs none. An override runs at the declared grade; one whose model
 * is not listed or lacks a need is recorded in `skipped` and passed over. A tool request that runs at `deep` is
 * confirmed by the owner before it is sent, and so is one the resolver moved above its declared grade.
 */
export function resolveTool({ tool, domain, overrides, map, models }: ToolRequest): Resolution {
	if (tool.grade === null) return { kind: 'plain' }
	const need: Need = { declared: tool.grade, needs: tool.needs, minContext: tool.minContext }
	const skipped: Skipped[] = []
	const chosen: [ResolutionSource, ModelRef | undefined][] = [
		['tool-override', overrides?.tools?.[`${domain}.${tool.id}`]],
		['domain-override', overrides?.domains?.[domain]],
	]
	for (const [source, override] of chosen) {
		const ref = override && capable(override, source, need, models, skipped)
		if (!ref) continue
		return {
			kind: 'model',
			provider: ref.provider,
			model: ref.model,
			grade: need.declared,
			declared: need.declared,
			source,
			confirm: need.declared === 'deep',
			skipped,
		}
	}
	return fromMap(need, map, models, skipped, true)
}

/**
 * The model the conversation runs on at its grade, or at a grade the Gardener proposed and the owner accepted. The
 * owner chose that grade, so it asks nothing more of them; only a move above it, for a need the grade's model lacks,
 * is confirmed.
 */
export function resolveGrade(
	grade: ModelGrade,
	needs: readonly ModelFlag[],
	map: GradeMap | null | undefined,
	models: ModelLookup
): Resolution {
	return fromMap({ declared: grade, needs, minContext: null }, map, models, [], false)
}
