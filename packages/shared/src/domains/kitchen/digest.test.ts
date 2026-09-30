import { describe, expect, it } from 'vitest'
import { newId } from '../../data/ulid.js'
import { expiresSoon, expiringDigest, MORNING, shopDayMorning, SOON_DAYS } from './digest.js'
import type { StockItem } from './types.js'

const TODAY = '2026-09-30'
const item = (name: string, expiry?: string): StockItem => ({
	id: newId(),
	name,
	qty: '1',
	location: 'fridge',
	expiry,
	source: 'manual',
	sourcedAt: '2026-09-28T10:00:00.000Z',
})

describe("Hearth's digest", () => {
	it('counts what is dated no later than two days on as expiring', () => {
		expect(SOON_DAYS).toBe(2)
		expect(expiresSoon(item('Milk', '2026-10-02'), TODAY)).toBe(true)
		expect(expiresSoon(item('Eggs', '2026-10-03'), TODAY)).toBe(false)
		expect(expiresSoon(item('Yoghurt', '2026-09-28'), TODAY)).toBe(true)
		expect(expiresSoon(item('Rice'), TODAY)).toBe(false)
	})

	it('names the nearest two, counts the rest and says how near they are', () => {
		const spinach = item('Spinach', '2026-10-01')
		const avocados = item('Avocados', '2026-10-01')
		const stock = [item('Rice'), spinach, item('Eggs', '2026-10-09'), avocados]
		expect(expiringDigest(stock, TODAY)).toEqual({
			uris: [`eden://stock-item/${avocados.id}`, `eden://stock-item/${spinach.id}`],
			count: 2,
			more: 1,
			first: 'Avocados',
			second: 'Spinach',
			when: 'tomorrow',
		})
		// One item has no second; nothing expiring is no digest.
		expect(expiringDigest([spinach], TODAY)).toMatchObject({ count: 1, more: 0, first: 'Spinach', when: 'tomorrow' })
		expect(expiringDigest([spinach], TODAY)).not.toHaveProperty('second')
		expect(expiringDigest([item('Rice'), item('Eggs', '2026-10-09')], TODAY)).toBeNull()
		expect(expiringDigest([], TODAY)).toBeNull()
	})

	it('says when they expire only when they all expire alike', () => {
		const digest = (...expiries: string[]) =>
			expiringDigest(
				expiries.map((expiry, index) => item(`Item ${index}`, expiry)),
				TODAY
			)?.when
		expect(digest('2026-09-30')).toBe('today')
		expect(digest('2026-09-29', '2026-09-20')).toBe('past')
		expect(digest('2026-10-02')).toBe('soon')
		expect(digest('2026-10-01', '2026-10-02')).toBe('soon')
		expect(digest('2026-09-29', '2026-10-01')).toBe('soon')
	})

	it('keeps the payload small however much is expiring', () => {
		const many = Array.from({ length: 60 }, (_, index) => item(`Item ${String(index).padStart(2, '0')}`, TODAY))
		const digest = expiringDigest(many, TODAY)!
		expect(digest.count).toBe(60)
		expect(digest.more).toBe(59)
		expect(digest.uris).toHaveLength(20)
		expect(new TextEncoder().encode(JSON.stringify(digest)).length).toBeLessThan(4096)
	})

	it('finds the morning of a shop day on the local clock', () => {
		expect(MORNING).toBe('08:00')
		expect(shopDayMorning('2026-10-03T10:00:00')).toEqual({
			day: '2026-10-03',
			at: new Date(2026, 9, 3, 8, 0).getTime(),
		})
		expect(shopDayMorning('2026-10-03')?.day).toBe('2026-10-03')
		// No shop day, or one that is not a date, has no morning.
		expect(shopDayMorning(undefined)).toBeNull()
		expect(shopDayMorning('Sat 10-03 10:00')).toBeNull()
		expect(shopDayMorning('2026-02-31T10:00:00')).toBeNull()
	})
})
