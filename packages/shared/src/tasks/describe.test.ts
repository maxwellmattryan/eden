import { describe, expect, it } from 'vitest'
import { describeRecurrence, isWorkdays, taskChips } from './describe.js'

const CHICAGO = 'America/Chicago'

describe('describeRecurrence', () => {
	it('names the frequency and the interval, and a weekly rule its days from Monday', () => {
		expect(describeRecurrence({ freq: 'daily', start: '2026-09-30' })).toEqual({
			freq: 'daily',
			interval: 1,
			weekdays: [],
		})
		expect(describeRecurrence({ freq: 'daily', start: '2026-09-30', interval: 3 }).interval).toBe(3)
		expect(describeRecurrence({ freq: 'weekly', start: '2026-09-30', weekdays: ['th', 'mo'] }).weekdays).toEqual([
			'mo',
			'th',
		])
		// a weekly rule that names no day falls on the day of its start
		expect(describeRecurrence({ freq: 'weekly', start: '2026-09-30' }).weekdays).toEqual(['we'])
	})

	it('knows the working days', () => {
		expect(isWorkdays(['mo', 'tu', 'we', 'th', 'fr'])).toBe(true)
		expect(isWorkdays(['mo', 'tu', 'we', 'th'])).toBe(false)
		expect(isWorkdays(['mo', 'tu', 'we', 'th', 'fr', 'sa'])).toBe(false)
	})
})

describe('taskChips', () => {
	it('starts with the title and adds what was read', () => {
		expect(taskChips({ kind: 'todo', title: 'Book the dentist' }, CHICAGO)).toEqual([
			{ kind: 'title', title: 'Book the dentist' },
		])
		expect(taskChips({ kind: 'todo', title: 'Call', due: '2026-10-01T20:00:00.000Z' }, CHICAGO)).toEqual([
			{ kind: 'title', title: 'Call' },
			{ kind: 'when', day: '2026-10-01', time: '15:00' },
		])
		expect(taskChips({ kind: 'todo', title: 'Call', due: '2026-10-01' }, CHICAGO)[1]).toEqual({
			kind: 'when',
			day: '2026-10-01',
			time: null,
		})
		expect(
			taskChips(
				{ kind: 'routine', title: 'LMNT', recurrence: { freq: 'daily', start: '2026-09-30' }, timeOfDay: '06:50' },
				CHICAGO
			)
		).toEqual([
			{ kind: 'title', title: 'LMNT' },
			{ kind: 'time', time: '06:50' },
			{ kind: 'repeat', repeat: { freq: 'daily', interval: 1, weekdays: [] } },
		])
		expect(taskChips({ kind: 'habit', title: 'Stretch', target: { count: 3, per: 'week' } }, CHICAGO)[1]).toEqual({
			kind: 'target',
			target: { count: 3, per: 'week' },
		})
	})
})
