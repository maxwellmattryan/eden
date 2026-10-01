// Recipes against the stock (product/domains/kitchen.md, "Cooking decrements stock" and the `cook-tonight` widget):
// which of a recipe's ingredients are in stock, what cooking it takes from each item, and which recipes tonight's
// stock suggests. All of it is worked out here, on this device, from the rows: no model is asked, and every
// suggestion passes the safety filter (D-25).
import { expiresSoon } from './digest.js'
import { stockFor } from './match.js'
import { covers, formatAmount, parseAmount, subtract } from './quantity.js'
import { isSafe } from './safety.js'
import type { Ingredient, Recipe, StockItem } from './types.js'

export interface IngredientStatus {
	ingredient: Ingredient
	/** In stock when an item covers it by name, whatever it holds; missing when none does. */
	state: 'in-stock' | 'missing'
	/** The item that covers it, the soonest to expire. */
	stockId?: string
	/** Whether the item holds as much as the recipe asks; absent when the two amounts cannot be compared. */
	enough?: boolean
}

/** Each ingredient of a recipe, marked in stock or missing. */
export function ingredientStatus(recipe: Pick<Recipe, 'ingredients'>, stock: readonly StockItem[]): IngredientStatus[] {
	return recipe.ingredients.map((ingredient) => {
		const [item] = stockFor(ingredient.name, stock)
		if (!item) return { ingredient, state: 'missing' }
		const needed = parseAmount(ingredient.qty, ingredient.unit)
		const held = parseAmount(item.qty, item.unit)
		const enough = needed && held ? covers(held, needed) : null
		return { ingredient, state: 'in-stock', stockId: item.id, ...(enough === null ? {} : { enough }) }
	})
}

/**
 * What cooking does to one ingredient's item:
 * `subtract` takes the amount off (`after` is what is left, `empty` when that is nothing);
 * `ask` is an item whose unit the recipe's cannot be taken from (cloves from a head), which the owner answers;
 * `skip` is an ingredient with no amount, or one that is not in stock: nothing changes.
 */
export interface CookLine {
	ingredient: Ingredient
	state: 'subtract' | 'ask' | 'skip'
	stockId?: string
	stockName?: string
	/** What the item holds now, as the page shows it. */
	held?: string
	/** What it holds after, as the page shows it; only for `subtract`. */
	after?: string
	/** The quantity alone after, in the item's own unit: what the store writes. */
	afterQty?: string
	/** Nothing is left after. */
	empty?: boolean
}

const shown = (item: Pick<StockItem, 'qty' | 'unit'>) => (item.unit ? `${item.qty} ${item.unit}` : item.qty)

/** What "I cooked this" would take from the stock, one line per ingredient. */
export function cookPlan(recipe: Pick<Recipe, 'ingredients'>, stock: readonly StockItem[]): CookLine[] {
	// two ingredients may draw on one item: the second is taken from what the first left
	const left = new Map<string, string>()
	return recipe.ingredients.map((ingredient): CookLine => {
		const [item] = stockFor(ingredient.name, stock)
		if (!item) return { ingredient, state: 'skip' }
		const qty = left.get(item.id) ?? item.qty
		const base = { ingredient, stockId: item.id, stockName: item.name, held: shown({ qty, unit: item.unit }) }
		const needed = parseAmount(ingredient.qty, ingredient.unit)
		if (!needed) return { ...base, state: 'skip' }
		const held = parseAmount(qty, item.unit)
		const rest = held ? subtract(held, needed) : null
		if (!rest) return { ...base, state: 'ask' }
		const after = formatAmount(rest).qty
		left.set(item.id, after)
		return {
			...base,
			state: 'subtract',
			after: shown({ qty: after, unit: item.unit }),
			afterQty: after,
			empty: rest.value === 0,
		}
	})
}

/** What an item holds after a cook line took from it: the quantity alone, in the item's own unit. */
export function cookedQty(item: Pick<StockItem, 'qty' | 'unit'>, ingredient: Ingredient): string | null {
	const held = parseAmount(item.qty, item.unit)
	const needed = parseAmount(ingredient.qty, ingredient.unit)
	const rest = held && needed ? subtract(held, needed) : null
	return rest ? formatAmount(rest).qty : null
}

export interface TonightPick {
	recipe: Recipe
	/** The names of the expiring items it uses up. */
	uses: string[]
	/** How many of its ingredients are not in stock. */
	missing: number
}

/**
 * The recipes for tonight, best first: the one that uses the most of what is about to expire, then the one that
 * needs the least that is not in stock, then the quickest. A recipe that names a forbidden word in its name, its
 * tags or its ingredients is left out, and all are when the words could not be read (`null`).
 */
export function cookTonight(
	recipes: readonly Recipe[],
	stock: readonly StockItem[],
	words: readonly string[] | null,
	today?: string
): TonightPick[] {
	const byId = new Map(stock.map((item) => [item.id, item]))
	return recipes
		.filter((recipe) => isSafe([recipe.name, ...recipe.tags, ...recipe.ingredients.map((line) => line.name)], words))
		.map((recipe) => {
			const status = ingredientStatus(recipe, stock)
			const uses = new Set<string>()
			for (const line of status) {
				const item = line.stockId ? byId.get(line.stockId) : undefined
				if (item && expiresSoon(item, today)) uses.add(item.name)
			}
			return { recipe, uses: [...uses], missing: status.filter((line) => line.state === 'missing').length }
		})
		.sort((a, b) => b.uses.length - a.uses.length || a.missing - b.missing || a.recipe.minutes - b.recipe.minutes)
}
