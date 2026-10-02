// A recipe read from what the owner brought (product/domains/kitchen.md, "Recipes"): a web page that says what it
// is in schema.org's `Recipe` (most recipe sites do, as JSON-LD) is read here with no model asked; anything else is
// text the `import-recipe` tool is given, and `recipeDraft` reads the model's answer into the same shape. A draft is
// never stored: the owner checks it in the Recipes view and saves it there.
import { httpsAddress, jsonLdNodes, pageImage, pageSiteName } from '../../api/html.js'
import { parseIngredient } from './parse.js'
import { decodeEntities, htmlToText } from './sources.js'
import type { Ingredient, Recipe } from './types.js'

// The page readers both Hearth and Meadow use live in the shared HTML module; they are still exported from here.
export { httpsAddress, jsonLdNodes, pageImage, pageSiteName }

/**
 * A recipe before it is a row: everything but the id. It has no picture of its own yet; `imageUrl` is where its
 * source shows one, which the app fetches for the owner to keep or take away (D-93), and is never stored.
 */
export type RecipeDraft = Omit<Recipe, 'id' | 'photo'> & { imageUrl?: string }

/** A string of a page as plain text: tags and entities gone, and no space left before the punctuation a tag sat by. */
const clean = (value: unknown): string =>
	typeof value === 'string'
		? decodeEntities(value.replace(/<[^>]*>/g, ' '))
				.replace(/\s+/g, ' ')
				.replace(/ ([.,;:!?])/g, '$1')
				.trim()
		: ''

/** An ISO 8601 duration (`PT1H30M`, `P0DT45M`) in minutes; 0 for anything else. */
export function durationMinutes(value: unknown): number {
	const match = /^P(?:(\d+)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i.exec(
		clean(value)
	)
	if (!match) return 0
	const [, days, hours, minutes] = match
	return Math.round(Number(days ?? 0) * 1440 + Number(hours ?? 0) * 60 + Number(minutes ?? 0))
}

const isRecipe = (node: Record<string, unknown>) =>
	(Array.isArray(node['@type']) ? node['@type'] : [node['@type']]).some((type) => type === 'Recipe')

/** The steps of `recipeInstructions`: a string, a list of strings, of `HowToStep`s, or of sections of them. */
function steps(value: unknown, depth = 0): string[] {
	if (depth > 4) return []
	if (typeof value === 'string') {
		return value
			.split(/\n+|(?<=\.)\s+(?=\d+[.)]\s)/)
			.map((line) => clean(line).replace(/^\d+[.)]\s*/, ''))
			.filter(Boolean)
	}
	if (Array.isArray(value)) return value.flatMap((entry) => steps(entry, depth + 1))
	if (value && typeof value === 'object') {
		const node = value as Record<string, unknown>
		if (node.itemListElement) return steps(node.itemListElement, depth + 1)
		const text = clean(node.text) || clean(node.name)
		return text ? [text] : []
	}
	return []
}

const firstNumber = (value: unknown): number => {
	const text = Array.isArray(value) ? value.map(String).join(' ') : String(value ?? '')
	const match = /\d+/.exec(text)
	return match ? Number(match[0]) : 0
}

const tagsOf = (value: unknown): string[] =>
	(Array.isArray(value) ? value.map(clean) : clean(value).split(','))
		.map((tag) => tag.trim().toLowerCase())
		.filter((tag) => tag && tag.length <= 24)
		.slice(0, 5)

/** The picture of schema.org's `image`: an address, an `ImageObject`, or a list of either, the first that reads. */
function imageOf(value: unknown, base?: string, depth = 0): string | undefined {
	if (depth > 3 || !value) return undefined
	if (typeof value === 'string') return httpsAddress(decodeEntities(value), base)
	if (Array.isArray(value)) {
		for (const entry of value) {
			const found = imageOf(entry, base, depth + 1)
			if (found) return found
		}
		return undefined
	}
	if (typeof value === 'object') {
		const node = value as Record<string, unknown>
		return imageOf(node.url ?? node.contentUrl, base, depth + 1)
	}
	return undefined
}

/** The names of schema.org's `author` or `publisher`: a string, a `Person` or an `Organization`, or a list of them. */
function namesOf(value: unknown, depth = 0): string[] {
	if (depth > 3 || !value) return []
	if (typeof value === 'string') return clean(value) ? [clean(value)] : []
	if (Array.isArray(value)) return value.flatMap((entry) => namesOf(entry, depth + 1))
	if (typeof value === 'object') return namesOf((value as Record<string, unknown>).name, depth + 1)
	return []
}

