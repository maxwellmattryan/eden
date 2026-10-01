// Hearth's shapes (product/domains/kitchen.md). The store holds them with their ids; a row's payload is the same
// shape without the id, which the row carries itself.
import type { EntityTypeId } from '../../registry/index.js'

export type StockLocation = 'fridge' | 'freezer' | 'pantry' | 'counter'
/** The four locations, fixed so capture can place items without a picker (kitchen.md, "Entities"). */
export const LOCATIONS: readonly StockLocation[] = ['fridge', 'freezer', 'pantry', 'counter']
export type StockSource = 'manual' | 'capture' | 'sample'

/** What a stock item is a kind of: the ids capture chooses among and the page labels (`domains.kitchen.categories`). */
export const CATEGORIES = [
	'produce',
	'meat-and-fish',
	'dairy-and-eggs',
	'bakery',
	'grains-and-pasta',
	'canned-and-jarred',
	'frozen',
	'snacks',
	'drinks',
	'condiments-and-spices',
	'supplements-and-mixes',
	'other',
] as const
export type StockCategory = (typeof CATEGORIES)[number]

/** The registry id of the Attachment kind an item's picture is kept as (D-90). */
export const ITEM_PHOTO = 'item-photo'

/** What a capture reads: a shop just brought home, or the shelves as they stand (D-89). */
export type CaptureMode = 'haul' | 'stock'
export const CAPTURE_MODES: readonly CaptureMode[] = ['haul', 'stock']

export interface StockItem {
	id: string
	name: string
	qty: string
	unit?: string
	location: StockLocation
	/** The expiry as an ISO date; absent for what keeps. */
	expiry?: string
	/** The expiry was estimated by capture rather than read from a label. */
	estimated?: boolean
	/** Low stock is holding no more than this (`isLow`); absent for an item that is never low. */
	threshold?: number
	/** One of `CATEGORIES`; a row written before they were ids may hold its own words. */
	category?: string
	/** A storage or handling tip worth showing for this item (D-87): a line on the item, never a row of its own. */
	tip?: string
	/** The item's picture (D-90): the id of an `item-photo` Attachment, whose row holds the small image shown. */
	photo?: string
	source: StockSource
	/** When it entered stock, as an ISO timestamp. */
	sourcedAt: string
}

/** One line of a recipe: what, how much, and what the page said after the comma ("rinsed", "to taste"). */
export interface Ingredient {
	name: string
	/** The amount alone; empty for an ingredient with none. */
	qty: string
	unit?: string
	note?: string
}

export interface Recipe {
	id: string
	name: string
	serves: number
	minutes: number
	tags: string[]
	ingredients: Ingredient[]
	steps: string[]
	/** Where it came from, when it came from a page. */
	sourceUrl?: string
	/** A tip worth showing with the recipe (D-87). */
	tip?: string
}

export type GroceryOrigin = 'manual' | 'recipe' | 'low-stock'

export interface GroceryItem {
	id: string
	name: string
	qty: string
	store?: string
	origin: GroceryOrigin
	/** What the origin points at: the recipe's name. */
	note?: string
	done: boolean
}

export interface GroceryList {
	name: string
	/** The default store; an item may name its own. */
	store: string
	/** The shop-day Event, as an ISO timestamp. */
	shopDay?: string
	items: GroceryItem[]
}

export interface KitchenData {
	stock: StockItem[]
	recipes: Recipe[]
	grocery: GroceryList
}

/** The registry ids of Hearth's entity types (product/substrate/registry.md). */
export const KITCHEN = {
	stock: 'stock-item',
	recipe: 'recipe',
	list: 'grocery-list',
	item: 'grocery-item',
} as const satisfies Record<string, EntityTypeId>

export type StockPayload = Omit<StockItem, 'id'>
/** A recipe written before it held its lines has neither list; `kitchenFromRows` reads both as empty. */
export type RecipePayload = Omit<Recipe, 'id' | 'ingredients' | 'steps'> & {
	ingredients?: Ingredient[]
	steps?: string[]
}
export type GroceryListPayload = Omit<GroceryList, 'items'>
/** A grocery item names the list it is on. */
export type GroceryItemPayload = Omit<GroceryItem, 'id'> & { listId: string }
