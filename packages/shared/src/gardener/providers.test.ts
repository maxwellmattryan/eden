import { describe, expect, it } from 'vitest'
import { cacheWritePrice } from './estimate.js'
import { declarations } from '../manifest/index.js'
import {
	ANTHROPIC,
	ANTHROPIC_SEED,
	effectiveProvider,
	effortEdit,
	gradeMapOf,
	modelLookup,
	priceRatio,
	PROVIDERS,
	validateProvider,
} from './providers.js'
import { resolveTool } from './resolve.js'
import type { ModelRow, ProviderRow } from './types.js'

const seeded = (id: string) => ANTHROPIC_SEED.models.find((model) => model.id === id) as ModelRow

describe('the seed', () => {
	it('validates, and lists the four models with their verified context and pricing', () => {
		expect(PROVIDERS.map((provider) => provider.id)).toEqual([ANTHROPIC])
		expect(validateProvider(ANTHROPIC_SEED)).toEqual([])
		expect(
			ANTHROPIC_SEED.models.map(({ id, flags, contextTokens, pricing }) => [id, flags, contextTokens, pricing])
		).toEqual([
			[
				'claude-haiku-4-5-20251001',
				['tools', 'vision', 'search'],
				200_000,
				{ input: 1, output: 5, cacheRead: 0.1, search: 0.01 },
			],
			[
				'claude-sonnet-5-5',
				['tools', 'vision', 'search'],
				1_000_000,
				{ input: 2, output: 10, cacheRead: 0.2, search: 0.01 },
			],
			[
				'claude-opus-5-5',
				['tools', 'vision', 'search'],
				1_000_000,
				{ input: 4, output: 20, cacheRead: 0.2, search: 0.01 },
			],
			[
				'claude-fable-5-1',
				['tools', 'vision', 'search'],
				1_000_000,
				{ input: 10, output: 50, cacheRead: 0.25, search: 0.01 },
			],
		])
	})

	it('prices a cache write at a quarter over the input, and takes a row that names its own', () => {
		for (const model of ANTHROPIC_SEED.models) expect(cacheWritePrice(model.pricing)).toBe(model.pricing.input * 1.25)
		const first = ANTHROPIC_SEED.models[0]!
		const rest = ANTHROPIC_SEED.models.slice(1)
		const own = { ...first, pricing: { ...first.pricing, cacheWrite: 2 } }
		expect(validateProvider({ ...ANTHROPIC_SEED, models: [own, ...rest] })).toEqual([])
		const wrong = { ...first, pricing: { ...first.pricing, cacheWrite: -1 } }
		expect(validateProvider({ ...ANTHROPIC_SEED, models: [wrong, ...rest] })).toHaveLength(1)
	})

	it('prices a web search by the search, names the provider’s own search tool, and refuses a fee that is not one', () => {
		for (const model of ANTHROPIC_SEED.models) expect(model.pricing.search).toBe(0.01)
		expect(ANTHROPIC_SEED.serverTools?.search).toEqual({ type: 'web_search_20250305', name: 'web_search' })
		const first = ANTHROPIC_SEED.models[0]!
		const rest = ANTHROPIC_SEED.models.slice(1)
		const free = { ...first, pricing: { input: 1, output: 5, cacheRead: 0.1 } }
		expect(validateProvider({ ...ANTHROPIC_SEED, models: [free, ...rest] })).toEqual([])
		const wrong = { ...first, pricing: { ...first.pricing, search: -0.01 } }
		expect(validateProvider({ ...ANTHROPIC_SEED, models: [wrong, ...rest] })).toEqual([
			'anthropic: the model "claude-haiku-4-5-20251001" costs -0.01 per search; a number, zero or more',
		])
		// the owner's edits keep the server tool, and may change what a search costs
		const { provider } = effectiveProvider(ANTHROPIC_SEED, { models: [{ id: first.id, pricing: { search: 0.02 } }] })
		expect(provider.serverTools).toEqual(ANTHROPIC_SEED.serverTools)
		expect(provider.models[0]!.pricing).toMatchObject({ input: 1, search: 0.02 })
	})

	it('runs the models that reason at medium effort, and sends the light one none (D-146)', () => {
		expect(ANTHROPIC_SEED.models.map((model) => model.effort)).toEqual([undefined, 'medium', 'medium', 'medium'])
		expect(seeded('claude-haiku-4-5-20251001').efforts).toBeUndefined()
		expect(seeded('claude-sonnet-5-5').efforts).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
		const haiku = { ...seeded('claude-haiku-4-5-20251001'), effort: 'medium' }
		expect(validateProvider({ ...ANTHROPIC_SEED, models: [haiku, ...ANTHROPIC_SEED.models.slice(1)] })).toEqual([
			'anthropic: the model "claude-haiku-4-5-20251001" runs at the effort "medium", which it does not take',
		])
		// the owner's level is an edit over the seed, kept beside their other edits and gone where it says the same
		const priced = { models: [{ id: 'claude-sonnet-5-5', pricing: { input: 3 } }] }
		const low = effortEdit(ANTHROPIC_SEED, priced, 'claude-sonnet-5-5', 'low')
		expect(low.models).toEqual([{ id: 'claude-sonnet-5-5', pricing: { input: 3 }, effort: 'low' }])
		const { provider, refused } = effectiveProvider(ANTHROPIC_SEED, low)
		expect(refused).toEqual([])
		expect(provider.models[1]).toMatchObject({ effort: 'low', thinks: true, pricing: { input: 3 } })
		expect(effortEdit(ANTHROPIC_SEED, low, 'claude-sonnet-5-5', 'medium')).toEqual(priced)
		expect(effortEdit(ANTHROPIC_SEED, {}, 'claude-opus-5-5', 'medium').models).toEqual([])
		// a level the model does not take is refused, and the seed's stands
		const wrong = effectiveProvider(ANTHROPIC_SEED, { models: [{ id: 'claude-opus-5-5', effort: 'turbo' }] })
		expect(wrong.refused).toHaveLength(1)
		expect(wrong.provider.models[2]!.effort).toBe('medium')
	})

	it('maps Haiku, Sonnet and Opus to the three grades, and Fable to none', () => {
		expect(ANTHROPIC_SEED.grades).toEqual({
			light: 'claude-haiku-4-5-20251001',
			standard: 'claude-sonnet-5-5',
			deep: 'claude-opus-5-5',
		})
		expect(Object.values(ANTHROPIC_SEED.grades)).not.toContain('claude-fable-5-1')
	})

	it('says how many times dearer one model is than another', () => {
		expect(priceRatio(seeded('claude-fable-5-1'), seeded('claude-opus-5-5'))).toBe(2.5)
		expect(priceRatio(seeded('claude-opus-5-5'), seeded('claude-sonnet-5-5'))).toBe(2)
		expect(priceRatio(seeded('claude-haiku-4-5-20251001'), seeded('claude-sonnet-5-5'))).toBe(0.5)
		// The larger of the two ratios; a free baseline makes any price infinitely dearer, and free against free is even.
		const priced = (input: number, output: number) => ({ pricing: { input, output, cacheRead: 0 } })
		expect(priceRatio(priced(3, 10), priced(1, 5))).toBe(3)
		expect(priceRatio(priced(1, 1), priced(0, 0))).toBe(Infinity)
		expect(priceRatio(priced(0, 0), priced(0, 0))).toBe(1)
	})
})

