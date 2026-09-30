// The tool registry (docs/product/substrate/ai.md, "Tools"): the substrate's own tools, declared here in code since
// no manifest holds them, joined with every domain's declared tools to the schema and the words the model is given.
// A tool's declaration is its contract with the grant store and the pack; its schema is what the API sees. The shell
// rejects a tool that names a resource outside the registry or any T3 resource (`validateTools`).
import type { DomainDeclaration, ToolDeclaration } from '../manifest/types.js'
import { resource, RESOURCES } from '../registry/index.js'

/** The subset of JSON Schema a tool's input may use: no bounds, no patterns, every object closed. */
export interface JsonSchema {
	type: 'object' | 'string' | 'integer' | 'number' | 'boolean' | 'array'
	description?: string
	enum?: readonly string[]
	properties?: Readonly<Record<string, JsonSchema>>
	required?: readonly string[]
	additionalProperties?: false
	items?: JsonSchema
}

/** The domain the substrate's tools are declared under. */
export const SUBSTRATE = 'substrate'

/** Every live fact type in the registry: what `what-you-know-about-me` may read, grants allowing. */
const LIVE_FACTS = RESOURCES.filter((row) => row.category === 'fact' && row.live).map((row) => row.id)

const plain = { grade: null, needs: [], minContext: null } as const

/** The substrate's tools with the grades of ai.md: `summarize-day` is standard, the rest are plain. */
export const SUBSTRATE_TOOLS: readonly ToolDeclaration[] = [
	{ id: 'create-task', access: 'write-draft', confirm: false, reads: ['task'], ...plain },
	{ id: 'complete-task', access: 'write', confirm: true, reads: ['task'], ...plain },
	{
		id: 'summarize-day',
		access: 'read',
		confirm: false,
		reads: ['task', 'event'],
		grade: 'standard',
		needs: [],
		minContext: null,
	},
	{ id: 'what-you-know-about-me', access: 'read', confirm: false, reads: LIVE_FACTS, ...plain },
	{ id: 'log-quick', access: 'write', confirm: true, reads: [], ...plain },
	{ id: 'propose-fact', access: 'write-draft', confirm: false, reads: [], ...plain },
]

export interface GardenerTool {
	/** `substrate` for the substrate's own; a domain id otherwise. */
	domain: string
	declaration: ToolDeclaration
	/** The name the API sees: the id for the substrate's, `<domain>_<id>` otherwise. */
	wireName: string
	description: string
	schema: JsonSchema
}

