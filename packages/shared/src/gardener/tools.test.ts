import { describe, expect, it } from 'vitest'
import { declarations } from '../manifest/index.js'
import { RESOURCES } from '../registry/index.js'
import { ANTHROPIC, ANTHROPIC_SEED, gradeMapOf, modelLookup, PROVIDERS } from './providers.js'
import { resolveTool } from './resolve.js'
import {
	parseWireName,
	SCHEMAS,
	SUBSTRATE,
	SUBSTRATE_TOOLS,
	toApiTool,
	toolIndex,
	toolsFor,
	validateTools,
	wireName,
	type GardenerTool,
	type JsonSchema,
	isStrict,
	STRICT_LIMIT,
} from './tools.js'

const index = toolIndex(declarations)

describe('the tool index', () => {
	it('validates, and holds the twenty-two tools', () => {
		expect(validateTools(index)).toEqual([])
		expect(index).toHaveLength(22)
		expect(Object.keys(SCHEMAS)).toHaveLength(22)
	})

	it('names each tool for the wire and reads the name back', () => {
		expect(wireName(SUBSTRATE, 'create-task')).toBe('create-task')
		expect(wireName('kitchen', 'plan-week')).toBe('kitchen_plan-week')
		for (const tool of index) {
			expect(tool.wireName).toBe(wireName(tool.domain, tool.declaration.id))
			expect(parseWireName(tool.wireName, index)).toBe(tool)
		}
		expect(parseWireName('nothing', index)).toBeUndefined()
	})

	it("gives the substrate's tools the grades of ai.md", () => {
		expect(Object.fromEntries(SUBSTRATE_TOOLS.map((tool) => [tool.id, tool.grade]))).toEqual({
			'create-task': null,
			'complete-task': null,
			'summarize-day': 'standard',
			'what-you-know-about-me': null,
			'log-quick': null,
			'propose-fact': null,
		})
		const facts = RESOURCES.filter((row) => row.category === 'fact' && row.live).map((row) => row.id)
		expect(SUBSTRATE_TOOLS.find((tool) => tool.id === 'what-you-know-about-me')?.reads).toEqual(facts)
	})

	it('resolves every model-backed tool on the seed', () => {
		const map = gradeMapOf(ANTHROPIC_SEED)
		const models = modelLookup(PROVIDERS)
		for (const { domain, declaration } of index) {
			const resolved = resolveTool({ tool: declaration, domain, map, models })
			if (declaration.grade === null) expect(resolved).toEqual({ kind: 'plain' })
			else
				expect(resolved).toMatchObject({
					kind: 'model',
					provider: ANTHROPIC,
					model: ANTHROPIC_SEED.grades[declaration.grade],
					grade: declaration.grade,
				})
		}
	})

	it('shapes a tool for the API: strict where it writes or drafts, loose where it reads', () => {
		const tool = parseWireName('kitchen_add-stock', index)!
		expect(toApiTool(tool)).toEqual({
			name: 'kitchen_add-stock',
			description: tool.description,
			input_schema: tool.schema,
			strict: true,
		})
		expect(tool.schema).toMatchObject({ type: 'object', required: ['items'], additionalProperties: false })
		expect(toApiTool(parseWireName('weather_forecast', index)!)).not.toHaveProperty('strict')
		// the API takes twenty strict tools at most, and every request may carry the whole index
		expect(index.filter(isStrict).length).toBeLessThanOrEqual(STRICT_LIMIT)
	})

	it("orders a surface's tools: the domain's, the substrate's, the rest", () => {
		const domains = toolsFor(index, 'toolbench').map((tool) => tool.domain)
		const first = domains.indexOf('toolbench')
		const last = domains.lastIndexOf('toolbench')
		expect(first).toBe(0)
		expect(domains.slice(last + 1, last + 1 + SUBSTRATE_TOOLS.length)).toEqual(
			Array<string>(SUBSTRATE_TOOLS.length).fill(SUBSTRATE)
		)
		expect(
			toolsFor(index)
				.map((tool) => tool.domain)
				.slice(0, SUBSTRATE_TOOLS.length)
		).toEqual(Array<string>(SUBSTRATE_TOOLS.length).fill(SUBSTRATE))
	})

	it('names what is wrong with an index', () => {
		const base = parseWireName('summarize-day', index)!
		const bad: GardenerTool[] = [
			{ ...base, declaration: { ...base.declaration, reads: ['secret-sauce', 'identity-document'] as never } },
			{ ...base, wireName: 'summarize-day' },
			{
				...base,
				domain: 'kitchen',
				declaration: { ...base.declaration, id: 'storage-tip' },
				wireName: 'kitchen storage tip',
				schema: { type: 'object', properties: { n: { type: 'integer', minimum: 1 } } } as JsonSchema,
			},
			{ ...base, domain: 'kitchen', declaration: { ...base.declaration, id: 'unknown' }, wireName: 'kitchen_unknown' },
		]
		const problems = validateTools(bad)
		expect(problems).toContain('summarize-day: reads "secret-sauce", which the registry does not hold')
		expect(problems).toContain('summarize-day: reads identity-document, which is T3')
		expect(problems).toContain('summarize-day: the wire name summarize-day is taken')
		expect(problems).toContain('kitchen.storage-tip: "kitchen storage tip" is not a wire name')
		expect(problems).toContain('kitchen.storage-tip: input is an open object')
		expect(problems).toContain('kitchen.storage-tip: input.n uses minimum')
		expect(problems).toContain('kitchen.unknown: has no schema')
		expect(problems).toContain('create-task: has a schema and no declaration')
	})
})