describe('the declared tools on the seed', () => {
	const tools = declarations.flatMap((declaration) =>
		declaration.tools.map((tool) => ({ domain: declaration.id, tool }))
	)

	it('carry the grades the owner agreed', () => {
		expect(
			Object.fromEntries(tools.map(({ domain, tool }) => [`${domain}.${tool.id}`, [tool.grade, tool.needs]]))
		).toEqual({
			'kitchen.suggest-recipes': ['standard', []],
			'kitchen.storage-tip': ['light', []],
			'kitchen.capture-haul': ['light', ['vision']],
			'kitchen.draft-grocery-list': ['standard', []],
			'kitchen.add-stock': [null, []],
			'kitchen.update-stock': [null, []],
			'kitchen.edit-grocery': [null, []],
			'kitchen.edit-stores': [null, []],
			'kitchen.import-recipe': ['light', ['vision']],
			'kitchen.save-recipe': [null, []],
			'kitchen.change-recipe': [null, []],
			'kitchen.plan-week': ['deep', ['tools']],
			'toolbench.brainstorm': ['deep', []],
			'toolbench.critique': ['deep', []],
			'toolbench.expand-to-plan': ['deep', []],
			'toolbench.find-similar': [null, []],
			'toolbench.estimate-parts-cost': [null, []],
			'toolbench.summarize-project': ['standard', []],
			'toolbench.draft-sketch-scaffold': ['deep', []],
			'weather.forecast': [null, []],
			'weather.rain-during-plan': [null, []],
			'weather.sun-and-moon': [null, []],
			'places.suggest-places': ['standard', ['search']],
			'places.suggest-listings': ['standard', ['search']],
			'places.import-places': ['standard', []],
			'places.add-to-calendar': [null, []],
			'places.update-places': [null, []],
		})
	})

	it('each resolve at the declared grade, and only a deep one asks first', () => {
		const map = gradeMapOf(ANTHROPIC_SEED)
		const models = modelLookup(PROVIDERS)
		for (const { domain, tool } of tools) {
			const resolved = resolveTool({ tool, domain, map, models })
			if (tool.grade === null) expect(resolved).toEqual({ kind: 'plain' })
			else
				expect(resolved).toEqual({
					kind: 'model',
					provider: ANTHROPIC,
					model: ANTHROPIC_SEED.grades[tool.grade],
					grade: tool.grade,
					declared: tool.grade,
					source: 'map',
					confirm: tool.grade === 'deep',
					skipped: [],
				})
		}
	})
})

