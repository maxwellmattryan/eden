// The sample dataset (design/sample-data.md, "Hearth") mapped into the store's shapes. Dates shift with the real
// calendar so the seeded stock reads as the mockup does: spinach expires tomorrow, the haul came in yesterday.
import { grocery, groceryShopDay, haul, recipes, stock, type SampleRecipe } from '@eden/ui-kit/sample-data'
import { shiftSampleDate, shiftSampleDateTime } from '@eden/shared/dates'
import type { GroceryItem, GroceryOrigin, KitchenData, StockItem } from './store.svelte.js'

/** The tips the sample stock carries (D-87): the dataset has the items, the app's sample has what is worth knowing of three. */
const TIP: Partial<Record<string, string>> = {
	'st-01': 'Keep on the lowest shelf, and cook or freeze within two days of the date.',
	'st-04': 'Wrap in a dry towel inside the bag; it wilts fastest in the door.',
	'st-17': 'Ripen on the counter, then move to the fridge to hold them a few more days.',
}
const STORE = 'H-E-B'

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
		grocery: {
			name: '',
			store: STORE,
			shopDay: shiftSampleDateTime(groceryShopDay.replace(/^\w+ /, '')),
			// the one list of today's shape: an item bought elsewhere names its store, an unfiled one sits under the default
			items: grocery.items.map((item) => {
				const storeId = grocery.lists.find((list) => list.id === item.listId)?.storeId
				const store = grocery.stores.find((entry) => entry.id === storeId)?.name
				return {
					id: item.id,
					name: item.name,
					qty: item.qty,
					done: item.done,
					...(store && store !== STORE ? { store } : {}),
					...origin(item.origin),
				}
			}),
		},
	}
}
