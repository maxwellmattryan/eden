import { describe, expect, it } from 'vitest'
import { declarations } from '../manifest/index.js'
import {
	ANTHROPIC,
	ANTHROPIC_SEED,
	effectiveProvider,
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
			['claude-haiku-4-5-20251001', ['tools', 'vision'], 200_000, { input: 1, output: 5, cacheRead: 0.1 }],
			['claude-sonnet-5-5', ['tools', 'vision'], 1_000_000, { input: 2, output: 10, cacheRead: 0.2 }],
			['claude-opus-5-5', ['tools', 'vision'], 1_000_000, { input: 4, output: 20, cacheRead: 0.2 }],
			['claude-fable-5-1', ['tools', 'vision'], 1_000_000, { input: 10, output: 50, cacheRead: 0.25 }],
		])
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
