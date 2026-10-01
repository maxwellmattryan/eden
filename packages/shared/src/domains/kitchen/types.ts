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
/** The registry id of the Attachment kind a recipe's picture is kept as (D-93). */
export const RECIPE_PHOTO = 'recipe-photo'
/** The registry id of the Attachment kind a store's picture is kept as (D-103). */
export const STORE_PHOTO = 'store-photo'

/** What a capture reads: a shop just brought home, or the shelves as they stand (D-89). */
export type CaptureMode = 'haul' | 'stock'
export const CAPTURE_MODES: readonly CaptureMode[] = ['haul', 'stock']

export interface StockItem {
	id: string
	/** The thing itself, "butter": what it is matched by. Who makes it is `brand` (D-104). */
	name: string
	/** Who makes it, when that matters: "Kerrygold". */
	brand?: string
	/** How much one package is: "16 oz", "12 ct". */
	size?: string
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
	/** When it ran out, as an ISO timestamp (D-92): set while it holds nothing, gone once it is bought again. */
	outAt?: string
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
	/** What it came from, by name (D-93): the site, the magazine, the cookbook. */
	sourceName?: string
	/** Who wrote it, as the source credits them (D-93). */
	author?: string
	/** A tip worth showing with the recipe (D-87). */
	tip?: string
	/** The recipe's picture (D-93): the id of a `recipe-photo` Attachment, whose row holds the small image. */
	photo?: string
	/** `false` for a recipe whose amounts do not follow its servings (D-107): a loaf, a cake in one tin. */
	scales?: boolean
}

export type GroceryOrigin = 'manual' | 'recipe' | 'low-stock' | 'ran-out'

/** What a store sells: the two kinds of thing Hearth shops for. */
export const STORE_SELLS = ['grocery', 'home-goods'] as const
export type StoreSells = (typeof STORE_SELLS)[number]

/** What a store remembers of one thing (D-97, D-105): when it was last bought or listed there, and what was last paid. */
export interface Bought {
	/** When it was last bought here, or put on this store's list, as an ISO timestamp. */
	at: string
	/** What one package last cost here, in the one currency. */
	price?: number
	/** The package and the brand that price was for. */
	size?: string
	brand?: string
	/** When the price was learned, where that is before `at`: a listing moves `at` on and leaves the price. */
	pricedAt?: string
}

/** A store Hearth shops at (D-96). Each has a list of its own. */
export interface GroceryStore {
	id: string
	name: string
	sells: StoreSells[]
	/** What was last bought here, by normalised name: when, which files a new item (D-97), and what was paid (D-105). */
	bought?: Record<string, Bought>
	/** Where the store sits among the stores, lowest first (D-101); one without sorts last, as it was made. */
	position?: number
	/** When its list was last completed, as an ISO timestamp: the last trip. */
	shoppedAt?: string
	/** The owner's own note about the store: where to park, what it never has. */
	note?: string
	/** Where the store is, until it links a `venue` Place (D-101). */
	place?: StorePlace
	/** The store's picture (D-103): the id of a `store-photo` Attachment, whose row holds the small image shown. */
	photo?: string
}

/**
 * What a Place will hold of a store (product/substrate/primitives.md, "Place"), under the names it has there, so
 * the move to a `venue` Place is a copy. The address is the owner's to type and is T2, as a Place's is.
 */
export interface StorePlace {
	address?: string
	url?: string
	phone?: string
}

/** One store's list; the list with no store holds what is not filed yet. */
export interface GroceryList {
	id: string
	storeId?: string
	/** The shop day, as an ISO timestamp; a list has none until the owner sets one. */
	shopDay?: string
}

/** An item on a store's list. */
export interface GroceryItem {
	id: string
	name: string
	/** The brand to buy, and the package's size, as a stock item holds them (D-104). */
	brand?: string
	size?: string
	/** What one is expected to cost, as the owner typed it (D-105); its store learns it when the list is completed. */
	price?: number
	qty: string
	listId: string
	origin: GroceryOrigin
	/** What the origin points at: the recipe's name. */
	note?: string
	done: boolean
}

/** Everything Grocery holds: the stores, their lists and the items on them. */
export interface Grocery {
	stores: GroceryStore[]
	lists: GroceryList[]
	items: GroceryItem[]
}

/**
 * The one list of before there was a list per store (D-96), as the old document held it: a name and a default
 * store, both free text, and items that may name another store.
 */
export interface LegacyGrocery {
	name?: string
	store?: string
	shopDay?: string
	items?: (Omit<GroceryItem, 'listId'> & { store?: string })[]
}

export interface KitchenData {
	stock: StockItem[]
	recipes: Recipe[]
	grocery: Grocery
}

/** The registry ids of Hearth's entity types (product/substrate/registry.md). */
export const KITCHEN = {
	stock: 'stock-item',
	recipe: 'recipe',
	store: 'grocery-store',
	list: 'grocery-list',
	item: 'grocery-item',
} as const satisfies Record<string, EntityTypeId>

export type StockPayload = Omit<StockItem, 'id'>
/** A recipe written before it held its lines has neither list; `kitchenFromRows` reads both as empty. */
export type RecipePayload = Omit<Recipe, 'id' | 'ingredients' | 'steps'> & {
	ingredients?: Ingredient[]
	steps?: string[]
}
/** A store written before it remembered prices holds a bare timestamp for each name; `boughtOf` reads either. */
export type GroceryStorePayload = Omit<GroceryStore, 'id' | 'bought'> & { bought?: Record<string, Bought | string> }
export type GroceryListPayload = Omit<GroceryList, 'id'>
/** A grocery item names the list it is on. */
export type GroceryItemPayload = Omit<GroceryItem, 'id'>
