import { describe, expect, it } from 'vitest'
import { mergeTarget, normaliseName, singular, stockFor } from './match.js'
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
