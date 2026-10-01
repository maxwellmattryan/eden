import { describe, expect, it } from 'vitest'
import { declarations } from '../manifest/index.js'
import { RESOURCES } from '../registry/index.js'
import { ANTHROPIC, ANTHROPIC_SEED, gradeMapOf, modelLookup, PROVIDERS } from './providers.js'
import { resolveTool } from './resolve.js'
import {
	DOMAIN_BLURBS,
	factShapeWords,
	parseWireName,
	PROPOSABLE_FACTS,
	QUICK_ACTION_WORDS,
	quickActionsFor,
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
	LOOSE,
	OPTIONAL_LIMIT,
	optionalCount,
	STRICT_LIMIT,
} from './tools.js'

const index = toolIndex(declarations)

describe('the tool index', () => {
	it('validates, and holds the twenty-eight tools', () => {
		expect(validateTools(index)).toEqual([])
		expect(index).toHaveLength(28)
		expect(Object.keys(SCHEMAS)).toHaveLength(28)
	})

	it('has a line for every declared domain, and none for another', () => {
		expect(Object.keys(DOMAIN_BLURBS).sort()).toEqual(declarations.map((domain) => domain.id).sort())
		for (const blurb of Object.values(DOMAIN_BLURBS)) expect(blurb.trim().length).toBeGreaterThan(20)
	})

	it('offers log-quick the quick actions it has words for, of the domains given', () => {
		const tool = parseWireName('log-quick', index)!
		expect(quickActionsFor(declarations)).toEqual(['kitchen.add-to-grocery', 'toolbench.capture-idea'])
		expect(tool.schema.properties?.action?.enum).toEqual(['kitchen.add-to-grocery', 'toolbench.capture-idea'])
		expect(tool.schema.required).toEqual(['action', 'value'])
		expect(tool.description).toContain('- kitchen.add-to-grocery: puts one item on a grocery list')
		// every line is a declared quick action, so none can name one that is gone
		const declared = declarations.flatMap((domain) => domain.quickActions.map((action) => `${domain.id}.${action.id}`))
		for (const action of Object.keys(QUICK_ACTION_WORDS)) expect(declared).toContain(action)
		// a workspace with one domain is offered that domain's alone, and one with none has no such tool
		const kitchen = declarations.filter((domain) => domain.id === 'kitchen')
		expect(parseWireName('log-quick', toolIndex(kitchen))?.schema.properties?.action?.enum).toEqual([
			'kitchen.add-to-grocery',
		])
		const weather = toolIndex(declarations.filter((domain) => domain.id === 'weather'))
		expect(parseWireName('log-quick', weather)).toBeUndefined()
		expect(validateTools(weather).filter((problem) => problem.startsWith('log-quick'))).toEqual([])
	})

	it('tells propose-fact the types it may propose and the shape of each value', () => {
		const tool = parseWireName('propose-fact', index)!
		expect(tool.schema.properties?.type?.enum).toEqual(PROPOSABLE_FACTS)
		expect(PROPOSABLE_FACTS).toContain('allergy')
		// the substrate derives the home area; a model never proposes it
		expect(PROPOSABLE_FACTS).not.toContain('home-area')
		expect(tool.description).toContain(
			'- allergy: {"substance": a word or a short phrase, "kind": one of food, drug, environmental, "severity": one of mild, moderate, severe}'
		)
		expect(tool.description).toContain('- household-size: a whole number from 1 to 20')
		expect(tool.description).toContain('- cuisine-preference: {"name": a word, "weight": how much it counts, 0 to 1}')
		expect(factShapeWords('dietary-preference')).toContain('or another word when none fits')
		expect(factShapeWords('nothing')).toBeUndefined()
	})

	it('says of every tool what it does and what comes back', () => {
		for (const tool of index) {
			expect(tool.description.length, tool.wireName).toBeGreaterThan(150)
			for (const [name, property] of Object.entries(tool.schema.properties ?? {})) {
				expect(property.description ?? property.enum, `${tool.wireName}.${name}`).toBeTruthy()
			}
		}
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
			'summarize-day': 'light',
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

	it('shapes a tool for the API: strict where it writes or drafts, loose where it reads or writes in batches', () => {
		const tool = parseWireName('kitchen_plan-week', index)!
		expect(toApiTool(tool)).toEqual({
			name: 'kitchen_plan-week',
			description: tool.description,
			input_schema: tool.schema,
			strict: true,
		})
		expect(tool.schema).toMatchObject({ type: 'object', additionalProperties: false })
		expect(toApiTool(parseWireName('weather_forecast', index)!)).not.toHaveProperty('strict')
		// the batch writers are loose: their rows' optional fields would overrun the budget below
		for (const key of LOOSE) {
			const loose = parseWireName(key.replace('.', '_'), index)!
			expect(loose.declaration.access, key).not.toBe('read')
			expect(toApiTool(loose), key).not.toHaveProperty('strict')
		}
		// the API takes twenty strict tools at most, and every request may carry the whole index
		const strict = index.filter(isStrict)
		expect(strict.length).toBeLessThanOrEqual(STRICT_LIMIT)
		// and twenty-four optional parameters across them
		expect(optionalCount(parseWireName('kitchen_edit-grocery', index)!.schema)).toBe(19)
		expect(strict.reduce((sum, entry) => sum + optionalCount(entry.schema), 0)).toBeLessThanOrEqual(OPTIONAL_LIMIT)
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

		// a strict tool with more optional parameters than the API takes across all of them
		const wide = parseWireName('create-task', index)!
		const many = Object.fromEntries(
			Array.from({ length: OPTIONAL_LIMIT + 1 }, (_, at) => [`f${at}`, { type: 'string' }])
		)
		const over = validateTools([
			{
				...wide,
				schema: { type: 'object', properties: many, required: [], additionalProperties: false } as JsonSchema,
			},
		])
		expect(over).toContain(
			`${OPTIONAL_LIMIT + 1} optional parameters across the strict tools; the API takes ${OPTIONAL_LIMIT} at most`
		)
		// a loose key on a tool that reads says nothing: it was never strict
		const edit = parseWireName('kitchen_edit-grocery', index)!
		expect(validateTools([{ ...edit, declaration: { ...edit.declaration, access: 'read' } }])).toContain(
			'kitchen.edit-grocery: is loose, and a read tool is never strict'
		)
	})
})
