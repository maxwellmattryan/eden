// Hearth's shapes (product/domains/kitchen.md). The store holds them with their ids; a row's payload is the same
// shape without the id, which the row carries itself.
import type { EntityTypeId } from '../../registry/index.js'

export type StockLocation = 'fridge' | 'freezer' | 'pantry' | 'counter'
/** The four locations, fixed so capture can place items without a picker (kitchen.md, "Entities"). */
export const LOCATIONS: readonly StockLocation[] = ['fridge', 'freezer', 'pantry', 'counter']
export type StockSource = 'manual' | 'capture' | 'sample'

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
	lowStock?: boolean
	threshold?: number
	category?: string
	/** The storage tip for this item, bundled with the sample data until Tips exist. */
	tip?: string
	source: StockSource
	/** When it entered stock, as an ISO timestamp. */
	sourcedAt: string
}

export interface Recipe {
	id: string
	name: string
	serves: number
	minutes: number
	tags: string[]
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
export type RecipePayload = Omit<Recipe, 'id'>
export type GroceryListPayload = Omit<GroceryList, 'items'>
/** A grocery item names the list it is on. */
export type GroceryItemPayload = Omit<GroceryItem, 'id'> & { listId: string }
