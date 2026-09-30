import { describe, expect, it } from 'vitest'
import { gradeMapOf, modelLookup } from './providers.js'
import { resolveGrade, resolveTool, type ToolRequest } from './resolve.js'
import type {
	ModelFlag,
	ModelGrade,
	ModelOverrides,
	ModelRow,
	ProviderRow,
	Resolution,
	ResolutionSource,
	Skipped,
} from './types.js'

// A provider of small made-up models, each named for what it has, so a case reads as what it tests.
const row = (id: string, flags: ModelFlag[], contextTokens = 100_000): ModelRow => ({
	id,
	flags,
	contextTokens,
	pricing: { input: 1, output: 1, cacheRead: 0 },
})
const MODELS = [
	row('text', []),
	row('tools', ['tools']),
	row('eyes', ['vision']),
	row('both', ['tools', 'vision']),
	row('long', ['tools'], 1_000_000),
]
const provider = (light: string, standard: string, deep: string): ProviderRow => ({
	id: 'test',
	models: MODELS,
	grades: { light, standard, deep },
})
const models = modelLookup([provider('text', 'text', 'text')])
const map = (light: string, standard: string, deep: string) => gradeMapOf(provider(light, standard, deep))
const ref = (model: string) => ({ provider: 'test', model })

interface Tool {
	grade: ModelGrade | null
	needs?: ModelFlag[]
	minContext?: number
}
const request = (tool: Tool, grades: [string, string, string] | null, overrides?: ModelOverrides): ToolRequest => ({
	tool: { id: 'plan', grade: tool.grade, needs: tool.needs ?? [], minContext: tool.minContext ?? null },
	domain: 'kitchen',
	overrides,
	map: grades && map(...grades),
	models,
})
const runs = (
	model: string,
	grade: ModelGrade,
	declared: ModelGrade,
	source: ResolutionSource,
	confirm: boolean,
	skipped: Skipped[] = []
): Resolution => ({ kind: 'model', provider: 'test', model, grade, declared, source, confirm, skipped })
const passed = (model: string, missing: Skipped['missing'], source: ResolutionSource = 'map'): Skipped => ({
	source,
	provider: 'test',
	model,
	reason: MODELS.some((known) => known.id === model) ? 'lacking' : 'unlisted',
	missing,
})

