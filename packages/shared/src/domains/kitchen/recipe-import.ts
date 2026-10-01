// A recipe read from what the owner brought (product/domains/kitchen.md, "Recipes"): a web page that says what it
// is in schema.org's `Recipe` (most recipe sites do, as JSON-LD) is read here with no model asked; anything else is
// text the `import-recipe` tool is given, and `recipeDraft` reads the model's answer into the same shape. A draft is
// never stored: the owner checks it in the Recipes view and saves it there.
import { parseIngredient } from './parse.js'
import { decodeEntities, htmlToText } from './sources.js'
import type { Ingredient, Recipe } from './types.js'

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

/** Every object in a JSON-LD document, through arrays and `@graph`. */
function nodes(value: unknown, found: Record<string, unknown>[] = [], depth = 0): Record<string, unknown>[] {
	if (depth > 6 || !value || typeof value !== 'object') return found
	if (Array.isArray(value)) {
		for (const entry of value) nodes(entry, found, depth + 1)
		return found
	}
	const node = value as Record<string, unknown>
	found.push(node)
	if (node['@graph']) nodes(node['@graph'], found, depth + 1)
	return found
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

/** Every object a page describes in JSON-LD, across its scripts; a script that does not parse is passed over. */
export function jsonLdNodes(html: string): Record<string, unknown>[] {
	const scripts = html.matchAll(
		/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script\s*>/gi
	)
	const found: Record<string, unknown>[] = []
	for (const [, body] of scripts) {
		try {
			nodes(JSON.parse(body!.trim()), found)
		} catch {
			continue
		}
	}
	return found
}

/** An `https` address a page names, absolute; nothing for any other kind of address. */
export function httpsAddress(value: string, base?: string): string | undefined {
	try {
		const url = new URL(value.trim(), base)
		return url.protocol === 'https:' ? url.href : undefined
	} catch {
		return undefined
	}
}

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

/** The `content` of a page's `<meta>` by its `property` or `name`, whichever order its attributes come in. */
function meta(html: string, key: string): string {
	for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
		const named = /\b(?:property|name)\s*=\s*["']?([^"'\s>]+)/i.exec(tag)?.[1]
		if (named?.toLowerCase() !== key) continue
		const content = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag)
		const value = clean(content?.[1] ?? content?.[2])
		if (value) return value
	}
	return ''
}

/** The picture a page shows of itself when it is shared (`og:image`): the fallback where its recipe names none. */
export function pageImage(html: string, url?: string): string | undefined {
	const named = meta(html, 'og:image:secure_url') || meta(html, 'og:image') || meta(html, 'twitter:image')
	return named ? httpsAddress(named, url) : undefined
}

/** What a page calls itself (`og:site_name`). */
export const pageSiteName = (html: string): string => meta(html, 'og:site_name').slice(0, 120)

/** The recipe a page describes in JSON-LD, or nothing when it describes none with both ingredients and steps. */
export function recipeFromJsonLd(html: string, url?: string): RecipeDraft | undefined {
	const scripts = html.matchAll(
		/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script\s*>/gi
	)
	for (const [, body] of scripts) {
		let parsed: unknown
		try {
			parsed = JSON.parse(body!.trim())
		} catch {
			continue
		}
		const node = nodes(parsed).find(isRecipe)
		if (!node) continue
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
