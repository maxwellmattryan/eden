// Hearth's line parsers (docs/design/ux-patterns.md, "Forms and quick-add"): "2 lb chicken thighs fridge" becomes a
// name, a quantity with its unit and a location; "4 limes" a grocery item; "1 1/2 cups short-grain rice, rinsed" a
// recipe's ingredient. The kit's `defaultParse` draws the same chips for the quick-add line; these return the fields
// the store writes. A line that will not parse is kept as a name, never refused.
import { UNIT_WORDS } from './quantity.js'
import type { Ingredient, StockLocation } from './types.js'

const UNITS = UNIT_WORDS.map((word) => word.replace(/ /g, '\\s+')).join('|')
const NUMBER = '\\d+\\s+\\d+\\s*\\/\\s*\\d+|\\d+\\s*\\/\\s*\\d+|\\d+(?:[.,]\\d+)?[½⅓⅔¼¾⅛]?|[½⅓⅔¼¾⅛]'
/** A number and the unit after it, when one follows as a word of its own; the unit is kept as it was written. */
const QUANTITY = new RegExp(`(${NUMBER})\\s*(?:((?:${UNITS})(?:e?s)?)\\.?(?![a-z]))?`, 'i')
const LOCATION = /\b(fridge|freezer|pantry|counter)\b/i

export interface ParsedStock {
	name: string
	qty: string
	unit?: string
	location?: StockLocation
}

const tidy = (text: string) => text.replace(/\s+/g, ' ').trim()

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
		qty = tidy(amount[1]!.replace(',', '.'))
		unit = amount[2] ? tidy(amount[2].toLowerCase()) : undefined
		rest = rest.replace(amount[0], ' ')
	}
	const name = tidy(rest)
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
	if (amount && amount.index === 0) {
		const number = tidy(amount[1]!.replace(',', '.'))
		qty = amount[2] ? `${number} ${tidy(amount[2].toLowerCase())}` : number
		rest = rest.slice(amount[0].length)
	}
	const name = tidy(rest)
	return { name: name || text.trim(), qty }
}

/**
 * A recipe's ingredient line as a page prints it: the amount first, a size in brackets left with the name, and
 * what follows a comma ("rinsed", "to taste") as the note. A line with no amount is all name.
 */
export function parseIngredient(line: string): Ingredient {
	const text = tidy(line.replace(/^[-*•·]\s*/, ''))
	const amount = QUANTITY.exec(text)
	let qty = ''
	let unit: string | undefined
	let rest = text
	if (amount && amount.index === 0) {
		qty = tidy(amount[1]!.replace(',', '.'))
		unit = amount[2] ? tidy(amount[2].toLowerCase()) : undefined
		rest = text.slice(amount[0].length)
	}
	rest = tidy(rest).replace(/^of\s+/i, '')
	const comma = rest.indexOf(',')
	const name = tidy(comma === -1 ? rest : rest.slice(0, comma))
	const note = comma === -1 ? '' : tidy(rest.slice(comma + 1))
	return { name: name || text, qty, ...(unit ? { unit } : {}), ...(note ? { note } : {}) }
}

/** An ingredient as a recipe prints it: the amount, the name, and the note after a comma. */
export function formatIngredient(line: Ingredient): string {
	return [[line.qty, line.unit, line.name].filter(Boolean).join(' '), line.note].filter(Boolean).join(', ')
}
