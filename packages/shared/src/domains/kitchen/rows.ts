// Between Hearth's shapes and its rows: a whole `KitchenData` as the writes that store it (the sample data, and the
// document the store kept before the data layer), and the rows read back as a `KitchenData`.
import { toUri, type BatchOp, type Entity } from '../../data/index.js'
import {
	KITCHEN,
	type Grocery,
	type GroceryItemPayload,
	type GroceryListPayload,
	type GroceryStorePayload,
	type KitchenData,
	type LegacyGrocery,
	type RecipePayload,
	type StockPayload,
} from './types.js'
import { orderStores } from './filing.js'
import { groceryFromLegacy } from './upgrade.js'

export const emptyGrocery = (): Grocery => ({ stores: [], lists: [], items: [] })

/** What can be stored: today's data, or the old document, whose grocery was one list (D-96). */
export type KitchenSource = Partial<Omit<KitchenData, 'grocery'>> & { grocery?: Grocery | LegacyGrocery }

export interface KitchenRows {
	/** The data with the ids its rows have. */
	data: KitchenData
	ops: BatchOp[]
}

const create = (type: string, id: string, payload: object): BatchOp => ({
	op: 'createEntity',
	input: { id, type, payload },
})

/**
 * The writes that store the data. Every record takes a new id, whatever id it had (the old document's were UUIDs,
 * the sample's are `st-01`), and ids are made in the order of the lists, so the rows read back in that order. A
 * list keeps naming its store and an item its list, under their new ids; an item whose list is not there is left out.
 */
export function kitchenRows(source: KitchenSource, newId: () => string): KitchenRows {
	const ops: BatchOp[] = []
	const stock = (source.stock ?? []).map((item) => ({ ...item, id: newId() }))
	for (const { id, ...payload } of stock) ops.push(create(KITCHEN.stock, id, payload satisfies StockPayload))

	// a recipe from before it held its lines takes both lists empty
	const recipes = (source.recipes ?? []).map((recipe) => ({
		...recipe,
		id: newId(),
		ingredients: recipe.ingredients ?? [],
		steps: recipe.steps ?? [],
	}))
	for (const { id, ...payload } of recipes) ops.push(create(KITCHEN.recipe, id, payload satisfies RecipePayload))

	const given = source.grocery ?? emptyGrocery()
	const old = 'lists' in given ? given : groceryFromLegacy(given)
	const storeIds = new Map(old.stores.map((store) => [store.id, newId()]))
	const stores = old.stores.map((store) => ({ ...store, id: storeIds.get(store.id)! }))
	for (const { id, ...payload } of stores) ops.push(create(KITCHEN.store, id, payload satisfies GroceryStorePayload))

	const listIds = new Map(old.lists.map((list) => [list.id, newId()]))
	const lists = old.lists.map(({ storeId, ...list }) => {
		const store = storeId ? storeIds.get(storeId) : undefined
		return { ...list, id: listIds.get(list.id)!, ...(store ? { storeId: store } : {}) }
	})
	for (const { id, ...payload } of lists) ops.push(create(KITCHEN.list, id, payload satisfies GroceryListPayload))

	const items = old.items
		.filter((item) => listIds.has(item.listId))
		.map((item) => ({ ...item, id: newId(), listId: listIds.get(item.listId)! }))
	for (const { id, ...payload } of items) ops.push(create(KITCHEN.item, id, payload satisfies GroceryItemPayload))

	return { data: { stock, recipes, grocery: { stores, lists, items } }, ops }
}

/** The URIs of the rows the data is stored in. */
export function kitchenUris(data: KitchenData): string[] {
	return [
		...data.stock.map((item) => toUri(KITCHEN.stock, item.id)),
		...data.recipes.map((recipe) => toUri(KITCHEN.recipe, recipe.id)),
		...data.grocery.stores.map((store) => toUri(KITCHEN.store, store.id)),
		...data.grocery.lists.map((list) => toUri(KITCHEN.list, list.id)),
		...data.grocery.items.map((item) => toUri(KITCHEN.item, item.id)),
	]
}

/** The rows as the store holds them, each in the order it was made; the stores in the owner's order (D-101). */
export function kitchenFromRows(rows: {
	stock: Entity<StockPayload>[]
	recipes: Entity<RecipePayload>[]
	stores: Entity<GroceryStorePayload>[]
	lists: Entity<GroceryListPayload>[]
	items: Entity<GroceryItemPayload>[]
}): KitchenData {
	return {
		stock: rows.stock.map((row) => ({ ...row.payload, id: row.id })),
		recipes: rows.recipes.map((row) => ({
			...row.payload,
			ingredients: row.payload.ingredients ?? [],
			steps: row.payload.steps ?? [],
			id: row.id,
		})),
		grocery: {
			stores: orderStores(rows.stores.map((row) => ({ ...row.payload, id: row.id }))),
			lists: rows.lists.map((row) => ({ ...row.payload, id: row.id })),
			items: rows.items.map((row) => ({ ...row.payload, id: row.id })),
		},
	}
}
