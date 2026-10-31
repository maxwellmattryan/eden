// The sample dataset (design/sample-data.md, "Hearth") mapped into the store's shapes. Dates shift with the real
// calendar so the seeded stock reads as the mockup does: spinach expires tomorrow, the haul came in yesterday.
import { grocery, haul, recipes, stock, type SampleRecipe } from '@eden/ui-kit/sample-data'
import { shiftSampleDate, shiftSampleDateTime } from '../../dates/index.js'
import type { GroceryItem, GroceryOrigin, KitchenData, StockItem } from './store.svelte.js'

/** The tips the sample stock carries (D-87): the dataset has the items, the app's sample has what is worth knowing of three. */
const TIP: Partial<Record<string, string>> = {
	'st-01': 'Keep on the lowest shelf, and cook or freeze within two days of the date.',
	'st-04': 'Wrap in a dry towel inside the bag; it wilts fastest in the door.',
	'st-17': 'Ripen on the counter, then move to the fridge to hold them a few more days.',
}

function origin(sample: string): Pick<GroceryItem, 'origin' | 'note'> {
	if (sample === 'low stock') return { origin: 'low-stock' }
	if (sample.startsWith('recipe')) {
		const note = sample.split(':')[1]?.trim()
		return { origin: 'recipe' as GroceryOrigin, note }
	}
	return { origin: 'manual' }
}

export function seedData(): KitchenData {
	const capturedAt = shiftSampleDateTime(haul.capturedAt)
	const captured = new Set(haul.rows.map((row) => row.name))
	return {
		stock: stock.map((item): StockItem => ({
			id: item.id,
			name: item.name,
			brand: item.brand,
			size: item.size,
			qty: item.qty,
			unit: item.unit,
			location: item.location,
			expiry: item.expiry ? shiftSampleDate(item.expiry) : undefined,
			estimated: item.estimated,
			threshold: item.lowStock ? 10 : undefined,
			category: item.category,
			tip: TIP[item.id],
			source: captured.has(item.name) ? 'capture' : 'sample',
			sourcedAt: capturedAt,
		})),
		recipes: recipes.map((recipe: SampleRecipe) => ({
			id: recipe.id,
			name: recipe.name,
			serves: recipe.serves,
			minutes: recipe.minutes,
			tags: [...recipe.tags],
			ingredients: recipe.ingredients.map((line) => ({ ...line })),
			steps: [...recipe.steps],
			...(recipe.tip ? { tip: recipe.tip } : {}),
		})),
		// the sample's ids stand in until the rows take their own (`kitchenRows`)
		grocery: {
			stores: grocery.stores.map((store, position) => ({
				id: store.id,
				name: store.name,
				sells: store.sells.map((kind) => (kind === 'home goods' ? 'home-goods' : kind)),
				position,
				...(store.shoppedOn ? { shoppedAt: `${shiftSampleDate(store.shoppedOn)}T10:00:00` } : {}),
				...(store.note ? { note: store.note } : {}),
				...(store.address || store.url || store.phone
					? {
							place: {
								...(store.address ? { address: store.address } : {}),
								...(store.url ? { url: store.url } : {}),
								...(store.phone ? { phone: store.phone } : {}),
							},
						}
					: {}),
			})),
			lists: grocery.lists.map((list) => ({
				id: list.id,
				...(list.storeId ? { storeId: list.storeId } : {}),
				...(list.shopDay ? { shopDay: shiftSampleDateTime(list.shopDay.replace(/^\w+ /, '')) } : {}),
			})),
			items: grocery.items.map((item) => ({
				id: item.id,
				listId: item.listId,
				name: item.name,
				...(item.brand ? { brand: item.brand } : {}),
				...(item.size ? { size: item.size } : {}),
				...(item.price === undefined ? {} : { price: item.price }),
				qty: item.qty,
				done: item.done,
				...origin(item.origin),
			})),
		},
	}
}
