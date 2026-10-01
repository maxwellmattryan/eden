// Finding a recipe among many (product/domains/kitchen.md, "Recipes"): the words the owner typed, the filters they
// switched on and the order they asked for, worked out here from the rows and the stock, with no model asked. A
// search is read as a cook would say it: "spinach, tofu" is every recipe that has both, by its name, a tag, an
// ingredient or who wrote it.
import { ingredientStatus, type TonightPick } from './cook.js'
import { singular } from './match.js'
import type { Recipe, StockItem } from './types.js'

export type RecipeSort = 'tonight' | 'name' | 'quickest' | 'missing'
export const RECIPE_SORTS: readonly RecipeSort[] = ['tonight', 'name', 'quickest', 'missing']

export interface RecipeFilters {
	/** What was typed: words and phrases, apart by commas or spaces, all of which a recipe must have. */
	search: string
	/** Every ingredient is in stock: nothing to shop for. */
	inStock: boolean
	/** Takes no longer than this, in minutes; 0 for any length. A recipe that does not say how long is left out. */
	maxMinutes: number
	/** Uses something that is about to expire. */
	expiring: boolean
	/** Carries every one of these tags. */
	tags: readonly string[]
}

export const NO_FILTERS: RecipeFilters = { search: '', inStock: false, maxMinutes: 0, expiring: false, tags: [] }

/** Whether any filter is on. */
export const filtering = (filters: RecipeFilters): boolean =>
	!!filters.search.trim() || filters.inStock || filters.maxMinutes > 0 || filters.expiring || filters.tags.length > 0

/** Text as it is searched: lower case, no accents, each word in the singular. */
const plain = (text: string): string =>
	text
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.split(/[^a-z0-9぀-ヿ一-龯]+/)
		.filter(Boolean)
		.map(singular)
		.join(' ')

/** What was typed, as the terms a recipe must each have: phrases between commas, or single words when there are none. */
export function searchTerms(search: string): string[] {
	const parts = search.includes(',') ? search.split(',') : search.split(/\s+/)
	return parts.map(plain).filter(Boolean)
}

/** Everything a recipe is found by. */
const haystack = (recipe: Recipe): string =>
	` ${[recipe.name, ...recipe.tags, ...recipe.ingredients.map((line) => line.name), recipe.author, recipe.sourceName]
		.filter((text): text is string => !!text)
		.map(plain)
		.join(' | ')}`

/** Whether a recipe has every term, each at the start of a word: "tom" finds tomato, never "bottom". */
export function matchesSearch(recipe: Recipe, terms: readonly string[]): boolean {
	if (!terms.length) return true
	const text = haystack(recipe)
	return terms.every((term) => text.includes(` ${term}`))
}

/** Every tag the recipes carry, the most used first, then by name. */
export function recipeTags(recipes: readonly Recipe[]): string[] {
	const counts = new Map<string, number>()
	for (const recipe of recipes) for (const tag of new Set(recipe.tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1)
	return [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)! || a.localeCompare(b))
}

/**
 * The recipes the filters leave, in the order asked for. `tonight` is `cookTonight`'s answer, whose order is
 * tonight's and whose picks say what each uses up; a recipe it left out (it names something the owner avoids) is
 * still listed, after the rest, so it can be found and changed.
 */
export function browseRecipes(
	recipes: readonly Recipe[],
	stock: readonly StockItem[],
	tonight: readonly TonightPick[],
	filters: RecipeFilters,
	sort: RecipeSort = 'tonight'
): Recipe[] {
	const terms = searchTerms(filters.search)
	const picks = new Map(tonight.map((pick, index) => [pick.recipe.id, { pick, index }]))
	const missing = new Map<string, number>()
	const missingOf = (recipe: Recipe) => {
		let count = missing.get(recipe.id)
		if (count === undefined) {
			count =
				picks.get(recipe.id)?.pick.missing ??
				ingredientStatus(recipe, stock).filter((line) => line.state === 'missing').length
			missing.set(recipe.id, count)
		}
		return count
	}
	const kept = recipes.filter(
		(recipe) =>
			matchesSearch(recipe, terms) &&
			(!filters.inStock || (recipe.ingredients.length > 0 && missingOf(recipe) === 0)) &&
			(!filters.maxMinutes || (recipe.minutes > 0 && recipe.minutes <= filters.maxMinutes)) &&
			(!filters.expiring || !!picks.get(recipe.id)?.pick.uses.length) &&
			filters.tags.every((tag) => recipe.tags.includes(tag))
	)
	const byName = (a: Recipe, b: Recipe) => a.name.localeCompare(b.name)
	/** A recipe that does not say how long it takes sorts after every one that does. */
	const minutes = (recipe: Recipe) => recipe.minutes || Number.MAX_SAFE_INTEGER
	const orders: Record<RecipeSort, (a: Recipe, b: Recipe) => number> = {
		tonight: (a, b) =>
			(picks.get(a.id)?.index ?? Number.MAX_SAFE_INTEGER) - (picks.get(b.id)?.index ?? Number.MAX_SAFE_INTEGER) ||
			byName(a, b),
		name: byName,
		quickest: (a, b) => minutes(a) - minutes(b) || byName(a, b),
		missing: (a, b) => missingOf(a) - missingOf(b) || byName(a, b),
	}
	return [...kept].sort(orders[sort])
}
