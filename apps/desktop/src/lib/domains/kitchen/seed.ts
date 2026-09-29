// The sample dataset (design/sample-data.md, "Hearth") mapped into the store's shapes. Dates shift with the real
// calendar so the seeded stock reads as the mockup does: spinach expires tomorrow, the haul came in yesterday.
import { grocery, haul, recipes, stock } from '@eden/ui-kit/sample-data'
import { shiftSampleDate, shiftSampleDateTime } from '@eden/shared/dates'
import type { GroceryItem, GroceryOrigin, KitchenData, StockItem } from './store.svelte.js'

const CATEGORY: Partial<Record<string, string>> = {
	'st-01': 'Meat',
	'st-04': 'Produce',
	'st-16': 'Supplements and mixes',
}
const TIP: Partial<Record<string, string>> = {
	'st-01': 'Keep on the lowest shelf, and cook or freeze within two days of the date.',
	'st-04': 'Wrap in a dry towel inside the bag; it wilts fastest in the door.',
	'st-16': 'Anywhere dry. Nine packets left: the list already has a box.',
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
			lowStock: item.lowStock,
			threshold: item.lowStock ? 10 : undefined,
			category: CATEGORY[item.id],
			tip: TIP[item.id],
			source: captured.has(item.name) ? 'capture' : 'sample',
			sourcedAt: capturedAt,
		})),
		recipes: recipes.map((recipe) => ({
			id: recipe.id,
			name: recipe.name,
			serves: recipe.serves,
			minutes: recipe.minutes,
			tags: [...recipe.tags],
		})),
		grocery: {
			name: grocery.name,
			store: STORE,
			shopDay: shiftSampleDateTime(grocery.shopDay.replace(/^\w+ /, '')),
			items: grocery.items.map((item) => ({
				id: item.id,
				name: item.name,
				qty: item.qty,
				done: item.done,
				...origin(item.origin),
			})),
		},
	}
}