/** A credit as it is kept: one line, of a length a name has. */
const credit = (names: string[]): string => [...new Set(names)].slice(0, 3).join(', ').slice(0, 120)

/** The recipe a page describes in JSON-LD, or nothing when it describes none with both ingredients and steps. */
export function recipeFromJsonLd(html: string, url?: string): RecipeDraft | undefined {
	for (const node of jsonLdNodes(html).filter(isRecipe)) {
		const lines = Array.isArray(node.recipeIngredient) ? node.recipeIngredient.map(clean).filter(Boolean) : []
		const made = steps(node.recipeInstructions)
		const name = clean(node.name)
		if (!name || !lines.length || !made.length) continue
		const minutes = durationMinutes(node.totalTime) || durationMinutes(node.prepTime) + durationMinutes(node.cookTime)
		const source = url ?? clean(node.url)
		const image = imageOf(node.image, source || undefined) ?? pageImage(html, source || undefined)
		const author = credit(namesOf(node.author))
		const sourceName = credit(namesOf(node.publisher).slice(0, 1)) || pageSiteName(html)
		return {
			name,
			serves: firstNumber(node.recipeYield) || 2,
			minutes,
			tags: tagsOf(node.keywords),
			ingredients: lines.map(parseIngredient),
			steps: made,
			...(source ? { sourceUrl: source } : {}),
			...(sourceName ? { sourceName } : {}),
			...(author ? { author } : {}),
			...(image ? { imageUrl: image } : {}),
		}
	}
	return undefined
}

/** A page as the text `import-recipe` is given, when the page says nothing in JSON-LD. */
export function pageText(html: string, cap = 40_000): string {
	return htmlToText(html, cap)
}

/** The fewest characters of text a page with a recipe on it has: a name, a few ingredients and a step are more. */
const PAGE_TEXT_MIN = 200

/**
 * A page's text is too little to hold a recipe: what a site that turns apps away answers (a challenge page, a
 * "request unsuccessful" notice), or a page that draws itself with scripts. No model is asked to read one.
 */
export const pageSaysNothing = (text: string): boolean => text.trim().length < PAGE_TEXT_MIN

const whole = (value: unknown, fallback: number, max: number): number =>
	typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.min(max, Math.round(value)) : fallback

/**
 * A draft from what a model answered, or from what the Gardener handed `save-recipe`: the shape is held to on the
 * way out, and read leniently here, so one bad field never loses the recipe. Nothing when it has no name or no
 * ingredients.
 */
export function recipeDraft(value: unknown): RecipeDraft | undefined {
	const raw = value as Record<string, unknown> | null
	const name = clean(raw?.name)
	if (!raw || !name) return undefined
	const ingredients = (Array.isArray(raw.ingredients) ? raw.ingredients : []).flatMap(
		(entry: unknown): Ingredient[] => {
			if (typeof entry === 'string') return entry.trim() ? [parseIngredient(entry)] : []
			const line = entry as Record<string, unknown> | null
			const what = clean(line?.name)
			if (!line || !what) return []
			const qty = typeof line.qty === 'number' ? String(line.qty) : clean(line.qty)
			return [
				{
					name: what,
					qty,
					...(clean(line.unit) ? { unit: clean(line.unit) } : {}),
					...(clean(line.note) ? { note: clean(line.note) } : {}),
				},
			]
		}
	)
	if (!ingredients.length) return undefined
	const image = typeof raw.imageUrl === 'string' ? httpsAddress(raw.imageUrl) : undefined
	return {
		name,
		serves: whole(raw.serves, 2, 99),
		minutes: whole(raw.minutes, 0, 1440),
		tags: tagsOf(raw.tags),
		ingredients,
		steps: steps(raw.steps),
		...(clean(raw.sourceUrl) ? { sourceUrl: clean(raw.sourceUrl) } : {}),
		...(clean(raw.sourceName) ? { sourceName: clean(raw.sourceName).slice(0, 120) } : {}),
		...(clean(raw.author) ? { author: clean(raw.author).slice(0, 120) } : {}),
		...(clean(raw.tip) ? { tip: clean(raw.tip) } : {}),
		...(raw.scales === false ? { scales: false } : {}),
		...(image ? { imageUrl: image } : {}),
	}
}
