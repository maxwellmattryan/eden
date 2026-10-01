import { describe, expect, it } from 'vitest'
import { haulReceipt, haulRows, mergeInto, mergeLabel, photoBox, remerge, unitPrice, type HaulRow } from './capture.js'
import type { StockItem } from './types.js'

const TODAY = '2026-09-30'
const eggs: StockItem = {
	id: 'eggs',
	name: 'Eggs',
	qty: '8',
	location: 'fridge',
	expiry: '2026-10-14',
	source: 'manual',
	sourcedAt: '2026-09-20T10:00:00.000Z',
}
const rice: StockItem = {
	id: 'rice',
	name: 'Short-grain rice',
	qty: '2',
	unit: 'kg',
	location: 'pantry',
	source: 'manual',
	sourcedAt: '2026-09-20T10:00:00.000Z',
}
const stock = [eggs, rice]
const ids = () => {
	let next = 0
	return () => `h-${++next}`
}

describe('a captured haul', () => {
	it('reads the answer into rows, with the expiry dated or estimated', () => {
		const rows = haulRows(
			{
				rows: [
					{
						name: 'Chicken thighs',
						qty: '900',
						unit: 'g',
						location: 'fridge',
						category: 'meat-and-fish',
						expiryDate: '2026-10-02',
						daysUntilExpiry: 2,
						tip: '',
					},
					{
						name: 'Spinach',
						qty: '200',
						unit: 'g',
						location: 'fridge',
						category: 'produce',
						expiryDate: '',
						daysUntilExpiry: 5,
						tip: 'Keep it dry in a towel.',
					},
					{
						name: 'Olive oil',
						qty: 500,
						unit: 'ml',
						location: 'cupboard',
						category: 'oils',
						expiryDate: '',
						daysUntilExpiry: 0,
						tip: '',
					},
					{ name: '  ', qty: '1', unit: '', location: 'pantry' },
				],
			},
			{ today: TODAY, stock: [], newId: ids() }
		)
		expect(rows).toEqual([
			{
				id: 'h-1',
				name: 'Chicken thighs',
				qty: '900',
				unit: 'g',
				location: 'fridge',
				expiry: '2026-10-02',
				category: 'meat-and-fish',
			},
			{
				id: 'h-2',
				name: 'Spinach',
				qty: '200',
				unit: 'g',
				location: 'fridge',
				expiry: '2026-10-05',
				estimated: true,
				category: 'produce',
				tip: 'Keep it dry in a towel.',
			},
			{ id: 'h-3', name: 'Olive oil', qty: '500', unit: 'ml', location: 'pantry' },
		])
	})

	it('reads nothing from an answer that is not rows', () => {
		expect(haulRows(undefined, { today: TODAY, stock, newId: ids() })).toEqual([])
		expect(haulRows({ rows: 'none' }, { today: TODAY, stock, newId: ids() })).toEqual([])
	})

	it('gives a quantity it cannot read a count of one', () => {
		const [row] = haulRows(
			{ rows: [{ name: 'Bananas', qty: 'a bunch', location: 'counter' }] },
			{ today: TODAY, stock, newId: ids() }
		)
		expect(row).toMatchObject({ qty: '1', location: 'counter' })
	})

	it('reads the brand and the size as their own, and names the brand in the merge', () => {
		const butter: StockItem = { ...eggs, id: 'butter', name: 'Butter', brand: 'Kerrygold', qty: '1' }
		const [row, bare] = haulRows(
			{
				rows: [
					{ name: 'Butter', brand: ' Kerrygold ', size: '8 oz', qty: 2, location: 'fridge' },
					{ name: 'Bananas', brand: '', size: '', qty: 6, location: 'counter' },
				],
			},
			{ today: TODAY, stock: [butter], newId: ids() }
		)
		expect(row).toMatchObject({ name: 'Butter', brand: 'Kerrygold', size: '8 oz' })
		expect(row!.merge).toEqual({ id: 'butter', name: 'Kerrygold Butter (1)', on: true })
		expect(bare).not.toHaveProperty('brand')
		expect(bare).not.toHaveProperty('size')
		expect(remerge({ ...row!, brand: 'Plugra' }, [butter]).merge).toBeUndefined()
	})

	it('reads what one cost from a receipt line, and where and when it was bought', () => {
		const answer = {
			rows: [
				{ name: 'Butter', qty: 2, location: 'fridge', priceCents: 998, count: 2 },
				{ name: 'Limes', qty: 4, location: 'counter', priceCents: 100, count: 3 },
				{ name: 'Bananas', qty: 6, location: 'counter', priceCents: 0, count: 1 },
			],
			store: ' H-E-B #455 ',
			boughtOn: '2026-09-28',
		}
		const rows = haulRows(answer, { today: TODAY, stock: [], newId: ids() })
		expect(rows.map((row) => row.price)).toEqual([4.99, 0.33, undefined])
		expect(haulReceipt(answer, TODAY)).toEqual({ store: 'H-E-B #455', boughtOn: '2026-09-28' })
		// a day that is not one, or is after today, is none; so is a shop that is not named
		expect(haulReceipt({ store: '', boughtOn: '2026-10-09' }, TODAY)).toEqual({})
		expect(haulReceipt({ boughtOn: 'yesterday' }, TODAY)).toEqual({})
		expect(unitPrice('4.99', 1)).toBeUndefined()
		expect(unitPrice(349, 0)).toBe(3.49)
		// the shelves as they stand were not bought today
		expect(haulRows(answer, { today: TODAY, stock: [], newId: ids(), mode: 'stock' })[0]).not.toHaveProperty('price')
	})

	it('marks the row that lands on something in stock', () => {
		const [row, other] = haulRows(
			{
				rows: [
					{ name: 'eggs', qty: '12', location: 'fridge' },
					{ name: 'eggs', qty: '12', location: 'counter' },
				],
			},
			{ today: TODAY, stock, newId: ids() }
		)
		expect(row!.merge).toEqual({ id: 'eggs', name: 'Eggs (8)', on: true })
		expect(other!.merge).toBeUndefined()
		expect(mergeLabel(rice)).toBe('Short-grain rice (2 kg)')
	})

	it('works the merge out again when the row is edited, and keeps the owner choice on the same item', () => {
		const row: HaulRow = {
			id: 'h-1',
			name: 'Eggs',
			qty: '12',
			location: 'fridge',
			merge: { id: 'eggs', name: 'Eggs (8)', on: false },
		}
		expect(remerge(row, stock).merge).toEqual({ id: 'eggs', name: 'Eggs (8)', on: false })
		expect(remerge({ ...row, location: 'pantry' }, stock).merge).toBeUndefined()
		expect(
			remerge({ ...row, name: 'Rice, short-grain', qty: '500', unit: 'g', location: 'pantry' }, stock).merge
		).toBeUndefined()
		expect(
			remerge({ ...row, name: 'Short-grain rice', qty: '500', unit: 'g', location: 'pantry' }, stock).merge
		).toEqual({
			id: 'rice',
			name: 'Short-grain rice (2 kg)',
			on: true,
		})
	})

	it('takes stock: no expiry is guessed for what was already on the shelf, and a match sets the quantity', () => {
		const [row, dated] = haulRows(
			{
				rows: [
					{ name: 'Eggs', qty: '6', location: 'fridge', expiryDate: '', daysUntilExpiry: 21 },
					{ name: 'Milk', qty: '1', unit: 'l', location: 'fridge', expiryDate: '2026-10-04', daysUntilExpiry: 7 },
				],
			},
			{ today: TODAY, stock, newId: ids(), mode: 'stock' }
		)
		expect(row).not.toHaveProperty('expiry')
		expect(row).not.toHaveProperty('estimated')
		expect(dated).toMatchObject({ expiry: '2026-10-04' })
		expect(mergeInto(eggs, row!, 'stock')).toMatchObject({ qty: '6', expiry: '2026-10-14' })
		expect(
			mergeInto(rice, { id: 'h', name: 'Rice', qty: '500', unit: 'g', location: 'pantry' }, 'stock')
		).toMatchObject({ qty: '0.5', unit: 'kg' })
	})

	it('reads where an item is in a photo, and drops a box that shows nothing or everything', () => {
		const [seen, tiny, whole, unseen] = haulRows(
			{
				rows: [
					{
						name: 'Eggs',
						qty: '6',
						location: 'fridge',
						photo: 2,
						box: { left: 100, top: 250, right: 400, bottom: 600 },
					},
					{ name: 'Milk', qty: '1', location: 'fridge', photo: 1, box: { left: 10, top: 10, right: 20, bottom: 300 } },
					{ name: 'Tofu', qty: '1', location: 'fridge', photo: 1, box: { left: 0, top: 0, right: 1000, bottom: 1000 } },
					{
						name: 'Rice',
						qty: '1',
						location: 'pantry',
						photo: 0,
						box: { left: 100, top: 100, right: 500, bottom: 500 },
					},
				],
			},
			{ today: TODAY, stock: [], newId: ids() }
		)
		expect(seen!.seen).toEqual({ file: 2, box: { left: 0.1, top: 0.25, right: 0.4, bottom: 0.6 } })
		expect(tiny).not.toHaveProperty('seen')
		expect(whole).not.toHaveProperty('seen')
		expect(unseen).not.toHaveProperty('seen')
		expect(photoBox({ left: -50, top: 0, right: 2000, bottom: 500 })).toEqual({
			left: 0,
			top: 0,
			right: 1,
			bottom: 0.5,
		})
		expect(photoBox({ left: 'a' })).toBeUndefined()
	})

	it('merges into the item: the quantities together in its unit, the earlier expiry, its own tip kept', () => {
		expect(
			mergeInto(rice, {
				id: 'h',
				name: 'Rice',
				qty: '500',
				unit: 'g',
				location: 'pantry',
				tip: 'Keep it sealed.',
				category: 'grains-and-pasta',
			})
		).toEqual({
			...rice,
			qty: '2.5',
			tip: 'Keep it sealed.',
			category: 'grains-and-pasta',
		})
		const later = mergeInto(eggs, {
			id: 'h',
			name: 'Eggs',
			qty: '12',
			location: 'fridge',
			expiry: '2026-10-20',
			estimated: true,
		})
		expect(later).toMatchObject({ qty: '20', expiry: '2026-10-14' })
		expect(later).not.toHaveProperty('estimated')
		const sooner = mergeInto(eggs, {
			id: 'h',
			name: 'Eggs',
			qty: '12',
			location: 'fridge',
			expiry: '2026-10-05',
			estimated: true,
		})
		expect(sooner).toMatchObject({ qty: '20', expiry: '2026-10-05', estimated: true })
		expect(mergeInto(rice, { id: 'h', name: 'Rice', qty: '1', unit: 'bag', location: 'pantry' })).toBeNull()
		// the row's brand and size fill what the item lacks, and never replace its own
		const row = { id: 'h', name: 'Eggs', brand: 'Vital Farms', size: '12 ct', qty: '12', location: 'fridge' as const }
		expect(mergeInto(eggs, row)).toMatchObject({ brand: 'Vital Farms', size: '12 ct' })
		expect(mergeInto({ ...eggs, brand: 'Pete and Gerry', size: '6 ct' }, row)).toMatchObject({
			brand: 'Pete and Gerry',
			size: '6 ct',
		})
		// one that ran out comes back in the package now bought
		expect(mergeInto({ ...eggs, qty: '0', brand: 'Vital Farms', size: '6 ct' }, row)).toMatchObject({
			brand: 'Vital Farms',
			size: '12 ct',
		})
	})
})
