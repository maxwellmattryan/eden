import { describe, expect, it } from 'vitest'
import { add, compatible, covers, formatAmount, isLow, parseAmount, subtract, unitOf } from './quantity.js'

describe("Hearth's amounts", () => {
	it('reads a quantity with its unit, however the number is written', () => {
		expect(parseAmount('900', 'g')).toEqual({ value: 900, unit: 'g', dim: 'mass' })
		expect(parseAmount('2,5', 'kg')).toEqual({ value: 2.5, unit: 'kg', dim: 'mass' })
		expect(parseAmount('1 1/2', 'cups')).toEqual({ value: 1.5, unit: 'cup', dim: 'volume' })
		expect(parseAmount('1/2', 'tsp')).toEqual({ value: 0.5, unit: 'tsp', dim: 'volume' })
		expect(parseAmount('1½')).toEqual({ value: 1.5, unit: '', dim: 'count' })
		expect(parseAmount('8')).toEqual({ value: 8, unit: '', dim: 'count' })
	})

	it('takes the unit from the quantity when the item has none of its own', () => {
		expect(parseAmount('500 g')).toEqual({ value: 500, unit: 'g', dim: 'mass' })
		expect(parseAmount('1 box')).toEqual({ value: 1, unit: 'box', dim: 'count' })
		expect(parseAmount('2 fl oz')).toEqual({ value: 2, unit: 'fl oz', dim: 'volume' })
	})

	it('reads nothing from a quantity with no number', () => {
		expect(parseAmount('')).toBeNull()
		expect(parseAmount('some')).toBeNull()
		expect(parseAmount(undefined)).toBeNull()
		expect(parseAmount('1/0')).toBeNull()
	})

	it('knows a unit by its names and a count by its word in the singular', () => {
		expect(unitOf('Pounds')).toEqual({ unit: 'lb', dim: 'mass' })
		expect(unitOf('lbs')).toEqual({ unit: 'lb', dim: 'mass' })
		expect(unitOf('litres')).toEqual({ unit: 'l', dim: 'volume' })
		expect(unitOf('tbsp.')).toEqual({ unit: 'tbsp', dim: 'volume' })
		expect(unitOf('packets')).toEqual({ unit: 'packet', dim: 'count' })
		expect(unitOf('boxes')).toEqual({ unit: 'box', dim: 'count' })
		expect(unitOf('pcs')).toEqual({ unit: '', dim: 'count' })
		expect(unitOf(undefined)).toEqual({ unit: '', dim: 'count' })
	})

	it('adds within a dimension, in the first amount own unit', () => {
		const kilo = parseAmount('1', 'kg')!
		const grams = parseAmount('500', 'g')!
		expect(formatAmount(add(kilo, grams)!)).toEqual({ qty: '1.5', unit: 'kg' })
		expect(formatAmount(add(grams, kilo)!)).toEqual({ qty: '1500', unit: 'g' })
		expect(formatAmount(add(parseAmount('8')!, parseAmount('12')!)!)).toEqual({ qty: '20' })
		expect(formatAmount(add(parseAmount('1', 'lb')!, parseAmount('8', 'oz')!)!)).toEqual({ qty: '1.5', unit: 'lb' })
	})

	it('never adds across dimensions or across counted things', () => {
		expect(compatible(parseAmount('1', 'kg')!, parseAmount('1', 'cup')!)).toBe(false)
		expect(add(parseAmount('9', 'packets')!, parseAmount('1', 'box')!)).toBeNull()
		expect(add(parseAmount('2')!, parseAmount('200', 'g')!)).toBeNull()
		expect(compatible(parseAmount('9', 'packets')!, parseAmount('3', 'packet')!)).toBe(true)
	})

	it('subtracts and stops at zero', () => {
		expect(formatAmount(subtract(parseAmount('900', 'g')!, parseAmount('0.5', 'kg')!)!)).toEqual({
			qty: '400',
			unit: 'g',
		})
		expect(subtract(parseAmount('2')!, parseAmount('5')!)!.value).toBe(0)
		expect(subtract(parseAmount('1', 'head')!, parseAmount('2', 'cloves')!)).toBeNull()
	})

	it('says whether one amount covers another', () => {
		expect(covers(parseAmount('1', 'kg')!, parseAmount('1000', 'g')!)).toBe(true)
		expect(covers(parseAmount('200', 'g')!, parseAmount('1', 'lb')!)).toBe(false)
		expect(covers(parseAmount('2')!, parseAmount('200', 'g')!)).toBeNull()
	})

	it('writes an amount back without decimals that say nothing', () => {
		expect(formatAmount({ value: 1.2000000001, unit: 'kg', dim: 'mass' })).toEqual({ qty: '1.2', unit: 'kg' })
		expect(formatAmount({ value: 3, unit: '', dim: 'count' })).toEqual({ qty: '3' })
	})

	it('calls an item low when it holds no more than its threshold', () => {
		expect(isLow({ qty: '9', unit: 'packets', threshold: 10 })).toBe(true)
		expect(isLow({ qty: '10', threshold: 10 })).toBe(true)
		expect(isLow({ qty: '11', threshold: 10 })).toBe(false)
		expect(isLow({ qty: '0', threshold: 0 })).toBe(true)
		expect(isLow({ qty: '2' })).toBe(false)
		expect(isLow({ qty: 'some', threshold: 1 })).toBe(false)
	})
})
