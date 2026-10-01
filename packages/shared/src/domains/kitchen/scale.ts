// A recipe for more or fewer than it was written for (D-94): each amount is multiplied by the servings asked for
// over the servings written, and said the way a cook measures it, in fractions for spoons, cups and counts and in
// round numbers for grams and millilitres. An amount with no number in it ("a pinch", "to taste") is left as it
// is, and so is every line of a recipe that says it does not scale. Nothing is stored: the recipe keeps the amounts
// it was written with, and the steps are never rewritten.
import { parseAmount, unitOf } from './quantity.js'
import type { Ingredient, Recipe } from './types.js'

/** The most a recipe is scaled to, in servings. */
export const MAX_SERVES = 99

/** Whether a recipe's amounts follow its servings: they do unless it says otherwise. */
export const scalable = (recipe: Pick<Recipe, 'scales' | 'serves'>): boolean =>
	recipe.scales !== false && recipe.serves > 0

/** The fractions a cook measures in, as thirds and eighths of a whole. */
const FRACTIONS: readonly [number, string][] = [
	[1 / 8, '1/8'],
	[1 / 4, '1/4'],
	[1 / 3, '1/3'],
	[3 / 8, '3/8'],
	[1 / 2, '1/2'],
	[5 / 8, '5/8'],
	[2 / 3, '2/3'],
	[3 / 4, '3/4'],
	[7 / 8, '7/8'],
]
/** Units that are weighed or poured against a scale's marks: said in decimals, never in fractions. */
const METRIC = new Set(['mg', 'g', 'kg', 'ml', 'cl', 'dl', 'l'])

/** A number as a measuring spoon says it: "1 1/2", "3/4", "2"; a decimal when no kitchen fraction is close. */
function asFraction(value: number): string {
	const whole = Math.floor(value + 1e-9)
	const part = value - whole
	if (part < 0.04) return String(whole || (value > 0 ? round(value) : 0))
	if (part > 0.96) return String(whole + 1)
	const [near, text] = FRACTIONS.reduce((best, entry) =>
		Math.abs(entry[0] - part) < Math.abs(best[0] - part) ? entry : best
	)
	if (Math.abs(near - part) > 0.04) return String(round(value))
	return whole ? `${whole} ${text}` : text
}

const round = (value: number) => Math.round(value * 100) / 100

/** A weight or a volume on a scale: whole above ten, one decimal beneath it, two beneath one. */
function asDecimal(value: number): string {
	if (value >= 10) return String(Math.round(value))
	if (value >= 1) return String(Math.round(value * 10) / 10)
	return String(round(value))
}

/** A quantity multiplied, as the store would keep it; unchanged when it holds no number or the factor is one. */
export function scaleQty(qty: string, unit: string | undefined, factor: number): string {
	if (factor === 1 || !Number.isFinite(factor) || factor <= 0) return qty
	const amount = parseAmount(qty, unit)
	// "2-3" and "1 to 2" are ranges: half of one read as a single number would be wrong, so it stays as written
	if (!amount || /^\s*[\d.,/ ½⅓⅔¼¾⅛]+\s*(?:-|–|to\b)/i.test(qty)) return qty
	const value = amount.value * factor
	return METRIC.has(unitOf(unit).unit) ? asDecimal(value) : asFraction(value)
}

/** An ingredient for `factor` times the recipe. */
export function scaleIngredient(line: Ingredient, factor: number): Ingredient {
	const qty = scaleQty(line.qty, line.unit, factor)
	return qty === line.qty ? line : { ...line, qty }
}

/**
 * A recipe's ingredients for `serves`, which is what it is cooked, checked against the stock and shopped for at.
 * The recipe's own lines when that is what it serves, or when it does not scale.
 */
export function scaledIngredients(
	recipe: Pick<Recipe, 'ingredients' | 'serves' | 'scales'>,
	serves: number
): Ingredient[] {
	if (!scalable(recipe) || !Number.isFinite(serves) || serves <= 0 || serves === recipe.serves)
		return recipe.ingredients
	const factor = Math.min(MAX_SERVES, serves) / recipe.serves
	return recipe.ingredients.map((line) => scaleIngredient(line, factor))
}
