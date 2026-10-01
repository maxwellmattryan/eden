import { describe, expect, it } from 'vitest'
import { mergeInto } from './capture.js'
import { ingredientStatus } from './cook.js'
import { expiresSoon } from './digest.js'
import { mergeTarget } from './match.js'
import { buyAgain, lapsed, ranOut, recentlyOut } from './out.js'
import { isOut } from './quantity.js'
import type { StockItem } from './types.js'

const NOW = Date.parse('2026-10-01T12:00:00.000Z')
const daysAgo = (days: number) => new Date(NOW - days * 86_400_000).toISOString()

const item = (name: string, fields: Partial<StockItem> = {}): StockItem => ({
	id: name,
	name,
	qty: '1',
	location: 'fridge',
	source: 'manual',
	sourcedAt: '2026-09-01T10:00:00.000Z',
	...fields,
})
const out = (name: string, days: number, fields: Partial<StockItem> = {}) =>
	item(name, { qty: '0', outAt: daysAgo(days), ...fields })

describe('what ran out in Hearth', () => {
	it('reads an item holding nothing as run out', () => {
		expect(isOut({ qty: '0' })).toBe(true)
		expect(isOut({ qty: '0', unit: 'lb' })).toBe(true)
		expect(isOut({ qty: '0.5' })).toBe(false)
		expect(isOut({ qty: 'some' })).toBe(false)
	})

	it('keeps the item, dated, with no expiry left', () => {
		const milk = item('Milk', { qty: '2', unit: 'l', expiry: '2026-10-02', estimated: true, photo: 'p-1', tip: 'Cold' })
		const after = ranOut(milk, daysAgo(0))
		expect(after).toMatchObject({ qty: '0', unit: 'l', outAt: daysAgo(0), photo: 'p-1', tip: 'Cold' })
		expect(after.expiry).toBeUndefined()
		expect(after.estimated).toBeUndefined()
		expect(expiresSoon(after, '2026-10-01')).toBe(false)
		// running out twice keeps the first date
		expect(ranOut(after, daysAgo(-1)).outAt).toBe(daysAgo(0))
	})

	it('shows the recent ones in Stock and all of them to buy again', () => {
		const stock = [item('Eggs'), out('Milk', 10), out('Butter', 2), out('Rice', 0.5)]
		expect(recentlyOut(stock, NOW).map((entry) => entry.name)).toEqual(['Rice', 'Butter'])
		expect(buyAgain(stock, []).map((entry) => entry.name)).toEqual(['Rice', 'Butter', 'Milk'])
	})

	it('leaves out of buy again what is already on the list', () => {
		const stock = [out('Whole Milk', 3), out('Eggs', 1)]
		expect(buyAgain(stock, [{ name: 'eggs' }]).map((entry) => entry.name)).toEqual(['Whole Milk'])
	})

	it('lets go of what nobody bought again', () => {
		const stock = [out('Saffron', 91), out('Milk', 89), item('Eggs'), item('Old', { qty: '0' })]
		expect(lapsed(stock, NOW).map((entry) => entry.name)).toEqual(['Saffron'])
	})

	it('covers no ingredient', () => {
		const [line] = ingredientStatus({ ingredients: [{ name: 'milk', qty: '1', unit: 'cup' }] }, [out('Milk', 1)])
		expect(line?.state).toBe('missing')
	})

	it('comes back with the next haul, wherever it lands and in whatever unit', () => {
		const milk = out('Milk', 3, { unit: 'l', photo: 'p-1', category: 'dairy-and-eggs', threshold: 1 })
		const row = { id: 'r', name: 'milk', qty: '2', unit: 'bottle', location: 'counter' as const, expiry: '2026-10-09' }
		expect(mergeTarget(row, [item('Eggs'), milk])?.id).toBe('Milk')
		expect(mergeInto(milk, row)).toEqual({
			id: 'Milk',
			name: 'Milk',
			qty: '2',
			unit: 'bottle',
			location: 'counter',
			expiry: '2026-10-09',
			photo: 'p-1',
			category: 'dairy-and-eggs',
			threshold: 1,
			source: 'manual',
			sourcedAt: '2026-09-01T10:00:00.000Z',
		})
	})

	it('prefers the item still in stock in the same place', () => {
		const held = item('Milk', { id: 'held', qty: '1', unit: 'l' })
		const gone = out('Milk', 3, { id: 'gone', location: 'pantry' })
		expect(mergeTarget({ name: 'Milk', qty: '1', unit: 'l', location: 'fridge' }, [gone, held])?.id).toBe('held')
	})
})
