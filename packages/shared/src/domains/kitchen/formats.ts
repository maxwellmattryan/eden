// Hearth's data in formats made for reading, for its bundle (product/substrate/data.md, "Export"): the stock and the
// grocery list as CSV, the recipes as Markdown. The column names and headings are part of the format and are not
// translated, so a file reads the same whatever language wrote it.
import type { BundleExtra } from '../../data/bundle.js'
import { inline, toCsv, toMarkdown } from '../../data/text.js'
import type { KitchenData } from './types.js'

export function kitchenExtras(data: KitchenData): BundleExtra[] {
	const stock = toCsv(
		['name', 'quantity', 'unit', 'location', 'expiry', 'expiry estimated', 'low stock', 'category', 'source', 'added'],
		data.stock.map((item) => [
			item.name,
			item.qty,
			item.unit,
			item.location,
			item.expiry,
			item.estimated,
			item.lowStock,
			item.category,
			item.source,
			item.sourcedAt,
		])
	)
	const grocery = toCsv(
		['list', 'item', 'quantity', 'store', 'origin', 'note', 'done'],
		data.grocery.items.map((item) => [
			data.grocery.name,
			item.name,
			item.qty,
			item.store ?? data.grocery.store,
			item.origin,
			item.note,
			item.done,
		])
	)
	const recipes = toMarkdown(
		'Recipes',
		data.recipes.map((recipe) => ({
			heading: recipe.name,
			lines: [
				`- Serves ${recipe.serves}`,
				`- ${recipe.minutes} minutes`,
				recipe.tags.length ? `- Tags: ${recipe.tags.map(inline).join(', ')}` : undefined,
			],
		}))
	)
	return [
		{ path: 'friendly/stock.csv', content: stock },
		{ path: 'friendly/grocery.csv', content: grocery },
		{ path: 'friendly/recipes.md', content: recipes },
	]
}
