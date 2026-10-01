// How a request reaches the model (docs/engineering/gardener.md, "The request"): through the crate under Tauri, and
// through a scripted stream in the browser, where there is no key and no crate, so the panel can be worked on with
// `yarn dev:web`. Either way the runtime sees the same events. A request held to a schema is answered in that
// shape, so a page that runs a tool itself (Hearth's capture sheet) can be walked in the browser too.
import { isTauri } from '@eden/shared/api'
import { gardenerSend, type GardenerEvent, type GardenerRequest } from '@eden/shared/gardener'

export interface Transport {
	(
		request: GardenerRequest,
		onEvent: (event: GardenerEvent) => void
	): { done: Promise<void>; cancel: () => Promise<boolean> }
}

/** The crate's stream. */
export const crateTransport: Transport = (request, onEvent) => gardenerSend(request, onEvent)

/**
 * A scripted reply: the text streamed word by word, then a stop. What `yarn dev:web` answers with. A message that
 * names the moon is answered as the model would: a line, three reads of `sun-and-moon`, then the answer once their
 * results are back, so the order of a reply and the fold of its reads can be worked on in the browser.
 */
export function fakeTransport(script: (request: GardenerRequest) => string = () => FAKE_REPLY): Transport {
	return (request, onEvent) => {
		let cancelled = false
		const done = (async () => {
			onEvent({ type: 'start', messageId: `fake-${request.id}`, model: request.model })
			onEvent({ type: 'usage', input: 120, output: 0, cacheRead: 0, cacheWrite: 0 })
			const looks = moonRound(request)
			const held = request.outputFormat ? JSON.stringify(heldAnswer(request.outputFormat)) : undefined
			// the wait a model makes before its first word, so the sprout can be worked on too
			await new Promise((resolve) => setTimeout(resolve, 1200))
			// an answer held to a schema comes whole: nothing reads it word by word
			for (const word of held
				? [held]
				: (looks === 'ask' ? FAKE_LOOK : looks === 'answer' ? FAKE_MOON : script(request)).split(/(?<=\s)/)) {
				if (cancelled) break
				await new Promise((resolve) => setTimeout(resolve, 30))
				onEvent({ type: 'text_delta', text: word })
			}
			if (looks === 'ask' && !cancelled) {
				for (const day of [0, 1, 2]) {
					await new Promise((resolve) => setTimeout(resolve, 300))
					onEvent({
						type: 'tool_use',
						id: `fake-${request.id}-${day}`,
						name: 'weather_sun-and-moon',
						input: day === 2 ? { next: 'full' } : { day: day ? 'tomorrow' : 'today' },
					})
				}
			}
			onEvent({ type: 'usage', input: 120, output: 40, cacheRead: 0, cacheWrite: 0 })
			const reason = cancelled ? 'cancelled' : looks === 'ask' ? 'tool_use' : 'end_turn'
			onEvent({ type: 'stop', reason, refusal: null })
		})()
		return {
			done,
			cancel: async () => {
				cancelled = true
				return true
			},
		}
	}
}

/**
 * What the browser answers a request held to a schema (a delegated tool's): a haul for `capture-haul` and a recipe
 * for `import-recipe`, so their sheets can be walked with `yarn dev:web`, and for any other shape an answer with
 * every field present and nothing in it.
 */
function heldAnswer(schema: unknown): unknown {
	const properties = (schema as { properties?: Record<string, unknown> } | null)?.properties ?? {}
	if ('rows' in properties) return FAKE_HAUL
	if ('ingredients' in properties) return FAKE_RECIPE
	return blank(schema)
}

function blank(schema: unknown): unknown {
	const node = schema as { type?: string; properties?: Record<string, unknown>; enum?: unknown[] } | null
	if (node?.type === 'object') {
		return Object.fromEntries(Object.entries(node.properties ?? {}).map(([key, value]) => [key, blank(value)]))
	}
	if (node?.type === 'array') return []
	if (node?.type === 'integer' || node?.type === 'number') return 0
	return node?.enum?.[0] ?? ''
}

