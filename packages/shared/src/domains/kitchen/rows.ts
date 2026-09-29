// Between Hearth's shapes and its rows: a whole `KitchenData` as the writes that store it (the sample data, and the
// document the store kept before the data layer), and the rows read back as a `KitchenData`.
import { toUri, type BatchOp, type Entity } from '../../data/index.js'
import {
	KITCHEN,
	type GroceryItemPayload,
	type GroceryList,
	type GroceryListPayload,
	type KitchenData,
	type RecipePayload,
	type StockPayload,
} from './types.js'

export const EMPTY_LIST: GroceryList = { name: '', store: '', items: [] }

export interface KitchenRows {
	/** The data with the ids its rows have. */
	data: KitchenData
	/** The id of the grocery list's row; none when the data has no list to speak of. */
	listId: string | undefined
	ops: BatchOp[]
}

const create = (type: string, id: string, payload: object): BatchOp => ({
	op: 'createEntity',
	input: { id, type, payload },
})

/**
 * The writes that store the data. Every record takes a new id, whatever id it had (the old document's were UUIDs,
 * the sample's are `st-01`), and ids are made in the order of the lists, so the rows read back in that order.
 */
export function kitchenRows(source: Partial<KitchenData>, newId: () => string): KitchenRows {
	const ops: BatchOp[] = []
	const stock = (source.stock ?? []).map((item) => ({ ...item, id: newId() }))
	for (const { id, ...payload } of stock) ops.push(create(KITCHEN.stock, id, payload satisfies StockPayload))

	const recipes = (source.recipes ?? []).map((recipe) => ({ ...recipe, id: newId() }))
	for (const { id, ...payload } of recipes) ops.push(create(KITCHEN.recipe, id, payload satisfies RecipePayload))

	const { items = [], ...list } = source.grocery ?? EMPTY_LIST
	const written = items.length > 0 || !!list.name || !!list.store || !!list.shopDay
	const listId = written ? newId() : undefined
	const grocery: GroceryList = { ...list, items: [] }
	if (listId) {
		ops.push(create(KITCHEN.list, listId, list satisfies GroceryListPayload))
		grocery.items = items.map((item) => ({ ...item, id: newId() }))
		for (const { id, ...payload } of grocery.items) {
			ops.push(create(KITCHEN.item, id, { ...payload, listId } satisfies GroceryItemPayload))
		}
	}
	return { data: { stock, recipes, grocery }, listId, ops }
}

/** The URIs of the rows the data is stored in. */
export function kitchenUris(data: KitchenData, listId: string | undefined): string[] {
	return [
		...data.stock.map((item) => toUri(KITCHEN.stock, item.id)),
		...data.recipes.map((recipe) => toUri(KITCHEN.recipe, recipe.id)),
		...data.grocery.items.map((item) => toUri(KITCHEN.item, item.id)),
		...(listId ? [toUri(KITCHEN.list, listId)] : []),
	]
}

/** The rows as the store holds them. The list is the first one made; its items are the ones that name it. */
export function kitchenFromRows(rows: {
	stock: Entity<StockPayload>[]
	recipes: Entity<RecipePayload>[]
	lists: Entity<GroceryListPayload>[]
	items: Entity<GroceryItemPayload>[]
}): Pick<KitchenRows, 'data' | 'listId'> {
	const list = rows.lists[0]
	return {
		listId: list?.id,
		data: {
			stock: rows.stock.map((row) => ({ ...row.payload, id: row.id })),
			recipes: rows.recipes.map((row) => ({ ...row.payload, id: row.id })),
			grocery: list
				? {
						...list.payload,
						items: rows.items
							.filter((row) => row.payload.listId === list.id)
							.map(({ id, payload: { listId: _listId, ...item } }) => ({ ...item, id })),
					}
				: { ...EMPTY_LIST },
		},
	}
}
