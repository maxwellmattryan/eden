// The tool registry (docs/product/substrate/ai.md, "Tools"): the substrate's own tools, declared here in code since
// no manifest holds them, joined with every domain's declared tools to the schema and the words the model is given.
// A tool's declaration is its contract with the grant store and the pack; its schema is what the API sees. The shell
// rejects a tool that names a resource outside the registry or any T3 resource (`validateTools`).
import { CATEGORIES, LOCATIONS, STORE_SELLS as STORE_SELLS_OPTIONS } from '../domains/kitchen/types.js'
import type { DomainDeclaration, ToolDeclaration } from '../manifest/types.js'
import { FACT_SHAPES, LIVE_FACT_TYPES, shapeOf, type ValueShape } from '../profile/shapes.js'
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

/** The substrate's tools with the grades of ai.md: `summarize-day` is light, the rest are plain. */
export const SUBSTRATE_TOOLS: readonly ToolDeclaration[] = [
	{ id: 'create-task', access: 'write-draft', confirm: false, reads: ['task'], ...plain },
	{ id: 'complete-task', access: 'write', confirm: true, reads: ['task'], ...plain },
	{
		id: 'summarize-day',
		access: 'read',
		confirm: false,
		reads: ['task', 'event', 'forecast', 'alert'],
		grade: 'light',
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

/**
 * The parts of a delegated request's answer schema (`Delegate.schema`, sent as the API's structured output): every
 * object closed and every field required, so an answer always has the whole shape and a field with nothing to say
 * is an empty string, a zero or an empty list.
 */
export const answer = {
	text,
	integer,
	oneOf: (options: readonly string[], description: string): JsonSchema => ({
		type: 'string',
		enum: options,
		description,
	}),
	list: (items: JsonSchema, description?: string): JsonSchema =>
		description ? { type: 'array', items, description } : { type: 'array', items },
	object: (properties: Record<string, JsonSchema>): JsonSchema => object(properties, Object.keys(properties)),
}

const DAY = 'A day as YYYY-MM-DD.'

const STOCK_LOCATION = (description: string): JsonSchema => ({ type: 'string', enum: LOCATIONS, description })
const STOCK_CATEGORY: JsonSchema = {
	type: 'string',
	enum: CATEGORIES,
	description: 'What kind of thing it is, when you can tell.',
}
const STORE_SELLS: JsonSchema = {
	type: 'array',
	items: { type: 'string', enum: STORE_SELLS_OPTIONS },
	description: 'What the owner buys there; `grocery` when unsaid.',
}
const RECIPE_LINE = object(
	{
		name: text('The ingredient alone, without its amount.'),
		qty: text('The amount alone: 2, 1/2, 200. An empty string when there is none.'),
		unit: text('The unit of the amount: g, ml, tbsp, cup, clove. Left out for a plain count.'),
		note: text('How it is prepared: minced, to taste. Left out when there is nothing to say.'),
	},
	['name', 'qty']
)
const SEPARATE = 'Runs a separate model request'
const COSTED = 'the owner is shown its cost and confirms before it runs'

/**
 * What each quick action a model may run does, and what its value is, keyed `<domain>.<action>`. A quick action
 * without a line here is not offered to `log-quick`: `capture-haul` is a tool of its own.
 */
export const QUICK_ACTION_WORDS: Readonly<Record<string, string>> = {
	'kitchen.add-to-grocery':
		'puts one item on a grocery list, the list of the store it was last bought at or else the unfiled one; `value` is the item, with its amount when one was given ("oat milk", "2 lemons")',
	'toolbench.capture-idea': 'saves a new idea in Toolbench; `value` is the idea in a sentence, which becomes its title',
}

/** A fact type's value as the model is told to write it. */
function shapeWords(shape: ValueShape): string {
	switch (shape.kind) {
		case 'string':
			return 'a word or a short phrase'
		case 'integer':
			return shape.min !== undefined && shape.max !== undefined
				? `a whole number from ${shape.min} to ${shape.max}`
				: 'a whole number'
		case 'enum':
			return `one of ${shape.options.join(', ')}${shape.custom ? ', or another word when none fits' : ''}`
		case 'weighted':
			return '{"name": a word, "weight": how much it counts, 0 to 1}'
		case 'object':
			return `{${shape.fields
				.map((field) => `"${field.key}"${field.required ? '' : ' (optional)'}: ${shapeWords(field.shape)}`)
				.join(', ')}}`
	}
}

/** The fact types a model may propose: the live ones the substrate does not derive itself. */
export const PROPOSABLE_FACTS: readonly string[] = LIVE_FACT_TYPES.filter((type) => !FACT_SHAPES[type].derived)

/** The shape of a proposable fact's value, as the tool's words and its errors give it. */
export function factShapeWords(type: string): string | undefined {
	const shape = shapeOf(type)
	return shape ? shapeWords(shape.shape) : undefined
}

function logQuick(actions: readonly string[]): { description: string; schema: JsonSchema } {
	return {
		description: [
			'Runs one of Eden’s quick actions with a value. The owner confirms on the card the first time, and can undo it. The actions:',
			...actions.map((action) => `- ${action}: ${QUICK_ACTION_WORDS[action]}`),
			'Returns `logged: true`. It does only these; anything else needs its own tool.',
		].join('\n'),
		schema: object(
			{
				action: { type: 'string', enum: actions, description: 'The quick action, from the list above.' },
				value: text('What is logged, as the action’s line describes.'),
			},
			['action', 'value']
		),
	}
}

/**
 * The words and the input shape of every tool the Gardener may call, keyed by the bare id for the substrate's and
 * `<domain>.<id>` for a domain's. A declared tool without a row here, or a row without a declaration, fails
 * `validateTools`. Each description says what the tool does, what comes back, when to use it and what it cannot do:
 * it is the tool's whole contract with the model, which sees nothing else of it. `log-quick` is narrowed by
 * `toolIndex` to the quick actions of the domains it is given.
 */
export const SCHEMAS: Readonly<Record<string, { description: string; schema: JsonSchema }>> = {
	'create-task': {
		description:
			'Drafts one task as a card in the thread, which the owner keeps or discards; nothing is saved until they keep it. Use it when they ask to be reminded of something or to add something to do, once per task. Work out a relative day ("Friday", "tomorrow") from today’s date in the system prompt and pass it as `due`; with no `due` the task lands on today when kept. Returns the draft’s title and due day. It cannot change or delete a task that exists.',
		schema: object(
			{
				title: text('What is to be done, in the owner’s words.'),
				due: text(`The day it is due, when the owner named one. ${DAY}`),
				timeOfDay: text('A time of day as HH:MM, 24-hour, when the owner gave one.'),
				priority: { type: 'string', enum: ['low', 'high'], description: 'Only when the owner said so.' },
				notes: text('Anything the owner said beyond the title.'),
			},
			['title']
		),
	},
	'complete-task': {
		description:
			'Marks one existing task done, after the owner confirms on the card; they can undo it. Returns the task’s title, or an error when no task has that id or the owner declined.',
		schema: object({ taskId: text('The `id` of the task’s row under `task` in the context.') }, ['taskId']),
	},
	'summarize-day': {
		description: `${SEPARATE} at the light grade that writes a short briefing of one day from everything Eden holds for it: the calendar’s events, the tasks due, overdue and done, and, when Sky is on, the day’s forecast and the weather alerts in force. Returns \`briefing\`, a few lines of Markdown; give it to the owner as it stands. Use it when the owner asks what a day holds ("what is on today", "how does tomorrow look"). For one fact, such as when an event starts, answer from the context.`,
		schema: object({ day: text(`The day; today when left out. ${DAY}`) }),
	},
	'what-you-know-about-me': {
		description:
			'Lists the profile facts about the owner that are shared with you: each with its type, its value written out as their profile page shows it, where it came from (`provenance`) and the day it lapses, plus `locked`, the fact types that exist and are not shared. The same facts are in the context as raw rows; use this when the owner asks what you know or remember about them, so the answer matches their profile page.',
		schema: object({}),
	},
	'log-quick': logQuick(Object.keys(QUICK_ACTION_WORDS)),
	'propose-fact': {
		description: [
			'Offers one fact about the owner for their profile, as a card they accept or dismiss; nothing is saved until they accept. Use it when the owner states something lasting about themselves that fits a type below and is not already among the facts in the context. Passing remarks and one-off choices are not facts ("pasta tonight" is not a preference). The types, and how to write `value` for each:',
			...PROPOSABLE_FACTS.map((type) => `- ${type}: ${factShapeWords(type)}`),
			'Returns the proposal’s id, or an error that names the shape it expected.',
		].join('\n'),
		schema: object(
			{
				type: { type: 'string', enum: PROPOSABLE_FACTS, description: 'The fact type, from the list above.' },
				value: text(
					'The value in the shape listed for the type: a bare word or number for the simple ones, JSON for the ones written with braces.'
				),
				confidence: { type: 'number', description: 'How sure you are, from 0 to 1.' },
				text: text('What the owner said that the fact rests on, in one sentence; shown on the card.'),
			},
			['type', 'value', 'confidence', 'text']
		),
	},
	'kitchen.suggest-recipes': {
		description: `${SEPARATE} that suggests things to cook from the stock, the saved recipes and the owner’s food preferences, favouring stock that expires soon. Returns \`suggestions\`, each with a name, the minutes it takes, a one-sentence reason, the stock item ids it uses and a \`recipeId\` when it is one of the saved recipes. Anything that names one of the owner’s allergens, restrictions or disliked ingredients is removed before you see it, and \`withheld\` counts those. No card is shown, so present the suggestions yourself. Use it when the owner asks what to cook or eat.`,
		schema: object({
			count: integer('How many to suggest, 1 to 5; 3 when unsaid.'),
			constraints: text('Anything they asked for: quick, vegetarian, uses the leeks.'),
		}),
	},
	'kitchen.storage-tip': {
		description: `${SEPARATE} for how to store one food and how long it keeps. Pass \`stockItemId\` for an item in the stock, or \`name\` for anything else; one of the two is needed. Returns \`tip\`, two sentences at most, and \`shelfLifeDays\`. It is general guidance: an item’s own expiry date is on its row in the context. Nothing is stored: to keep a tip on the item, pass it to \`kitchen_update-stock\`.`,
		schema: object({
			stockItemId: text('The `id` of the item’s row under `stock-item` in the context.'),
			name: text('The food’s name, when it is not in the stock.'),
		}),
	},
	'kitchen.capture-haul': {
		description: `${SEPARATE} that reads food from the files the owner attached and drafts it as stock rows on a card the owner checks and keeps. With \`mode\` \`haul\` the files are a shop just brought home: photos of the groceries, receipts, an order confirmation as a PDF, a screenshot or text; the rows are added to the stock. With \`mode\` \`stock\` they are photos of the fridge, the freezer, the pantry or the counter as they stand; the rows say what is there now, and an item already in the stock has its quantity set, not added to. It reads the files on the owner’s message, or the last ones they sent: you cannot pass it a file. Returns how many rows were drafted. When nothing was attached it says so: ask the owner to attach the photo or the receipt, or to use Capture a haul or Take stock on the Hearth page. For items they tell you in words, use \`kitchen_add-stock\`.`,
		schema: object({
			mode: {
				type: 'string',
				enum: ['haul', 'stock'],
				description:
					'What the files show: `haul` for what was just bought, `stock` for the shelves as they stand. `haul` when unsaid.',
			},
		}),
	},
	'kitchen.draft-grocery-list': {
		description: `${SEPARATE} that drafts a grocery list as a card the owner edits and keeps: what the chosen recipes and the coming days need, less what is in stock and what is already on a list. When kept, the items go on the list of \`storeId\`, or with none each goes to the store it was last bought at. Returns the drafted \`items\`. Use it when the owner asks what to buy or for a shopping list; to put items they named on a list, use \`kitchen_edit-grocery\`.`,
		schema: object({
			forRecipeIds: {
				type: 'array',
				items: text(),
				description:
					'The `id` of each recipe they want to cook, from rows under `recipe`. Left out, the list follows the stock.',
			},
			days: integer('How many days the list should cover, 1 to 14; 7 when unsaid.'),
			notes: text('Anything to mind: a guest, a budget.'),
			storeId: text(
				'The `id` of the store whose list the items go on, from rows under `grocery-store`, when the owner named one.'
			),
		}),
	},
	'kitchen.add-stock': {
		description:
			'Adds items to the kitchen stock, after the owner confirms on the card; they can undo it. Put every item in one call. An item that ran out comes back as the same row. When the owner names a product you know, fill in its `brand`, its `size` and its `category` yourself so they do not have to; leave out whatever you are not sure of. Returns the id and name of each row. Use it when the owner tells you what they bought or have at home; to change or remove what is already there, use `kitchen_update-stock`.',
		schema: object(
			{
				items: {
					type: 'array',
					description: 'Every item to add, one entry each.',
					items: object(
						{
							name: text('The item itself, without its maker: "butter".'),
							brand: text('Who makes it, when the owner said or the product is one you know: "Kerrygold".'),
							size: text('How much one package holds, when the owner said or you know it: "16 oz".'),
							qty: text('The amount alone, as a number or a word: 2, 500, half. 1 when unsaid.'),
							unit: text('The unit of the amount: g, ml, bunch, tin. Left out for a plain count.'),
							location: STOCK_LOCATION('Where it is kept. When the owner did not say, choose by the kind of food.'),
							category: STOCK_CATEGORY,
							expiry: text(`The day it expires, when the owner gave one. ${DAY}`),
							tip: text('One short sentence on storing it, only when the owner asked for one to be kept.'),
							link: text(
								'The link to the product’s page at a grocer, when the owner pasted one: its name, size and picture are read from it.'
							),
						},
						['name', 'qty', 'location']
					),
				},
			},
			['items']
		),
	},
	'kitchen.update-stock': {
		description:
			'Changes or removes items that are in the kitchen stock, after the owner confirms on the card; they can undo it. Put every change in one call. `changes` edits rows: pass only the fields that change. A `qty` of 0 marks the item as run out: it stays, to be bought again, and that is what "we are out of eggs" means. `location` moves it. `remove` deletes rows for good, for something added by mistake. After the owner cooked a saved recipe, pass `cookedRecipeId` and, in `changes`, each used item with the `qty` that is left. Returns the id and name of each row changed and removed, or an error naming an id that is not in the stock. To add something new, use `kitchen_add-stock`.',
		schema: object({
			changes: {
				type: 'array',
				description: 'The items to change, one entry each.',
				items: object(
					{
						id: text('The `id` of the item’s row under `stock-item` in the context.'),
						name: text('Its new name, without its maker.'),
						brand: text('Who makes it. An empty string clears it.'),
						size: text('How much one package holds: "16 oz". An empty string clears it.'),
						qty: text('The amount it holds now, alone: 2, 500, half. 0 when it ran out.'),
						unit: text('The unit of the amount: g, ml, bunch, tin. An empty string for a plain count.'),
						location: STOCK_LOCATION('Where it is kept now.'),
						category: STOCK_CATEGORY,
						expiry: text(`The day it expires. ${DAY} An empty string clears it.`),
						threshold: {
							type: 'number',
							description: 'The amount at or under which it counts as low, in its own unit. -1 clears it.',
						},
						tip: text('One short sentence on storing it. An empty string clears it.'),
					},
					['id']
				),
			},
			remove: { type: 'array', items: text(), description: 'The `id` of each item to delete for good.' },
			cookedRecipeId: text(
				'The `id` of the saved recipe the owner cooked, from rows under `recipe`, when the changes are what cooking it used.'
			),
		}),
	},
	'kitchen.edit-grocery': {
		description:
			'Changes the grocery lists, after the owner confirms on the card; they can undo it. Every store has its own list, and one list holds what is not filed under a store. Put everything in one call. `add` puts items on a list: on the list of `storeId` when the owner named a store, else where each was last bought. `update` edits an item, moves it to another store’s list with `storeId`, or checks it off with `done`. `remove` deletes items. `complete` finishes a shopping trip for a store: its checked items leave the list and the store remembers them. When the owner names a product you know, fill in its `brand` and `size` yourself; leave out what you are not sure of. Use it for items the owner names, for buying again something that ran out, and for a recipe’s missing ingredients; for a whole list worked out from the stock use `kitchen_draft-grocery-list`. Returns what was added, changed, removed and completed, or an error naming an id it does not know.',
		schema: object({
			add: {
				type: 'array',
				description: 'The items to add, one entry each.',
				items: object(
					{
						name: text('The thing to buy, without its maker: "butter".'),
						brand: text('The brand to buy, when the owner said or the product is one you know.'),
						size: text('The package size to buy: "16 oz".'),
						qty: text('How much, with its unit: 2, 500 g, 1 bunch.'),
						price: { type: 'number', description: 'What one costs, only when the owner said: 3.49.' },
						note: text('Anything to mind when buying it, in a few words.'),
						storeId: text(
							'The `id` of the store whose list it goes on, from rows under `grocery-store`; `none` for the unfiled list. Left out, it goes where it was last bought.'
						),
						link: text(
							'The link to the product’s page at a grocer, when the owner pasted one: its name and size are read from it.'
						),
					},
					['name']
				),
			},
			update: {
				type: 'array',
				description: 'The items to change, one entry each, with only the fields that change.',
				items: object(
					{
						id: text('The `id` of the item’s row under `grocery-item` in the context.'),
						name: text('Its new name, without its maker.'),
						brand: text('The brand to buy. An empty string clears it.'),
						size: text('The package size to buy. An empty string clears it.'),
						qty: text('How much, with its unit.'),
						price: { type: 'number', description: 'What one costs, when the owner said. 0 clears it.' },
						note: text('Anything to mind when buying it. An empty string clears it.'),
						storeId: text(
							'The `id` of the store whose list it moves to; `none` moves it to the unfiled list. Left out, it stays.'
						),
						done: { type: 'boolean', description: 'Whether it is checked off: true once it is in the basket.' },
					},
					['id']
				),
			},
			remove: { type: 'array', items: text(), description: 'The `id` of each grocery item to delete.' },
			complete: {
				type: 'array',
				items: text(),
				description: 'The `id` of each store whose trip is done; `none` for the unfiled list.',
			},
		}),
	},
	'kitchen.edit-stores': {
		description:
			'Adds, changes or deletes the stores the owner shops at, after the owner confirms on the card; they can undo it. Each store has its own grocery list. For a store you know, fill in `url` with its own website so the owner does not have to: once they confirm, the app reads that site on the device for the store’s picture, its phone number and its address. Leave `url` out when you are not sure of it, and never guess a phone number. You are not given a store’s address and cannot set one. `shopDay` is the day of the next trip, which the owner is reminded of that morning. Deleting a store keeps its items: they move to the unfiled list. Returns the id and name of each store added, changed and removed; a store whose name is already there is answered as it stands.',
		schema: object({
			add: {
				type: 'array',
				description: 'The stores to add, one entry each.',
				items: object(
					{
						name: text('The store’s name as the owner would say it: "H-E-B", "Central Market".'),
						sells: STORE_SELLS,
						url: text('The store’s own website, starting with https://, when the owner gave it or you know it.'),
						phone: text('Its phone number, only when the owner gave it.'),
						note: text('Anything the owner said to remember about it.'),
						shopDay: text('The next trip, as YYYY-MM-DD or YYYY-MM-DDTHH:MM when the owner named one.'),
					},
					['name']
				),
			},
			update: {
				type: 'array',
				description: 'The stores to change, one entry each, with only the fields that change.',
				items: object(
					{
						id: text('The `id` of the store’s row under `grocery-store` in the context.'),
						name: text('Its new name.'),
						sells: STORE_SELLS,
						url: text('The store’s own website, starting with https://. An empty string clears it.'),
						phone: text('Its phone number. An empty string clears it.'),
						note: text('Anything to remember about it. An empty string clears it.'),
						shopDay: text('The next trip, as YYYY-MM-DD or YYYY-MM-DDTHH:MM. An empty string clears it.'),
					},
					['id']
				),
			},
			remove: { type: 'array', items: text(), description: 'The `id` of each store to delete.' },
		}),
	},
	'kitchen.import-recipe': {
		description: `${SEPARATE} that writes out a recipe the owner brought, as a card that opens it in their recipes to check and save. The recipe is in \`text\` when they pasted it, at \`url\` when they gave a link (the app fetches the page), or in the files on their message when they attached a photo of a page or a card; pass whichever you have, and nothing when it is the files alone. Returns the drafted recipe’s name. It writes down what the source says and invents nothing; to save a dish you suggested yourself, use \`kitchen_save-recipe\`.`,
		schema: object({
			text: text('The recipe as the owner pasted it, whole.'),
			url: text('The link to the recipe’s page, starting with https://.'),
		}),
	},
	'kitchen.save-recipe': {
		description:
			'Drafts a recipe you wrote yourself, as a card that opens it in the owner’s recipes to check and save; nothing is stored until they save it. Give the whole recipe: every ingredient on a line of its own with its amount, and the steps in order. A recipe that names one of the owner’s allergens, restrictions or disliked ingredients is refused. Returns the drafted recipe’s name. Use it when the owner asks to keep a dish you suggested or described; for a recipe they pasted, linked or photographed, use `kitchen_import-recipe`.',
		schema: object(
			{
				name: text('The dish.'),
				serves: integer('How many it serves.'),
				minutes: integer('How long it takes start to finish, in minutes.'),
				tags: { type: 'array', items: text(), description: 'Up to three plain tags: weeknight, vegetarian, one pot.' },
				ingredients: {
					type: 'array',
					description: 'Every ingredient, one entry each.',
					items: RECIPE_LINE,
				},
				steps: { type: 'array', items: text('One step, as a full sentence.'), description: 'The steps, in order.' },
				tip: text('One sentence that makes the dish go right, when there is one worth giving.'),
				author: text('Who the recipe is by, when it is someone’s and not your own.'),
				sourceName: text('What it comes from, by name: a cookbook, a magazine, a site. Left out for your own.'),
				sourceUrl: text('The page it comes from, starting with https://, when there is one.'),
				scales: {
					type: 'boolean',
					description: 'False when the amounts cannot simply be multiplied for more servings, as with baking.',
				},
			},
			['name', 'ingredients', 'steps']
		),
	},
	'kitchen.change-recipe': {
		description:
			'Changes or deletes one of the owner’s saved recipes, after the owner confirms on the card; they can undo it. Pass only the fields that change; `ingredients`, `steps` and `tags` replace the whole list, so give each in full when you change it. `remove: true` deletes the recipe and takes nothing else. A change that names one of the owner’s allergens, restrictions or disliked ingredients is refused. Returns the recipe’s id and name, or an error when no recipe has that id. Use it when the owner asks to correct, adjust or delete a recipe they have; a new recipe goes through `kitchen_save-recipe` or `kitchen_import-recipe`.',
		schema: object(
			{
				id: text('The `id` of the recipe’s row under `recipe` in the context.'),
				remove: { type: 'boolean', description: 'True to delete the recipe.' },
				name: text('The dish.'),
				serves: integer('How many it serves.'),
				minutes: integer('How long it takes start to finish, in minutes.'),
				tags: { type: 'array', items: text(), description: 'Up to three plain tags, replacing the ones it has.' },
				ingredients: {
					type: 'array',
					description: 'Every ingredient, one entry each, replacing the ones it has.',
					items: RECIPE_LINE,
				},
				steps: {
					type: 'array',
					items: text('One step, as a full sentence.'),
					description: 'The steps, in order, replacing the ones it has.',
				},
				tip: text('One sentence that makes the dish go right. An empty string clears it.'),
			},
			['id']
		),
	},
	'kitchen.plan-week': {
		description: `${SEPARATE} at the deep grade that plans meals for a run of days around the stock, the saved recipes and the events and tasks in the calendar, with one shop day, what to buy for it and the tasks the plan needs, as one plan card the owner keeps or discards. When kept, the shop day goes in the calendar and each thing to buy goes on the list of the store it was last bought at; ${COSTED}. Returns the drafted plan. Use it when the owner asks to plan a week of meals; for one meal use \`kitchen_suggest-recipes\`.`,
		schema: object({
			from: text(`The first day; today when unsaid. ${DAY}`),
			days: integer('How many days, 1 to 14; 7 when unsaid.'),
			notes: text('What to mind: guests, a busy evening, a budget.'),
		}),
	},
	'toolbench.brainstorm': {
		description: `${SEPARATE} at the deep grade that thinks one idea through with the owner, drawing on their skills, tools and hardware; ${COSTED}. The exchange is saved with the idea, so the idea has to exist already: a new one is captured first with \`log-quick\` and can be brainstormed from the owner’s next message. Returns \`reply\`, a paragraph or two of prose; give it to the owner as it stands. Use it when they want to explore an idea rather than plan it.`,
		schema: object(
			{
				ideaId: text('The `id` of the idea’s row under `idea` in the context.'),
				prompt: text('Where the owner wants to take it, in their words, when they said.'),
			},
			['ideaId']
		),
	},
	'toolbench.critique': {
		description: `${SEPARATE} at the deep grade that critiques one idea or one project; ${COSTED}. Pass \`ideaId\` or \`projectId\`; one of the two is needed. Returns \`strengths\`, \`risks\` and \`questions\`, three to five of each. Use it when the owner asks what you think of it or what could go wrong.`,
		schema: object({
			ideaId: text('The `id` of a row under `idea` in the context.'),
			projectId: text('The `id` of a row under `project` in the context.'),
		}),
	},
	'toolbench.expand-to-plan': {
		description: `${SEPARATE} at the deep grade that turns one idea into four to eight concrete steps, in order, drafted as tasks on a plan card the owner keeps or discards; ${COSTED}. With \`projectId\`, keeping the plan also sets the steps as that project’s next steps. Returns the drafted \`steps\`. Use it when the owner is ready to start on an idea.`,
		schema: object(
			{
				ideaId: text('The `id` of the idea’s row under `idea` in the context.'),
				projectId: text('The `id` of the project to plan under, from rows under `project`, when there is one.'),
			},
			['ideaId']
		),
	},
	'toolbench.find-similar': {
		description:
			'Finds the owner’s ideas, projects and notes that share words with a piece of text. It compares words and not meaning, so pass the distinctive keywords and not a sentence. Returns `matches`, the closest first, each with its `type`, `id`, `title` and a `score` from 0 to 1; an empty list means nothing shares a word. No model request is made. Use it to see what the owner already has before brainstorming or capturing an idea.',
		schema: object(
			{
				text: text('The keywords to look for.'),
				limit: integer('How many matches to return, 1 to 10; 5 when unsaid.'),
			},
			['text']
		),
	},
	'toolbench.estimate-parts-cost': {
		description:
			'Adds up one project’s parts list at the prices stored on it. Returns `total`, `currency` and the `parts` with their prices. The prices are the ones the owner entered, not current ones. Use it when the owner asks what a build costs.',
		schema: object({ projectId: text('The `id` of the project’s row under `project` in the context.') }, ['projectId']),
	},
	'toolbench.summarize-project': {
		description: `${SEPARATE} that reads one project and its tasks and says where it stands. Returns \`summary\`, two or three sentences, and \`nextSteps\`. Use it when the owner asks for the status of a project.`,
		schema: object({ projectId: text('The `id` of the project’s row under `project` in the context.') }, ['projectId']),
	},
	'toolbench.draft-sketch-scaffold': {
		description: `${SEPARATE} at the deep grade that drafts starting code for a creative-coding sketch, shown as a code card the owner copies; nothing is written to a file, and ${COSTED}. Returns the language and the line count; the code is on the card, so do not write it out again. Use it when the owner asks for a scaffold or a starting point, not for a finished program.`,
		schema: object(
			{
				description: text('What the sketch should do.'),
				tool: text(
					'The framework or language to write it in, when the owner named one. Left out, it follows the owner’s preferred tools.'
				),
				sketchId: text('The `id` of an existing sketch to build on, from rows under `sketch`.'),
			},
			['description']
		),
	},
	'weather.forecast': {
		description:
			'Returns the forecast Eden holds for the owner’s home area: the `current` conditions, up to seven `days` from `day` on (each with its condition, the high and low in `unit`, the chance of rain in percent, the rainfall in mm and the UV), and the weather `alerts` in force now, the most severe first. An alert marked `dismissed` was put away by the owner in Sky and is still in force. `alertsCovered: false` means no alert service covers the place, which is not the same as no alerts. Use it for any question about the weather or about alerts, warnings and watches. It covers the home area only, and a day the forecast does not reach is an error that names the days it holds.',
		schema: object({ day: text(`The first day wanted; today when left out. ${DAY}`) }),
	},
	'weather.rain-during-plan': {
		description:
			'Says whether rain is likely during a stretch of time at the owner’s home area. Pass `taskId` or `eventId` for something in the context that has a time, or `from` and `to` for any other window. Returns `rain` (true when any hour of the window has a 40 % chance or more), `maxPrecipChance` and the `hours` with their chances. Hourly readings reach only a few days ahead: `covered: false` means the window is beyond them, and for a day further out `weather_forecast` has the daily chance. Use it when the owner asks about the weather for something planned.',
		schema: object({
			from: text('The start of the window as a local date and time, YYYY-MM-DDTHH:MM.'),
			to: text('The end of the window, in the same form; two hours after the start when left out.'),
			taskId: text('The `id` of a row under `task` that has a time.'),
			eventId: text('The `id` of an event’s row in the context.'),
		}),
	},
	'weather.sun-and-moon': {
		description:
			'Returns sunrise, sunset, golden hour and the moon’s phase for a day or a run of days at the owner’s home area; today when no day is given. Sunrise and sunset come from the forecast and are null for a day it does not reach; the moon is computed and has no such limit. To find when the moon is next new, full or at a quarter, pass `next`: the date is right to about half a day, so say "around". For a span pass `days`; one call answers the whole span, so do not call it once per day.',
		schema: object({
			day: text(`The first day; today when left out. ${DAY}`),
			days: integer('How many days from that day, 1 to 31; 1 when unsaid.'),
			next: {
				type: 'string',
				enum: ['new', 'first-quarter', 'full', 'last-quarter'],
				description: 'Find the next time the moon reaches this phase, from that day on.',
			},
		}),
	},
}

/**
 * What each domain holds, in the words the system prompt gives the model beside the domain's name and id. A
 * declared domain without a line here is named with nothing after it; the test asserts every one has a line.
 */
export const DOMAIN_BLURBS: Readonly<Record<string, string>> = {
	kitchen:
		'food at home: the stock in the fridge, freezer and pantry with its expiry dates (an item at a quantity of 0 ran out and is kept to be bought again), recipes with their ingredients and steps, and the stores the owner shops at, each with its own grocery list (a `grocery-item` is on the list its `listId` names, and a `grocery-list` with no `storeId` is the unfiled one)',
	toolbench:
		'making things: ideas and their brainstorms, projects with their next steps and parts lists, code sketches, notes and homelab devices',
	weather: 'the weather for the owner’s home area: the forecast, the alerts in force, sunrise, sunset and the moon',
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

/** The quick actions `log-quick` may run for these domains: the declared ones that `QUICK_ACTION_WORDS` describes. */
export function quickActionsFor(declarations: readonly DomainDeclaration[]): string[] {
	return declarations
		.flatMap((domain) => domain.quickActions.map((action) => `${domain.id}.${action.id}`))
		.filter((action) => Object.hasOwn(QUICK_ACTION_WORDS, action))
}

/**
 * Every tool the Gardener may call: the substrate's, then each domain's in the order given. `log-quick` names the
 * quick actions of these domains alone, and is left out when they declare none it can run.
 */
export function toolIndex(declarations: readonly DomainDeclaration[]): GardenerTool[] {
	const actions = quickActionsFor(declarations)
	return [
		...SUBSTRATE_TOOLS.flatMap((declaration) => {
			const tool = join(SUBSTRATE, declaration)
			if (declaration.id !== 'log-quick') return [tool]
			return actions.length ? [{ ...tool, ...logQuick(actions) }] : []
		}),
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
		// `log-quick` is left out of an index whose domains declare no quick action it can run
		if (!keys.has(key) && key !== 'log-quick') problems.push(`${key}: has a schema and no declaration`)
	}
	if (index.filter(isStrict).length > STRICT_LIMIT)
		problems.push(`${index.filter(isStrict).length} strict tools; the API takes ${STRICT_LIMIT} at most`)
	return problems
}