/** Where the first three items of the scripted haul are in its first photo; the rest come from no photo. */
const NOWHERE = { left: 0, top: 0, right: 0, bottom: 0 }
const fakeRow = (
	name: string,
	qty: string,
	unit: string,
	location: string,
	category: string,
	daysUntilExpiry: number,
	tip = '',
	box?: typeof NOWHERE
) => ({
	name,
	qty,
	unit,
	location,
	category,
	expiryDate: '',
	daysUntilExpiry,
	tip,
	photo: box ? 1 : 0,
	box: box ?? NOWHERE,
})

const FAKE_HAUL = {
	rows: [
		fakeRow('Eggs', '12', '', 'fridge', 'dairy-and-eggs', 21, '', { left: 50, top: 50, right: 450, bottom: 450 }),
		fakeRow(
			'Spinach',
			'200',
			'g',
			'fridge',
			'produce',
			5,
			'Keep it dry in a towel inside the bag; it wilts fastest in the door.',
			{ left: 550, top: 50, right: 950, bottom: 450 }
		),
		fakeRow('Greek yogurt', '500', 'g', 'fridge', 'dairy-and-eggs', 14, '', {
			left: 50,
			top: 550,
			right: 450,
			bottom: 950,
		}),
		fakeRow(
			'Sourdough loaf',
			'1',
			'',
			'counter',
			'bakery',
			4,
			'Slice and freeze what will not be eaten in three days.'
		),
		fakeRow('Short-grain rice', '1', 'kg', 'pantry', 'grains-and-pasta', 0),
		fakeRow('Frozen peas', '450', 'g', 'freezer', 'frozen', 0),
	],
}

const FAKE_RECIPE = {
	name: 'Lemon and garlic chickpeas',
	serves: 2,
	minutes: 20,
	tags: ['weeknight', 'one pot'],
	ingredients: [
		{ name: 'canned chickpeas', qty: '1', unit: '', note: 'drained' },
		{ name: 'garlic', qty: '2', unit: 'cloves', note: 'sliced' },
		{ name: 'lemons', qty: '1', unit: '', note: 'juice and zest' },
		{ name: 'olive oil', qty: '2', unit: 'tbsp', note: '' },
		{ name: 'spinach', qty: '100', unit: 'g', note: '' },
	],
	steps: [
		'Warm the oil and soften the garlic without colouring it.',
		'Add the chickpeas and cook until they catch a little.',
		'Stir in the spinach until it wilts, then the lemon juice and zest.',
	],
	tip: 'Dry the chickpeas well first, or they steam where they should fry.',
}

const FAKE_LOOK = 'Let me look at the moon over the next weeks.'
const FAKE_MOON =
	'That is what the ephemeris says: the next full moon is in the last result, **around** the day it names.'

/** Where a moon question stands: to be asked of the tool, answered from its results, or not one at all. */
function moonRound(request: GardenerRequest): 'ask' | 'answer' | undefined {
	const turns = request.messages as { role: string; content: unknown }[]
	const last = turns.at(-1)?.content
	if (Array.isArray(last) && last.some((part) => (part as { type?: string }).type === 'tool_result')) return 'answer'
	const words = typeof last === 'string' ? last : JSON.stringify(last ?? '')
	const reach = (request.tools as { name: string }[]).some((tool) => tool.name === 'weather_sun-and-moon')
	return reach && /\bmoon\b/i.test(words) ? 'ask' : undefined
}

const FAKE_REPLY = [
	'This is the **browser**: the Gardener runs in the installed app, so I am a scripted reply.',
	'- Everything else on this panel is *real*.\n- Replies are drawn as Markdown, `code` included.',
	'```text\nyarn dev\n```',
	'More in [the Tauri docs](https://tauri.app).',
].join('\n\n')

/** The transport for where the app runs. */
export const transport: Transport = isTauri() ? crateTransport : fakeTransport()
