import { describe, expect, it } from 'vitest'
import {
	mergeTarget,
	nameCovers,
	normaliseBrand,
	normaliseName,
	sameBrand,
	sameItem,
	singular,
	stockFor,
} from './match.js'
import type { StockItem, StockLocation } from './types.js'

let next = 0
const item = (
	name: string,
	qty: string,
	unit?: string,
	location: StockLocation = 'fridge',
	expiry?: string
): StockItem => ({
	id: `s-${++next}`,
	name,
	qty,
	unit,
	location,
	expiry,
	source: 'manual',
	sourcedAt: '2026-09-28T10:00:00.000Z',
})

describe("Hearth's name matching", () => {
	it('reads a name as a shopper would', () => {
		expect(normaliseName('Eggs')).toBe('egg')
		expect(normaliseName('Fresh Organic Tomatoes')).toBe('tomato')
		expect(normaliseName('Soy sauce (low sodium)')).toBe('soy sauce')
		expect(normaliseName('Bay leaves')).toBe('bay leaf')
		expect(normaliseName('Jalapeño  peppers')).toBe('jalapeno pepper')
		expect(normaliseName('Hummus')).toBe('hummus')
		expect(normaliseName('Berries')).toBe('berry')
	})

	it('keeps what makes two foods of one name apart', () => {
		expect(normaliseName('Canned black beans')).not.toBe(normaliseName('Black beans'))
		expect(normaliseName('Frozen spinach')).not.toBe(normaliseName('Spinach'))
		expect(singular('peas')).toBe('pea')
		expect(singular('asparagus')).toBe('asparagus')
	})

	it('merges a row into the same thing in the same place', () => {
		const eggs = item('Eggs', '8')
		const spinach = item('Spinach', '200', 'g')
		const stock = [eggs, spinach, item('Eggs', '6', undefined, 'counter')]
		expect(mergeTarget({ name: 'eggs', qty: '12', location: 'fridge' }, stock)).toBe(eggs)
		expect(mergeTarget({ name: 'Fresh spinach', qty: '0.5', unit: 'lb', location: 'fridge' }, stock)).toBe(spinach)
	})

	it('does not merge across places, names or units that cannot be added', () => {
		const stock = [item('Eggs', '8'), item('Spinach', '200', 'g')]
		expect(mergeTarget({ name: 'Eggs', qty: '12', location: 'pantry' }, stock)).toBeUndefined()
		expect(mergeTarget({ name: 'Egg noodles', qty: '1', location: 'fridge' }, stock)).toBeUndefined()
		expect(mergeTarget({ name: 'Spinach', qty: '1', unit: 'bag', location: 'fridge' }, stock)).toBeUndefined()
		expect(mergeTarget({ name: 'Spinach', qty: 'some', location: 'fridge' }, stock)).toBeUndefined()
	})

	it('reads two brands as one when they are written alike, or when one is not said', () => {
		expect(normaliseBrand('H-E-B')).toBe('heb')
		expect(sameBrand('Kerrygold', 'kerry gold')).toBe(true)
		expect(sameBrand('Häagen-Dazs', 'haagen dazs')).toBe(true)
		expect(sameBrand('Kerrygold', undefined)).toBe(true)
		expect(sameBrand('Kerrygold', 'Land O Lakes')).toBe(false)
		expect(sameItem({ name: 'Butter', brand: 'Kerrygold' }, { name: 'butter' })).toBe(true)
		expect(sameItem({ name: 'Butter', brand: 'Kerrygold' }, { name: 'Butter', brand: 'Plugra' })).toBe(false)
		expect(sameItem({ name: '' }, { name: '' })).toBe(false)
	})

	it('merges a row into the item of its brand, before one that names none, and never into another brand', () => {
		const plain = item('Hot sauce', '1')
		const cholula = { ...item('Hot sauce', '1'), brand: 'Cholula' }
		const stock = [plain, cholula]
		const row = { name: 'hot sauce', qty: '1', location: 'fridge' as const }
		expect(mergeTarget({ ...row, brand: 'cholula' }, stock)).toBe(cholula)
		expect(mergeTarget(row, stock)).toBe(plain)
		expect(mergeTarget({ ...row, brand: 'Valentina' }, stock)).toBe(plain)
		expect(mergeTarget({ ...row, brand: 'Valentina' }, [cholula])).toBeUndefined()
		// one that ran out comes back only as its own brand
		const gone = { ...cholula, qty: '0', location: 'pantry' as const }
		expect(mergeTarget({ ...row, brand: 'Valentina' }, [gone])).toBeUndefined()
		expect(mergeTarget(row, [gone])).toBe(gone)
	})

	it('reads two names as one thing the way an ingredient does', () => {
		expect(nameCovers('spinach', 'Baby spinach')).toBe(true)
		expect(nameCovers('Salmon fillets', 'salmon')).toBe(true)
		expect(nameCovers('rice', 'Rice vinegar')).toBe(false)
		expect(nameCovers('', 'Rice')).toBe(false)
	})

	it('finds the stock an ingredient means, the soonest to expire first', () => {
		const old = item('Baby spinach', '100', 'g', 'fridge', '2026-10-01')
		const fresh = item('Spinach', '200', 'g', 'fridge', '2026-10-05')
		const salmon = item('Salmon fillets', '2', undefined, 'freezer')
		const stock = [
			fresh,
			old,
			salmon,
			item('Rice vinegar', '300', 'ml', 'pantry'),
			item('Garlic', '1', 'head', 'counter'),
		]
		expect(stockFor('spinach', stock)).toEqual([old, fresh])
		const undated = item('Spinach', '50', 'g', 'freezer')
		expect(stockFor('spinach', [undated, fresh])).toEqual([fresh, undated])
		expect(stockFor('salmon', stock)).toEqual([salmon])
		expect(stockFor('garlic cloves', stock).map((found) => found.name)).toEqual(['Garlic'])
		expect(stockFor('rice', stock)).toEqual([])
		expect(stockFor('', stock)).toEqual([])
	})
})
