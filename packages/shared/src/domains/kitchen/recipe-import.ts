// A recipe read from what the owner brought (product/domains/kitchen.md, "Recipes"): a web page that says what it
// is in schema.org's `Recipe` (most recipe sites do, as JSON-LD) is read here with no model asked; anything else is
// text the `import-recipe` tool is given, and `recipeDraft` reads the model's answer into the same shape. A draft is
// never stored: the owner checks it in the Recipes view and saves it there.
import { parseIngredient } from './parse.js'
import { decodeEntities, htmlToText } from './sources.js'
import type { Ingredient, Recipe } from './types.js'

/** A recipe before it is a row: everything but the id. */
export type RecipeDraft = Omit<Recipe, 'id'>

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
		return {
			name,
			serves: firstNumber(node.recipeYield) || 2,
			minutes,
			tags: tagsOf(node.keywords),
			ingredients: lines.map(parseIngredient),
			steps: made,
			...(source ? { sourceUrl: source } : {}),
		}
	}
	return undefined
}

/** A page as the text `import-recipe` is given, when the page says nothing in JSON-LD. */
export function pageText(html: string, cap = 40_000): string {
	return htmlToText(html, cap)
}

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
	return {
		name,
		serves: whole(raw.serves, 2, 99),
		minutes: whole(raw.minutes, 0, 1440),
		tags: tagsOf(raw.tags),
		ingredients,
		steps: steps(raw.steps),
		...(clean(raw.sourceUrl) ? { sourceUrl: clean(raw.sourceUrl) } : {}),
		...(clean(raw.tip) ? { tip: clean(raw.tip) } : {}),
	}
}
