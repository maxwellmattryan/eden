// How a request reaches the model (docs/engineering/gardener.md, "The request"): through the crate under Tauri, and
// through a scripted stream in the browser, where there is no key and no crate, so the panel can be worked on with
// `yarn dev:web`. Either way the runtime sees the same events. A request held to a schema is answered in that
// shape, so a page that runs a tool itself (Hearth's capture sheet) can be walked in the browser too.
import { isTauri } from '../../api/index.js'
import { gardenerSend, type GardenerEvent, type GardenerRequest } from '../../gardener/index.js'

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
			// a research request (D-132): the provider's web search among its tools. The search is scripted too
			const searches = (request.tools as { type?: string }[]).some((tool) => tool.type?.startsWith('web_search'))
			// the wait a model makes before its first word, so the sprout can be worked on too
			await new Promise((resolve) => setTimeout(resolve, 1200))
			// an answer held to a schema comes whole: nothing reads it word by word
			if (searches && !cancelled) {
				for (const [at, search] of FAKE_SEARCHES.entries()) {
					await new Promise((resolve) => setTimeout(resolve, 400))
					const id = `fake-search-${request.id}-${at}`
					onEvent({
						type: 'server_block',
						block: { type: 'server_tool_use', id, name: 'web_search', input: { query: search.query } },
					})
					onEvent({
						type: 'server_block',
						block: { type: 'web_search_tool_result', toolUseId: id, results: search.results, error: null },
					})
				}
			}
			for (const word of held
				? [held]
				: searches
					? [FAKE_NOTES]
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
			onEvent({
				type: 'usage',
				input: searches ? 9000 : 120,
				output: searches ? 380 : 40,
				cacheRead: 0,
				cacheWrite: 0,
				...(searches ? { searches: FAKE_SEARCHES.length } : {}),
			})
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
 * What the browser answers a request held to a schema (a delegated tool's): a haul for `capture-haul`, a recipe
 * for `import-recipe` and candidates for Meadow's `suggest-places`, so their surfaces can be walked with
 * `yarn dev:web`, and for any other shape an answer with every field present and nothing in it.
 */
function heldAnswer(schema: unknown): unknown {
	const properties = (schema as { properties?: Record<string, unknown> } | null)?.properties ?? {}
	if ('rows' in properties) return FAKE_HAUL
	if ('ingredients' in properties) return FAKE_RECIPE
	if ('candidates' in properties) return FAKE_CANDIDATES
	if ('listings' in properties) return fakeListings()
	// `import-places`: a vibe or two for the first few names, so the import sheet's suggestions can be seen
	if ('tagged' in properties)
		return {
			tagged: [
				{ index: 1, vibes: ['work-friendly', 'outdoors'] },
				{ index: 2, vibes: ['social'] },
				{ index: 3, vibes: ['read', 'calm'] },
			],
		}
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

/**
 * The scripted web search (D-132): two searches and what each returned, the notes the research request answers, and
 * the candidates the reading request makes of them. The places are real ones in Austin, so the geocoder finds them;
 * one is made up, to show a name that cannot be placed, and one names an address the search never returned, which
 * Meadow drops.
 */
const FAKE_SEARCHES = [
	{
		query: 'quiet cafes to work in Austin Texas',
		results: [
			{ url: 'https://www.flitchcoffee.com/', title: 'Flitch Coffee' },
			{ url: 'https://bennucoffee.com/', title: 'Bennu Coffee | Open 24 hours' },
		],
	},
	{
		query: 'Austin Central Library hours study space',
		results: [
			{ url: 'https://library.austintexas.gov/central-library', title: 'Central Library | Austin Public Library' },
			{ url: 'https://example.com/hidden-reading-rooms', title: 'Hidden reading rooms of Austin' },
		],
	},
]

const FAKE_NOTES = [
	'Flitch Coffee, 641 Tillery St, East Austin. A coffee trailer under the trees with shaded tables; quiet on weekday mornings. Open daily 07:00 to 15:00. https://www.flitchcoffee.com/',
	'Bennu Coffee, 2001 E Martin Luther King Jr Blvd, East Austin. Open around the clock and built for long sessions, with outlets at most tables. https://bennucoffee.com/',
	'Austin Central Library, 710 W Cesar Chavez St, Downtown. Six floors of quiet with a roof garden and daylight everywhere; no alcohol. https://library.austintexas.gov/central-library',
	'The Lantern Reading Room, said to be upstairs on a side street off Guadalupe; no address given. https://example.com/hidden-reading-rooms',
].join('\n\n')

const fakeCandidate = (given: Record<string, unknown>) => ({
	name: '',
	category: 'cafe',
	address: '',
	locality: '',
	why: '',
	vibes: [],
	price: 0,
	alcoholFree: 'unknown',
	hours: '',
	website: '',
	sources: [],
	...given,
})

const FAKE_CANDIDATES = {
	candidates: [
		fakeCandidate({
			name: 'Flitch Coffee',
			address: '641 Tillery St',
			locality: 'East Austin',
			why: 'A trailer under the trees with shaded tables; quiet on weekday mornings.',
			vibes: ['work-friendly', 'calm', 'outdoors', 'solo-friendly'],
			price: 1,
			hours: 'Mo-Su 07:00-15:00',
			website: 'https://www.flitchcoffee.com/',
			sources: ['https://www.flitchcoffee.com/'],
		}),
		fakeCandidate({
			name: 'Bennu Coffee',
			address: '2001 E Martin Luther King Jr Blvd',
			locality: 'East Austin',
			why: 'Open around the clock and built for long sessions, with outlets at most tables.',
			vibes: ['deep-work', 'late-night', 'laptop-crowd'],
			price: 2,
			hours: '24/7',
			website: 'https://bennucoffee.com/',
			sources: ['https://bennucoffee.com/'],
		}),
		fakeCandidate({
			name: 'Austin Central Library',
			category: 'library',
			address: '710 W Cesar Chavez St',
			locality: 'Downtown',
			why: 'Six floors of quiet with a roof garden and daylight everywhere.',
			vibes: ['deep-work', 'read', 'quiet', 'natural-light', 'spacious'],
			alcoholFree: 'yes',
			// an address the search did not return, whole: Meadow keeps the candidate and drops this
			website: 'https://library.austintexas.gov/central-library/visit?from=eden',
			sources: ['https://library.austintexas.gov/central-library'],
		}),
		fakeCandidate({
			name: 'The Lantern Reading Room',
			category: 'venue',
			locality: 'Central Austin',
			why: 'A reading room said to be upstairs on a side street; the notes give no address.',
			vibes: ['read', 'quiet', 'intimate'],
			sources: ['https://example.com/hidden-reading-rooms'],
		}),
		// no source the search returned: dropped before it is ever shown
		fakeCandidate({ name: 'A Cafe The Model Remembered', sources: ['https://not-returned.example/'] }),
	],
}

/** Two listings a few days ahead, whichever day the script runs on, read at addresses the scripted search returned. */
function fakeListings() {
	const day = (ahead: number) => {
		const at = new Date(Date.now() + ahead * 86_400_000)
		return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`
	}
	return {
		listings: [
			{
				title: 'Library late: readings on the roof garden',
				venue: 'Austin Central Library',
				address: '710 W Cesar Chavez St',
				start: `${day(1)}T18:00`,
				end: `${day(1)}T21:00`,
				category: 'Talk',
				price: 'Free',
				why: 'Calm, spacious and good on your own.',
				url: 'https://library.austintexas.gov/central-library',
				sources: ['https://library.austintexas.gov/central-library'],
			},
			{
				title: 'Morning market at the coffee trailer',
				venue: 'Flitch Coffee',
				address: '641 Tillery St',
				start: day(2),
				end: '',
				category: 'Market',
				price: '',
				why: 'Outdoors and unhurried, with the makers behind their tables.',
				url: 'https://www.flitchcoffee.com/',
				sources: ['https://www.flitchcoffee.com/'],
			},
			// no page the search returned: dropped
			{
				title: 'A show the model remembered',
				venue: '',
				address: '',
				start: `${day(2)}T20:00`,
				end: '',
				category: 'Music',
				price: '',
				why: '',
				url: 'https://not-returned.example/show',
				sources: [],
			},
		],
	}
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