const cases: [string, ToolRequest, Resolution][] = [
	// 1
	['a plain tool runs no model', request({ grade: null }, ['text', 'text', 'text']), { kind: 'plain' }],
	// 2
	[
		'the map applies at the declared grade',
		request({ grade: 'standard' }, ['text', 'tools', 'both']),
		runs('tools', 'standard', 'standard', 'map', false),
	],
	// 3
	[
		'the tool override beats the domain override',
		request({ grade: 'light' }, ['text', 'text', 'text'], {
			tools: { 'kitchen.plan': ref('eyes') },
			domains: { kitchen: ref('both') },
		}),
		runs('eyes', 'light', 'light', 'tool-override', false),
	],
	[
		'the domain override beats the map',
		request({ grade: 'light' }, ['text', 'text', 'text'], {
			tools: { 'kitchen.other': ref('eyes'), 'toolbench.plan': ref('eyes') },
			domains: { kitchen: ref('both') },
		}),
		runs('both', 'light', 'light', 'domain-override', false),
	],
	// 4
	[
		'a light tool needing vision runs at standard when only its model has it',
		request({ grade: 'light', needs: ['vision'] }, ['text', 'eyes', 'tools']),
		runs('eyes', 'standard', 'light', 'map', true, [passed('text', ['vision'])]),
	],
	// 5
	[
		'it skips two grades when only deep has the flag',
		request({ grade: 'light', needs: ['vision'] }, ['text', 'tools', 'eyes']),
		runs('eyes', 'deep', 'light', 'map', true, [passed('text', ['vision']), passed('tools', ['vision'])]),
	],
	// 6
	[
		'never down: a deep tool whose deep model lacks tools is unavailable, though light and standard have it',
		request({ grade: 'deep', needs: ['tools'] }, ['tools', 'both', 'eyes']),
		{
			kind: 'unavailable',
			declared: 'deep',
			reason: 'no-capable-model',
			missing: ['tools'],
			skipped: [passed('eyes', ['tools'])],
		},
	],
	// 7
	[
		'one model: a light tool runs on it',
		request({ grade: 'light' }, ['text', 'text', 'text']),
		runs('text', 'light', 'light', 'map', false),
	],
	[
		'one model: a standard tool runs on it',
		request({ grade: 'standard' }, ['text', 'text', 'text']),
		runs('text', 'standard', 'standard', 'map', false),
	],
	[
		'one model: a deep tool runs on it',
		request({ grade: 'deep' }, ['text', 'text', 'text']),
		runs('text', 'deep', 'deep', 'map', true),
	],
	[
		'one model: lacking a flag, the tool is unavailable and the model is listed once',
		request({ grade: 'light', needs: ['vision'] }, ['text', 'text', 'text']),
		{
			kind: 'unavailable',
			declared: 'light',
			reason: 'no-capable-model',
			missing: ['vision'],
			skipped: [passed('text', ['vision'])],
		},
	],
	// 8
	[
		'a context size escalates to the model that holds it',
		request({ grade: 'light', minContext: 500_000 }, ['tools', 'tools', 'long']),
		runs('long', 'deep', 'light', 'map', true, [passed('tools', ['context'])]),
	],
	[
		'a context size no model holds is unavailable',
		request({ grade: 'light', minContext: 2_000_000 }, ['tools', 'both', 'long']),
		{
			kind: 'unavailable',
			declared: 'light',
			reason: 'no-capable-model',
			missing: ['context'],
			skipped: [passed('tools', ['context']), passed('both', ['context']), passed('long', ['context'])],
		},
	],
	// 9
	[
		'two needs are met only by the grade that has both',
		request({ grade: 'light', needs: ['tools', 'vision'] }, ['tools', 'both', 'eyes']),
		runs('both', 'standard', 'light', 'map', true, [passed('tools', ['vision'])]),
	],
	// 10
	[
		'an override that lacks a need, or names a model no provider lists, is passed over and recorded',
		request({ grade: 'light', needs: ['vision'] }, ['eyes', 'both', 'both'], {
			tools: { 'kitchen.plan': ref('tools') },
			domains: { kitchen: ref('retired') },
		}),
		runs('eyes', 'light', 'light', 'map', false, [
			passed('tools', ['vision'], 'tool-override'),
			passed('retired', ['vision'], 'domain-override'),
		]),
	],
	// 11
	[
		'a map that names a model no provider lists is treated as lacking',
		request({ grade: 'light' }, ['retired', 'text', 'text']),
		runs('text', 'standard', 'light', 'map', true, [passed('retired', [])]),
	],
	// 12
	[
		'no map is no provider',
		request({ grade: 'standard' }, null),
		{ kind: 'unavailable', declared: 'standard', reason: 'no-provider', missing: [], skipped: [] },
	],
	// 13
	[
		'confirm: a declared deep tool',
		request({ grade: 'deep' }, ['text', 'tools', 'both']),
		runs('both', 'deep', 'deep', 'map', true),
	],
	[
		'confirm: a deep tool on an override',
		request({ grade: 'deep' }, ['text', 'tools', 'both'], { domains: { kitchen: ref('text') } }),
		runs('text', 'deep', 'deep', 'domain-override', true),
	],
	[
		'confirm: standard to deep',
		request({ grade: 'standard', needs: ['vision'] }, ['text', 'tools', 'both']),
		runs('both', 'deep', 'standard', 'map', true, [passed('tools', ['vision'])]),
	],
	[
		'no confirm: a light tool at its grade',
		request({ grade: 'light', needs: ['tools'] }, ['tools', 'both', 'both']),
		runs('tools', 'light', 'light', 'map', false),
	],
	[
		'no confirm: a standard tool at its grade',
		request({ grade: 'standard', needs: ['vision'] }, ['text', 'eyes', 'both']),
		runs('eyes', 'standard', 'standard', 'map', false),
	],
]

describe('resolveTool', () => {
	for (const [name, given, expected] of cases) {
		it(name, () => expect(resolveTool(given)).toEqual(expected))
	}

	it('reads the override of the domain that declares the tool, keyed <domain>.<tool>', () => {
		const overrides = { tools: { 'toolbench.plan': ref('eyes') } }
		expect(resolveTool({ ...request({ grade: 'light' }, ['text', 'text', 'text'], overrides) })).toMatchObject({
			model: 'text',
			source: 'map',
		})
		expect(
			resolveTool({ ...request({ grade: 'light' }, ['text', 'text', 'text'], overrides), domain: 'toolbench' })
		).toMatchObject({ model: 'eyes', source: 'tool-override' })
	})
})

describe('resolveGrade', () => {
	it("runs the conversation at the owner's grade, deep included, and asks nothing more", () => {
		expect(resolveGrade('standard', [], map('text', 'tools', 'both'), models)).toEqual(
			runs('tools', 'standard', 'standard', 'map', false)
		)
		expect(resolveGrade('deep', [], map('text', 'tools', 'both'), models)).toEqual(
			runs('both', 'deep', 'deep', 'map', false)
		)
	})

	it('confirms a move above that grade, for a need its model lacks', () => {
		expect(resolveGrade('standard', ['vision'], map('text', 'tools', 'both'), models)).toEqual(
			runs('both', 'deep', 'standard', 'map', true, [passed('tools', ['vision'])])
		)
	})

	it('is unavailable with no provider, and never goes down', () => {
		expect(resolveGrade('light', [], null, models)).toMatchObject({ kind: 'unavailable', reason: 'no-provider' })
		expect(resolveGrade('deep', ['vision'], map('eyes', 'eyes', 'tools'), models)).toMatchObject({
			kind: 'unavailable',
			reason: 'no-capable-model',
			missing: ['vision'],
		})
	})
})