describe('effectiveProvider', () => {
	it('is the seed when the owner edited nothing', () => {
		expect(effectiveProvider(ANTHROPIC_SEED)).toEqual({ provider: ANTHROPIC_SEED, refused: [] })
	})

	it('replaces one grade and leaves the rest to the seed', () => {
		const { provider, refused } = effectiveProvider(ANTHROPIC_SEED, { grades: { deep: 'claude-fable-5-1' } })
		expect(refused).toEqual([])
		expect(provider.grades).toEqual({ ...ANTHROPIC_SEED.grades, deep: 'claude-fable-5-1' })
		expect(validateProvider(provider)).toEqual([])
	})

	it('refuses a grade that names a model the provider does not list, and keeps the seed for it', () => {
		const { provider, refused } = effectiveProvider(ANTHROPIC_SEED, {
			grades: { light: 'claude-sonnet-5-5', deep: 'claude-retired' },
		})
		expect(refused).toEqual(['anthropic: the deep grade names "claude-retired", which the provider does not list'])
		expect(provider.grades).toEqual({ ...ANTHROPIC_SEED.grades, light: 'claude-sonnet-5-5' })
	})

	it("changes a model's pricing field by field, and adds a model the seed does not list when it is whole", () => {
		const added: ModelRow = {
			id: 'claude-next',
			flags: ['tools'],
			contextTokens: 400_000,
			pricing: { input: 3, output: 15, cacheRead: 0.3 },
		}
		const { provider, refused } = effectiveProvider(ANTHROPIC_SEED, {
			models: [{ id: 'claude-opus-5-5', pricing: { input: 5 } }, added, { id: 'claude-half', flags: ['tools'] }],
			grades: { standard: 'claude-next' },
		})
		expect(refused).toEqual([
			'anthropic: the model "claude-half" holds undefined tokens; a whole number above zero',
			'anthropic: the model "claude-half" costs undefined per million input tokens; a number, zero or more',
			'anthropic: the model "claude-half" costs undefined per million output tokens; a number, zero or more',
			'anthropic: the model "claude-half" costs undefined per million cacheRead tokens; a number, zero or more',
		])
		expect(provider.models.find((model) => model.id === 'claude-opus-5-5')?.pricing).toEqual({
			input: 5,
			output: 20,
			cacheRead: 0.2,
			search: 0.01,
		})
		expect(provider.models.at(-1)).toEqual(added)
		expect(provider.grades.standard).toBe('claude-next')
		// The seed itself is never changed.
		expect(seeded('claude-opus-5-5').pricing.input).toBe(4)
	})
})

describe('validateProvider', () => {
	it('names what is wrong with a row', () => {
		const row: ProviderRow = {
			id: 'Local AI',
			models: [
				{ id: 'one', flags: ['tools', 'tools'], contextTokens: 0, pricing: { input: -1, output: 0, cacheRead: 0 } },
				{ id: 'one', flags: [], contextTokens: 8_000, pricing: { input: 0, output: 0, cacheRead: 0 } },
			],
			grades: { light: 'one', standard: 'one', deep: 'two' },
		}
		expect(validateProvider(row)).toEqual([
			'"Local AI" is not a provider id',
			'Local AI: the model "one" lists a flag twice',
			'Local AI: the model "one" holds 0 tokens; a whole number above zero',
			'Local AI: the model "one" costs -1 per million input tokens; a number, zero or more',
			'Local AI: the model "one" is listed twice',
			'Local AI: the deep grade names "two", which the provider does not list',
		])
	})

	it('holds a provider with one model mapped to all three grades', () => {
		const one: ModelRow = {
			id: 'llama',
			flags: [],
			contextTokens: 8_000,
			pricing: { input: 0, output: 0, cacheRead: 0 },
		}
		expect(
			validateProvider({ id: 'ollama', models: [one], grades: { light: 'llama', standard: 'llama', deep: 'llama' } })
		).toEqual([])
	})
})
