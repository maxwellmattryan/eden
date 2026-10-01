// Matching names in Hearth, locally and the same way every time: a captured row against the stock it would merge
// into (product/domains/kitchen.md, "Capture a haul": the same name and location), and a recipe's ingredient against
// the stock that covers it. Both read a name the way a shopper would: case, plurals and the words that only describe
// ("fresh", "large", "(low sodium)") do not make two things of one.
import { compatible, isOut, parseAmount } from './quantity.js'
import type { StockItem, StockLocation } from './types.js'

/** Words that describe a food without making it another food. */
const DESCRIPTORS = new Set([
	'fresh',
	'organic',
	'large',
	'small',
	'medium',
	'extra',
	'ripe',
	'raw',
	'whole',
	'free',
	'range',
	'boneless',
	'skinless',
	'of',
	'the',
	'a',
	'an',
])

/** Words that name the cut or the piece: an ingredient may leave them off ("salmon" for "salmon fillets"). */
const FORMS = new Set([
	'fillet',
	'filet',
	'thigh',
	'breast',
	'drumstick',
	'clove',
	'head',
	'bunch',
	'leaf',
	'stalk',
	'sprig',
	'piece',
	'slice',
	'stick',
	'bulb',
])

/** Words that end in s and are not plurals. */
const SINGULAR_AS_IS = new Set([
	'hummus',
	'asparagus',
	'couscous',
	'molasses',
	'citrus',
	'swiss',
	'lemongrass',
	'watercress',
])

/** A word in the singular, by the rules English food words follow. */
export function singular(word: string): string {
	if (word.length <= 3 || SINGULAR_AS_IS.has(word) || word.endsWith('ss') || word.endsWith('us')) return word
	if (word.endsWith('leaves')) return `${word.slice(0, -3)}f`
	if (word.endsWith('ies')) return `${word.slice(0, -3)}y`
	if (/(?:ch|sh|x|z|o)es$/.test(word)) return word.slice(0, -2)
	return word.endsWith('s') ? word.slice(0, -1) : word
}

/** A name as its words: lower case, no accents, nothing in brackets, no punctuation, singular, descriptors dropped. */
function words(name: string): string[] {
	return name
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/\([^)]*\)/g, ' ')
		.replace(/[^a-z0-9぀-ヿ一-龯]+/g, ' ')
		.split(' ')
		.filter(Boolean)
		.map(singular)
		.filter((word) => !DESCRIPTORS.has(word))
}

/** A name as it is compared: two names that normalise alike name the same thing. */
export function normaliseName(name: string): string {
	return words(name).join(' ')
}

/**
 * The stock item a captured row would merge into: the same normalised name in the same location, with a quantity
 * the row's can be added to. The first one, as the stock is ordered. Failing that, an item of that name that ran
 * out (D-92), wherever it was kept and in whatever unit: nothing of it is left to add to, so the row brings it back.
 */
export function mergeTarget(
	row: { name: string; location: StockLocation; qty: string; unit?: string },
	stock: readonly StockItem[]
): StockItem | undefined {
	const name = normaliseName(row.name)
	const amount = parseAmount(row.qty, row.unit)
	if (!name || !amount) return undefined
	const named = stock.filter((item) => normaliseName(item.name) === name)
	return (
		named.find((item) => {
			if (item.location !== row.location) return false
			const held = parseAmount(item.qty, item.unit)
			return !!held && compatible(held, amount)
		}) ?? named.find((item) => isOut(item))
	)
}

/** Sorts after every date, so what never expires comes last. */
const UNDATED = '9999-12-31'

/** Whether the shorter name's words close the longer's: "spinach" and "baby spinach", never "rice" and "rice vinegar". */
function closes(short: string[], long: string[]): boolean {
	if (!short.length || short.length > long.length) return false
	const tail = long.slice(long.length - short.length)
	return short.every((word, index) => word === tail[index])
}

/**
 * The stock that covers an ingredient, the soonest to expire first. The names match when they are the same once
 * the cut is left off, or when one is the other with words in front ("baby spinach" covers "spinach"). An item
 * that ran out covers nothing (D-92).
 */
export function stockFor(ingredient: string, stock: readonly StockItem[]): StockItem[] {
	const wanted = words(ingredient).filter((word) => !FORMS.has(word))
	if (!wanted.length) return []
	return stock
		.filter((item) => {
			if (isOut(item)) return false
			const held = words(item.name).filter((word) => !FORMS.has(word))
			return closes(wanted, held) || closes(held, wanted)
		})
		.sort((a, b) => (a.expiry ?? UNDATED).localeCompare(b.expiry ?? UNDATED))
}
