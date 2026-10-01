// What things cost (product/domains/kitchen.md, "Prices"; D-105): the last price each store remembers of a thing,
// and the two rough sums made of them, a grocery list's and a recipe's missing ingredients'. A price is what one
// package cost the last time, at that store; nothing here converts units or works out a price per weight, so a sum
// is "about", and what has no price is counted beside it and never guessed.
import { boughtOf, pricedAt } from './filing.js'
import { nameCovers, normaliseName } from './match.js'
import { parseAmount } from './quantity.js'
import type { GroceryItem, GroceryStore } from './types.js'

/** A price a store remembers, with the package and the brand it was for. */
export interface PriceFound {
	price: number
	size?: string
	brand?: string
	/** When it was learned, as an ISO timestamp. */
	at: string
	storeId: string
}

/** Every price the stores hold under a name that `matches`, the newest first. */
function prices(stores: readonly GroceryStore[], matches: (key: string) => boolean): PriceFound[] {
	const found: PriceFound[] = []
	for (const store of stores) {
		for (const [key, value] of Object.entries(store.bought ?? {})) {
			const entry = boughtOf(value)
			if (entry?.price === undefined || !matches(key)) continue
			found.push({
				price: entry.price,
				...(entry.size ? { size: entry.size } : {}),
				...(entry.brand ? { brand: entry.brand } : {}),
				at: pricedAt(entry),
				storeId: store.id,
			})
		}
	}
	return found.sort((a, b) => b.at.localeCompare(a.at))
}

/**
 * What a thing of this name costs: the last price at `storeId` when that store has one, else the newest any store
 * holds. The brand is not asked: another brand's price is still about what the thing costs.
 */
export function priceFor(name: string, stores: readonly GroceryStore[], storeId?: string): PriceFound | undefined {
	const key = normaliseName(name)
	if (!key) return undefined
	const found = prices(stores, (held) => held === key)
	return found.find((entry) => entry.storeId === storeId) ?? found[0]
}

/**
 * What a recipe's ingredient costs to buy: the price under its own name, else the newest under a name it covers
 * as stock covers an ingredient ("spinach" is priced by "baby spinach", never "rice" by "rice vinegar").
 */
export function priceNear(ingredient: string, stores: readonly GroceryStore[]): PriceFound | undefined {
	return priceFor(ingredient, stores) ?? prices(stores, (held) => nameCovers(ingredient, held))[0]
}

/** A rough sum: what the priced lines come to, how many they are, and how many have no price. */
export interface Estimate {
	total: number
	priced: number
	unpriced: number
}

const cents = (amount: number) => Math.round(amount * 100) / 100

/** How many packages a line is for: its quantity when that is a bare count ("2"), else one ("500 g", "a bunch"). */
function packages(qty: string): number {
	const amount = parseAmount(qty)
	return amount && amount.dim === 'count' && !amount.unit && amount.value >= 1 ? amount.value : 1
}

/**
 * About what a list costs: each line at the price the owner typed on it, else its store's last price, else the
 * newest anywhere, times its packages. Checked lines count too, so the sum does not shrink along the aisles.
 */
export function listEstimate(
	items: readonly Pick<GroceryItem, 'name' | 'qty' | 'price'>[],
	stores: readonly GroceryStore[],
	storeId?: string
): Estimate {
	let total = 0
	let priced = 0
	for (const item of items) {
		const price = item.price ?? priceFor(item.name, stores, storeId)?.price
		if (price === undefined) continue
		total += price * packages(item.qty)
		priced += 1
	}
	return { total: cents(total), priced, unpriced: items.length - priced }
}

/** About what a recipe's missing ingredients cost to buy: one package of each, whatever the recipe uses of it. */
export function missingEstimate(ingredients: readonly string[], stores: readonly GroceryStore[]): Estimate {
	let total = 0
	let priced = 0
	for (const ingredient of ingredients) {
		const found = priceNear(ingredient, stores)
		if (!found) continue
		total += found.price
		priced += 1
	}
	return { total: cents(total), priced, unpriced: ingredients.length - priced }
}
