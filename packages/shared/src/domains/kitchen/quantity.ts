// Hearth's amounts (product/domains/kitchen.md, "Cooking decrements stock"): a quantity as the store keeps it, a
// string and an optional unit, read as a number in a dimension so two of them can be added (a haul merged into what
// is there), subtracted (a recipe cooked) and compared (low stock). An amount stays in the unit it was entered in;
// conversion is for the arithmetic alone, and only within a dimension: grams never become cups.

export type Dimension = 'mass' | 'volume' | 'count'

export interface Amount {
	value: number
	/** The unit as the tables below name it; empty for a plain count. */
	unit: string
	dim: Dimension
}

/** Grams in one of each mass unit. */
const MASS: Record<string, number> = { mg: 0.001, g: 1, kg: 1000, oz: 28.3495, lb: 453.592 }
/** Millilitres in one of each volume unit; the cup, the spoons and the pint are the US ones. */
const VOLUME: Record<string, number> = {
	ml: 1,
	cl: 10,
	dl: 100,
	l: 1000,
	tsp: 4.92892,
	tbsp: 14.7868,
	'fl oz': 29.5735,
	cup: 236.588,
	pt: 473.176,
	qt: 946.353,
	gal: 3785.41,
}

/** How a unit is written, to the name the tables know it by. */
const ALIASES: Record<string, string> = {
	milligram: 'mg',
	gram: 'g',
	gm: 'g',
	gr: 'g',
	kilogram: 'kg',
	kilo: 'kg',
	ounce: 'oz',
	pound: 'lb',
	lbs: 'lb',
	millilitre: 'ml',
	milliliter: 'ml',
	centilitre: 'cl',
	centiliter: 'cl',
	decilitre: 'dl',
	deciliter: 'dl',
	litre: 'l',
	liter: 'l',
	teaspoon: 'tsp',
	tablespoon: 'tbsp',
	tbs: 'tbsp',
	'fluid ounce': 'fl oz',
	floz: 'fl oz',
	pint: 'pt',
	quart: 'qt',
	gallon: 'gal',
	// a plain count, however it is said
	x: '',
	ea: '',
	each: '',
	pc: '',
	pcs: '',
	piece: '',
	count: '',
	ct: '',
	unit: '',
}

/** The units a quick-add line and a recipe line are read for, longest first so `fl oz` wins over `oz`. */
export const UNIT_WORDS: readonly string[] = [
	...Object.keys(ALIASES).filter((word) => ALIASES[word] !== ''),
	...Object.keys(MASS),
	...Object.keys(VOLUME),
	'cups',
	'pints',
	'quarts',
	'gallons',
	'packet',
	'pack',
	'can',
	'tin',
	'jar',
	'bottle',
	'box',
	'bag',
	'roll',
	'bunch',
	'head',
	'clove',
	'stick',
	'slice',
	'pinch',
	'dozen',
].sort((a, b) => b.length - a.length)

/** A count's own word in the singular: packets and packet are one unit, boxes and box another. */
function singular(unit: string): string {
	if (unit.endsWith('ches') || unit.endsWith('shes') || unit.endsWith('xes')) return unit.slice(0, -2)
	if (unit.endsWith('ies')) return `${unit.slice(0, -3)}y`
	if (unit.endsWith('s') && !unit.endsWith('ss')) return unit.slice(0, -1)
	return unit
}

/** A unit as the tables name it, and the dimension it measures. */
export function unitOf(text: string | undefined): { unit: string; dim: Dimension } {
	const lower = (text ?? '').trim().toLowerCase().replace(/\.$/, '')
	const bare = singular(lower)
	const named = ALIASES[lower] ?? ALIASES[bare] ?? (lower in MASS || lower in VOLUME ? lower : bare)
	if (named in MASS) return { unit: named, dim: 'mass' }
	if (named in VOLUME) return { unit: named, dim: 'volume' }
	return { unit: named, dim: 'count' }
}

const FRACTIONS: Record<string, number> = { '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75, '⅛': 0.125 }

/** The number a quantity starts with ("2", "2.5", "2,5", "1/2", "1 1/2", "1½") and what follows it. */
function leadingNumber(text: string): { value: number; rest: string } | null {
	const match = /^\s*(?:(\d+)\s+(\d+)\s*\/\s*(\d+)|(\d+)\s*\/\s*(\d+)|(\d+(?:[.,]\d+)?)\s*([½⅓⅔¼¾⅛])?|([½⅓⅔¼¾⅛]))/.exec(
		text
	)
	if (!match) return null
	const rest = text.slice(match[0].length)
	if (match[1]) return { value: Number(match[1]) + Number(match[2]) / Number(match[3]), rest }
	if (match[4]) return { value: Number(match[4]) / Number(match[5]), rest }
	if (match[6]) return { value: Number(match[6].replace(',', '.')) + (match[7] ? FRACTIONS[match[7]]! : 0), rest }
	return { value: FRACTIONS[match[8]!]!, rest }
}

/**
 * A stored quantity as an amount. The unit is the item's own when it has one, else whatever follows the number
 * ("1 box", "500 g" on a grocery line). `null` for a quantity with no number in it, or a division by zero.
 */
export function parseAmount(qty: string | undefined, unit?: string): Amount | null {
	const read = leadingNumber(qty ?? '')
	if (!read || !Number.isFinite(read.value) || read.value < 0) return null
	return { value: read.value, ...unitOf(unit?.trim() ? unit : read.rest) }
}

/** Whether two amounts can be added: the same dimension, and for a count the same word. */
export function compatible(a: Amount, b: Amount): boolean {
	if (a.dim !== b.dim) return false
	return a.dim !== 'count' || a.unit === b.unit
}

/** An amount in another unit of its dimension. */
function convert(amount: Amount, unit: string): number {
	if (amount.dim === 'count' || amount.unit === unit) return amount.value
	const table = amount.dim === 'mass' ? MASS : VOLUME
	return (amount.value * table[amount.unit]!) / table[unit]!
}

/** The two together, in the first one's unit; `null` when they cannot be added. */
export function add(a: Amount, b: Amount): Amount | null {
	return compatible(a, b) ? { ...a, value: a.value + convert(b, a.unit) } : null
}

/** The first less the second, in the first one's unit and never below zero; `null` when they cannot be compared. */
export function subtract(a: Amount, b: Amount): Amount | null {
	return compatible(a, b) ? { ...a, value: Math.max(0, a.value - convert(b, a.unit)) } : null
}

/** Whether the first holds at least the second; `null` when they cannot be compared. */
export function covers(a: Amount, b: Amount): boolean | null {
	return compatible(a, b) ? a.value + 1e-9 >= convert(b, a.unit) : null
}

/** An amount as the store keeps it: at most two decimals, none that say nothing. */
export function formatAmount(amount: Amount): { qty: string; unit?: string } {
	const rounded = Math.round(amount.value * 100) / 100
	return { qty: String(rounded), ...(amount.unit ? { unit: amount.unit } : {}) }
}

/** Low stock: the item has a threshold and holds no more than it. An item with no threshold is never low. */
export function isLow(item: { qty: string; unit?: string; threshold?: number }): boolean {
	if (item.threshold === undefined || !Number.isFinite(item.threshold)) return false
	const amount = parseAmount(item.qty, item.unit)
	return !!amount && amount.value <= item.threshold
}

/** Ran out (D-92): the item holds nothing. Derived from its quantity, like low stock, never stored. */
export function isOut(item: { qty: string; unit?: string }): boolean {
	return parseAmount(item.qty, item.unit)?.value === 0
}
