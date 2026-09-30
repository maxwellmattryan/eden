import { describe, expect, it } from 'vitest'
import { dailyAfter, declare, onDay, setOnce, takeDue, validateDeclared, validateOnce } from './rules.js'
import type { ScheduleRow } from './types.js'

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** An instant as the local clock reads it, which is how the rules read a daily time. */
const local = (day: number, hours: number, minutes = 0) => new Date(2026, 8, day, hours, minutes).getTime()
const summary = (rows: ScheduleRow[]) =>
	[...rows].sort((a, b) => (a.name < b.name ? -1 : 1)).map((row) => [row.name, row.kind, row.nextAt])

describe('scheduler rules', () => {
	it('declaring keeps what stands and removes what is no longer declared', () => {
		const morning = local(30, 9)
		const declared = [
			{ name: 'kitchen.morning', daily: '08:00' },
			{ name: 'weather.alerts', every: 300 },
		]
		let rows = setOnce(declare([], declared, morning), 'kitchen.shop-day', morning + DAY)
		// Both are due: the daily's hour has passed today, and an `every` starts now.
		rows = takeDue(rows, morning).rows
		const taken = summary(rows)

		// The same declaration an hour on moves nothing.
		rows = declare(rows, declared, morning + HOUR)
		expect(summary(rows)).toEqual(taken)

		// A changed definition starts again; what is left out goes; the one-shot stays.
		rows = declare(rows, [{ name: 'kitchen.morning', daily: '10:30' }], morning + HOUR)
		expect(summary(rows)).toEqual([
			['kitchen.morning', 'daily', local(30, 10, 30)],
			['kitchen.shop-day', 'once', morning + DAY],
		])
	})

	it('a new daily starts today and a new every starts now', () => {
		const evening = local(30, 21, 15)
		const rows = declare(
			[],
			[
				{ name: 'kitchen.morning', daily: '08:00' },
				{ name: 'kitchen.night', daily: '23:00' },
				{ name: 'weather.alerts', every: 300 },
			],
			evening
		)
		expect(summary(rows)).toEqual([
			['kitchen.morning', 'daily', local(30, 8)],
			['kitchen.night', 'daily', local(30, 23)],
			['weather.alerts', 'every', evening],
		])
		// The morning's hour has passed, so it is due at once; the night's has not.
		const taken = takeDue(rows, evening)
		expect(taken.fired).toEqual([
			{ name: 'kitchen.morning', dueAt: local(30, 8) },
			{ name: 'weather.alerts', dueAt: evening },
		])
		expect(summary(taken.rows)[0]).toEqual(['kitchen.morning', 'daily', local(31, 8)])
		expect(Math.min(...taken.rows.map((row) => row.nextAt))).toBe(evening + 5 * MINUTE)
	})

	it('many missed periods are one fire', () => {
		const start = local(30, 9)
		const declared = [
			{ name: 'weather.alerts', every: 300 },
			{ name: 'kitchen.morning', daily: '08:00' },
		]
		const rows = takeDue(declare([], declared, start), start).rows

		// Ten periods of the alerts and three mornings later, each is due once.
		const later = start + 3 * DAY + 50 * MINUTE
		const taken = takeDue(rows, later)
		expect(taken.fired).toEqual([
			{ name: 'weather.alerts', dueAt: start + 5 * MINUTE },
			{ name: 'kitchen.morning', dueAt: local(31, 8) },
		])
		// They move on from now, not from where they were.
		expect(summary(taken.rows)).toEqual([
			['kitchen.morning', 'daily', local(34, 8)],
			['weather.alerts', 'every', later + 5 * MINUTE],
		])
		expect(takeDue(taken.rows, later).fired).toEqual([])
	})

	it('a one-shot is gone once taken', () => {
		const now = local(30, 9)
		let rows = setOnce([], 'kitchen.shop-day', now + HOUR)
		expect(takeDue(rows, now).fired).toEqual([])

		// Setting it again moves it; one that is already past is due at once.
		rows = setOnce(rows, 'kitchen.shop-day', now - DAY)
		expect(rows).toHaveLength(1)
		const taken = takeDue(rows, now)
		expect(taken.fired).toEqual([{ name: 'kitchen.shop-day', dueAt: now - DAY }])
		expect(taken.rows).toEqual([])
	})

	it('reads a daily time on the local clock', () => {
		const noon = local(30, 12)
		expect(onDay(noon, '08:00')).toBe(local(30, 8))
		expect(onDay(noon, '08:00', 1)).toBe(local(31, 8))
		expect(dailyAfter(noon, '08:00')).toBe(local(31, 8))
		expect(dailyAfter(noon, '18:30')).toBe(local(30, 18, 30))
		// The hour itself is not after itself.
		expect(dailyAfter(local(30, 8), '08:00')).toBe(local(31, 8))
	})

	it('refuses what is malformed', () => {
		for (const bad of [
			[{ name: 'morning', daily: '08:00' }],
			[{ name: 'Kitchen.morning', daily: '08:00' }],
			[{ name: 'kitchen.morning', daily: '8:00' }],
			[{ name: 'kitchen.morning', daily: '24:00' }],
			[{ name: 'weather.alerts', every: 30 }],
			[{ name: 'weather.alerts' }],
			[{ name: 'weather.alerts', daily: '08:00', every: 300 }],
			[
				{ name: 'weather.alerts', every: 300 },
				{ name: 'weather.alerts', every: 600 },
			],
		]) {
			expect(validateDeclared(bad)?.[0]).toBe('schedule:invalid')
		}
		expect(validateDeclared([{ name: 'weather.alerts', every: 300 }])).toBeUndefined()

		const now = local(30, 9)
		expect(validateOnce([], 'shop day', now)?.[0]).toBe('schedule:invalid')
		expect(validateOnce([], 'kitchen.shop-day', -1)?.[0]).toBe('schedule:invalid')
		// A one-shot cannot take a repeating schedule's name.
		const rows = declare([], [{ name: 'weather.alerts', every: 300 }], now)
		expect(validateOnce(rows, 'weather.alerts', now)?.[0]).toBe('schedule:invalid')
		expect(validateOnce(rows, 'kitchen.shop-day', now)).toBeUndefined()
	})
})
