import { describe, expect, it } from 'vitest'
import { addTally, markDone, markSkipped, occurrenceOn, periodStart, reopenDay, streakOn, tallyOn } from './progress.js'
import type { HabitTarget, TaskProgress } from './types.js'

const none: TaskProgress = { days: {} }
const AT = '2026-09-30T11:50:00.000Z'

describe('a routine on a day', () => {
	it('is open until it is done or skipped', () => {
		expect(occurrenceOn(none, '2026-09-30')).toEqual({ state: 'open', doneAt: null })
		const done = markDone(none, '2026-09-30', AT)
		expect(occurrenceOn(done, '2026-09-30')).toEqual({ state: 'done', doneAt: AT })
		expect(occurrenceOn(done, '2026-10-01')).toEqual({ state: 'open', doneAt: null })
		expect(occurrenceOn(markSkipped(none, '2026-09-30'), '2026-09-30')).toEqual({ state: 'skipped', doneAt: null })
	})

	it('is one thing at a time: done lifts a skip, a skip forgets the done, and reopening clears both', () => {
		const skipped = markSkipped(none, '2026-09-30')
		expect(markDone(skipped, '2026-09-30', AT).days).toEqual({ '2026-09-30': { done: AT } })
		expect(markSkipped(markDone(none, '2026-09-30', AT), '2026-09-30').days).toEqual({
			'2026-09-30': { skipped: true },
		})
		expect(reopenDay(skipped, '2026-09-30')).toEqual(none)
	})

	it('leaves the other days alone and never writes the one it was given', () => {
		const before: TaskProgress = { days: { '2026-09-29': { done: AT } } }
		const after = markSkipped(before, '2026-09-30')
		expect(after.days).toEqual({ '2026-09-29': { done: AT }, '2026-09-30': { skipped: true } })
		expect(before.days).toEqual({ '2026-09-29': { done: AT } })
	})
})

describe('a habit tally', () => {
	const daily: HabitTarget = { count: 2, per: 'day' }
	const weekly: HabitTarget = { count: 3, per: 'week' }

	it('adds one at a time to the day, and drops the day at zero', () => {
		const one = addTally(none, '2026-09-30')
		expect(one.days).toEqual({ '2026-09-30': { count: 1 } })
		expect(addTally(one, '2026-09-30').days).toEqual({ '2026-09-30': { count: 2 } })
		expect(addTally(one, '2026-09-30', -1)).toEqual(none)
		expect(addTally(none, '2026-09-30', -1)).toEqual(none)
	})

	it('is measured over the day for a daily target', () => {
		const progress = addTally(addTally(none, '2026-09-30'), '2026-09-29')
		expect(tallyOn(progress, daily, '2026-09-30', 'monday')).toBe(1)
	})

	it('is measured over the week from the owner start for a weekly target', () => {
		// 2026-09-27 is a Sunday: in the week before with a Monday start, in the same week with a Sunday start
		const progress = addTally(addTally(addTally(none, '2026-09-27'), '2026-09-29'), '2026-09-30')
		expect(periodStart(weekly, '2026-09-30', 'monday')).toBe('2026-09-28')
		expect(periodStart(weekly, '2026-09-30', 'sunday')).toBe('2026-09-27')
		expect(tallyOn(progress, weekly, '2026-09-30', 'monday')).toBe(2)
		expect(tallyOn(progress, weekly, '2026-09-30', 'sunday')).toBe(3)
	})
})

describe('a streak', () => {
	const daily: HabitTarget = { count: 1, per: 'day' }
	const weekly: HabitTarget = { count: 2, per: 'week' }
	const tallied = (days: Record<string, number>): TaskProgress => ({
		days: Object.fromEntries(Object.entries(days).map(([day, count]) => [day, { count }])),
	})

	it('is nothing until a period is met, and counts the periods met in a row', () => {
		expect(streakOn(none, daily, 0, '2026-09-30', 'monday')).toBe(0)
		const three = tallied({ '2026-09-28': 1, '2026-09-29': 1, '2026-09-30': 1 })
		expect(streakOn(three, daily, 0, '2026-09-30', 'monday')).toBe(3)
	})

	it('does not break on the period under way, which is not over', () => {
		const two = tallied({ '2026-09-28': 1, '2026-09-29': 1 })
		expect(streakOn(two, daily, 0, '2026-09-30', 'monday')).toBe(2)
	})

	it('breaks on a missed period without grace', () => {
		const gap = tallied({ '2026-09-27': 1, '2026-09-29': 1, '2026-09-30': 1 })
		expect(streakOn(gap, daily, 0, '2026-09-30', 'monday')).toBe(2)
	})

	it('forgives as many missed periods in a row as the grace allows, and one more ends it', () => {
		const oneGap = tallied({ '2026-09-27': 1, '2026-09-29': 1, '2026-09-30': 1 })
		expect(streakOn(oneGap, daily, 1, '2026-09-30', 'monday')).toBe(3)
		const twoGaps = tallied({ '2026-09-26': 1, '2026-09-29': 1, '2026-09-30': 1 })
		expect(streakOn(twoGaps, daily, 1, '2026-09-30', 'monday')).toBe(2)
		expect(streakOn(twoGaps, daily, 2, '2026-09-30', 'monday')).toBe(3)
	})

	it('counts weeks for a weekly target, met or not by their whole tally', () => {
		// three Monday weeks: 09-14, 09-21 (only one, missed), 09-28 (under way)
		const weeks = tallied({ '2026-09-15': 1, '2026-09-17': 1, '2026-09-22': 1, '2026-09-28': 1, '2026-09-30': 1 })
		expect(streakOn(weeks, weekly, 0, '2026-09-30', 'monday')).toBe(1)
		expect(streakOn(weeks, weekly, 1, '2026-09-30', 'monday')).toBe(2)
	})

	it('does not count a day before the first tally as missed', () => {
		const late = tallied({ '2026-09-30': 1 })
		expect(streakOn(late, daily, 0, '2026-09-30', 'monday')).toBe(1)
		expect(streakOn(late, daily, 0, '2026-10-02', 'monday')).toBe(0)
	})
})
