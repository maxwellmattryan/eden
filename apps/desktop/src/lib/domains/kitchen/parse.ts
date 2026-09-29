// The quick-add parser for Hearth (docs/design/ux-patterns.md, "Forms and quick-add"): "2 lb chicken thighs fridge"
// becomes a name, a quantity with its unit and a location. The kit's `defaultParse` draws the same chips; this one
// returns the fields the store writes. An unparsed line is saved as a name, never a form.
import type { StockLocation } from './store.svelte.js'

const QUANTITY = /(\d+(?:[.,]\d+)?)\s*(kg|g|lb|lbs|oz|ml|l|packets?|cans?|boxe?s?|heads?|x)?\b/i
const LOCATION = /\b(fridge|freezer|pantry|counter)\b/i

export interface ParsedStock {
	name: string
	qty: string
	unit?: string
	location?: StockLocation
}

export function parseStock(text: string): ParsedStock {
	let rest = text.trim()
	let qty = '1'
	let unit: string | undefined
	let location: StockLocation | undefined
	const place = LOCATION.exec(rest)
	if (place) {
		location = place[1]!.toLowerCase() as StockLocation
		rest = rest.replace(place[0], ' ')
	}
	const amount = QUANTITY.exec(rest)
	if (amount) {
		qty = amount[1]!.replace(',', '.')
		unit = amount[2]?.toLowerCase()
		rest = rest.replace(amount[0], ' ')
	}
	const name = rest.replace(/\s+/g, ' ').trim()
	return { name: name || text.trim(), qty, unit, location }
}

export interface ParsedGrocery {
	name: string
	qty: string
}

/** "4 limes" becomes limes × 4; a bare line is the name with no quantity. */
export function parseGrocery(text: string): ParsedGrocery {
	let rest = text.trim()
	let qty = ''
	const amount = QUANTITY.exec(rest)
	if (amount && rest.startsWith(amount[0].trim())) {
		qty = amount[2] ? `${amount[1]} ${amount[2].toLowerCase()}` : amount[1]!
		rest = rest.slice(amount[0].length)
	}
	const name = rest.replace(/\s+/g, ' ').trim()
	return { name: name || text.trim(), qty }
}