const text = (description?: string): JsonSchema => (description ? { type: 'string', description } : { type: 'string' })
const integer = (description: string): JsonSchema => ({ type: 'integer', description })
const object = (properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema => ({
	type: 'object',
	properties,
	required,
	additionalProperties: false,
})

const DAY = 'A day as YYYY-MM-DD.'
const IDS = 'Ids come from the context; never invent one.'

/**
 * The words and the input shape of every tool the Gardener may call, keyed by the bare id for the substrate's and
 * `<domain>.<id>` for a domain's. A declared tool without a row here, or a row without a declaration, fails
 * `validateTools`.
 */
export const SCHEMAS: Readonly<Record<string, { description: string; schema: JsonSchema }>> = {
	'create-task': {
		description:
			'Drafts a task for the owner to keep or discard. Use it when they ask you to remember, plan or do something later; the draft is shown as a card, nothing is stored until they commit it.',
		schema: object(
			{
				title: text('What is to be done, in the owner’s words.'),
				due: text(`When it is due: ${DAY}`),
				timeOfDay: text('A time of day as HH:MM, when one was given.'),
				priority: { type: 'string', enum: ['low', 'high'], description: 'Only when the owner said so.' },
				notes: text('Anything beyond the title.'),
			},
			['title']
		),
	},
	'complete-task': {
		description: `Marks a task done. The owner confirms first. ${IDS}`,
		schema: object({ taskId: text('The id of the task, from the context.') }, ['taskId']),
	},
	'summarize-day': {
		description:
			'Answers what the day holds from the tasks and events you can see: due, timed and left over. Use it for “what is on today” and “how does tomorrow look”; today when no day is given.',
		schema: object({ day: text(DAY) }),
	},
	'what-you-know-about-me': {
		description:
			'Answers the facts you hold about the owner, exactly those the current grants allow, and nothing more. Use it when they ask what you know or remember about them.',
		schema: object({}),
	},
	'log-quick': {
		description:
			'Sends one quick log entry to a domain’s quick action, such as a weight or a meal. The owner confirms first. Use it only for a domain and an action you can see are declared.',
		schema: object(
			{
				domain: text('The domain id, such as kitchen.'),
				action: text('The quick action id the domain declares.'),
				value: text('The value logged, as text.'),
			},
			['domain', 'action', 'value']
		),
	},
	'propose-fact': {
		description:
			'Offers a fact about the owner you inferred from what they said, as a card they accept or dismiss. Use it sparingly, for a typed fact the registry has, never for passing remarks.',
		schema: object(
			{
				type: text('The registry fact type, such as dietary-preference.'),
				value: text('The value as text; the shell shapes it.'),
				confidence: { type: 'number', description: 'How sure you are, 0 to 1.' },
				text: text('What you noticed, in one sentence.'),
			},
			['type', 'value', 'confidence', 'text']
		),
	},
	'kitchen.suggest-recipes': {
		description:
			'Suggests recipes the owner can cook from the stock you can see, minding their allergies and preferences. Use it when they ask what to cook.',
		schema: object({
			count: integer('How many to suggest; a few when unsaid.'),
			constraints: text('Anything they asked for: quick, vegetarian, uses the leeks.'),
		}),
	},
	'kitchen.storage-tip': {
		description:
			'Answers how to keep one stock item fresh and for how long. Use it for a named item or a stock item id from the context.',
		schema: object({
			stockItemId: text(`A stock item id. ${IDS}`),
			name: text('The item’s name when there is no id.'),
		}),
	},
	'kitchen.capture-haul': {
		description:
			'Reads a haul photo the owner captured and drafts the stock items on it, for them to check before anything is kept. Use it only when a photo was captured for it.',
		schema: object({}),
	},
	'kitchen.draft-grocery-list': {
		description:
			'Drafts a grocery list from the recipes chosen and the stock you can see, as a card the owner edits and keeps. Use it when they ask what to buy.',
		schema: object({
			forRecipeIds: { type: 'array', items: text(), description: `Recipe ids to cook. ${IDS}` },
			days: integer('How many days the list should cover.'),
			notes: text('Anything to mind: a guest, a budget, a shop.'),
		}),
	},
	'kitchen.add-stock': {
		description:
			'Adds items to the pantry. The owner confirms first. Use it when they tell you what they bought or have.',
		schema: object(
			{
				items: {
					type: 'array',
					items: object(
						{
							name: text('The item.'),
							qty: text('The amount, as text: 2, 500 g, half.'),
							unit: text('The unit when it is not in qty.'),
							location: { type: 'string', enum: ['fridge', 'freezer', 'pantry', 'counter'] },
							expiry: text(`When it expires: ${DAY}`),
						},
						['name', 'qty', 'location']
					),
				},
			},
			['items']
		),
	},
	'kitchen.plan-week': {
		description:
			'Drafts a week of meals with the shopping and the cooking tasks, around the events and tasks you can see, as one plan card. Use it when the owner asks to plan the week.',
		schema: object({
			from: text(`The first day: ${DAY}`),
			days: integer('How many days; seven when unsaid.'),
			notes: text('What to mind: guests, a busy evening, a budget.'),
		}),
	},
	'toolbench.brainstorm': {
		description:
			'Thinks through an idea with the owner, from their skills and hardware you can see. Use it when they want to explore an idea rather than plan it.',
		schema: object({ ideaId: text(`The idea. ${IDS}`), prompt: text('Where to take it, when they said.') }, ['ideaId']),
	},
	'toolbench.critique': {
		description:
			'Gives an honest critique of an idea or a project: what is weak, what is missing, what to check first. Use it when the owner asks what you think.',
		schema: object({ ideaId: text(`An idea. ${IDS}`), projectId: text(`A project. ${IDS}`) }),
	},
	'toolbench.expand-to-plan': {
		description:
			'Turns an idea into a project plan: the steps as task drafts, in order, as a card the owner keeps or discards. Use it when they are ready to start.',
		schema: object(
			{ ideaId: text(`The idea. ${IDS}`), projectId: text('A project to plan under, when there is one.') },
			['ideaId']
		),
	},
	'toolbench.find-similar': {
		description:
			'Finds the ideas, projects and notes closest to a piece of text, by their words. Use it before brainstorming, to see what the owner already has.',
		schema: object({ text: text('What to look for.'), limit: integer('How many to answer with.') }, ['text']),
	},
	'toolbench.estimate-parts-cost': {
		description: `Sums a project’s parts list at the prices it holds. Use it when the owner asks what a build costs. ${IDS}`,
		schema: object({ projectId: text('The project.') }, ['projectId']),
	},
	'toolbench.summarize-project': {
		description:
			'Answers where a project stands: what is done, what is next, what is blocked, from the project and its tasks. Use it when the owner asks for a status.',
		schema: object({ projectId: text(`The project. ${IDS}`) }, ['projectId']),
	},
	'toolbench.draft-sketch-scaffold': {
		description:
			'Drafts a starting sketch of code for a tool the owner uses, from a description, as a code card. Use it when they ask for a scaffold, never for a finished program.',
		schema: object(
			{
				description: text('What the sketch should do.'),
				tool: text('The tool or language, when they named one; their preferred tool otherwise.'),
				sketchId: text(`An existing sketch to build on. ${IDS}`),
			},
			['description']
		),
	},
	'weather.forecast': {
		description:
			'Answers the forecast for the owner’s home area on a day, from what Sky holds. Use it for any question about the weather; today when no day is given.',
		schema: object({ day: text(DAY) }),
	},
	'weather.rain-during-plan': {
		description:
			'Answers whether rain is expected during a window, a task or an event you can see. Use it when the owner asks about the weather for something planned.',
		schema: object({
			from: text('The start, as an ISO instant.'),
			to: text('The end, as an ISO instant.'),
			taskId: text(`A task. ${IDS}`),
			eventId: text(`An event. ${IDS}`),
		}),
	},
	'weather.sun-and-moon': {
		description: 'Answers sunrise, sunset and the moon for a day, from the ephemeris. Today when no day is given.',
		schema: object({ day: text(DAY) }),
	},
}

const WIRE_NAME = /^[a-zA-Z0-9_-]{1,64}$/

/** The name the API sees: the id for the substrate's tools, `<domain>_<id>` otherwise. */
export function wireName(domain: string, id: string): string {
	return domain === SUBSTRATE ? id : `${domain}_${id}`
}

/** The tool a wire name means, from the index; nothing for a name it does not hold. */
export function parseWireName(name: string, index: readonly GardenerTool[]): GardenerTool | undefined {
	return index.find((tool) => tool.wireName === name)
}

const schemaKey = (domain: string, id: string) => (domain === SUBSTRATE ? id : `${domain}.${id}`)

function join(domain: string, declaration: ToolDeclaration): GardenerTool {
	const entry = SCHEMAS[schemaKey(domain, declaration.id)]
	return {
		domain,
		declaration,
		wireName: wireName(domain, declaration.id),
		description: entry?.description ?? '',
		schema: entry?.schema ?? object({}),
	}
}

/** Every tool the Gardener may call: the substrate's, then each domain's in the order given. */
export function toolIndex(declarations: readonly DomainDeclaration[]): GardenerTool[] {
	return [
		...SUBSTRATE_TOOLS.map((declaration) => join(SUBSTRATE, declaration)),
		...declarations.flatMap((domain) => domain.tools.map((declaration) => join(domain.id, declaration))),
	]
}

/** The most tools one request may mark strict: the API's limit. */
export const STRICT_LIMIT = 20

/** Whether a tool's input is held to its schema by the API: the ones that write or draft, where a stray field or a
 * missing one would store the wrong thing. A read tool's handler reads its input loosely instead. */
export function isStrict(tool: GardenerTool): boolean {
	return tool.declaration.access !== 'read'
}

/** The tool as the API takes it. */
export function toApiTool(tool: GardenerTool): {
	name: string
	description: string
	input_schema: JsonSchema
	strict?: true
} {
	const api = { name: tool.wireName, description: tool.description, input_schema: tool.schema }
	return isStrict(tool) ? { ...api, strict: true } : api
}

/** The tools in the order a surface offers them: the domain's first, then the substrate's, then the rest. */
export function toolsFor(index: readonly GardenerTool[], domain?: string): GardenerTool[] {
	const rank = (tool: GardenerTool) => (tool.domain === domain ? 0 : tool.domain === SUBSTRATE ? 1 : 2)
	return [...index].sort((a, b) => rank(a) - rank(b))
}

const BOUNDS = ['minimum', 'maximum', 'minLength', 'maxLength', 'pattern'] as const

function schemaProblems(what: string, schema: JsonSchema, path: string): string[] {
	const problems: string[] = []
	for (const bound of BOUNDS) {
		if (bound in schema) problems.push(`${what}: ${path} uses ${bound}`)
	}
	if (schema.type === 'object') {
		if (schema.additionalProperties !== false) problems.push(`${what}: ${path} is an open object`)
		for (const [name, property] of Object.entries(schema.properties ?? {})) {
			problems.push(...schemaProblems(what, property, `${path}.${name}`))
		}
	}
	if (schema.items) problems.push(...schemaProblems(what, schema.items, `${path}[]`))
	return problems
}

/**
 * What is wrong with the index, or nothing: a read outside the registry or of a T3 resource, a wire name that is
 * taken or that the API would not accept, a schema that is open or bounded, a declared tool with no words and no
 * shape, and words with no declaration.
 */
export function validateTools(index: readonly GardenerTool[]): string[] {
	const problems: string[] = []
	const names = new Set<string>()
	const keys = new Set<string>()
	for (const tool of index) {
		const key = schemaKey(tool.domain, tool.declaration.id)
		const what = `${key}`
		keys.add(key)
		for (const read of tool.declaration.reads) {
			const row = resource(read)
			if (!row) problems.push(`${what}: reads ${JSON.stringify(read)}, which the registry does not hold`)
			else if (row.tier === 'T3') problems.push(`${what}: reads ${read}, which is T3`)
		}
		if (names.has(tool.wireName)) problems.push(`${what}: the wire name ${tool.wireName} is taken`)
		names.add(tool.wireName)
		if (!WIRE_NAME.test(tool.wireName)) problems.push(`${what}: ${JSON.stringify(tool.wireName)} is not a wire name`)
		if (!SCHEMAS[key]) problems.push(`${what}: has no schema`)
		else problems.push(...schemaProblems(what, tool.schema, 'input'))
	}
	for (const key of Object.keys(SCHEMAS)) {
		if (!keys.has(key)) problems.push(`${key}: has a schema and no declaration`)
	}
	return problems
	if (index.filter(isStrict).length > STRICT_LIMIT)
		problems.push(`${index.filter(isStrict).length} strict tools; the API takes ${STRICT_LIMIT} at most`)
}
