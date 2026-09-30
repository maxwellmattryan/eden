import { describe, expect, it } from 'vitest'
import type { TaskRow } from '../data/types.js'
import {
	addedToday,
	completion,
	dueDay,
	dueTime,
	inverseOf,
	isOverdue,
	moveDue,
	reopened,
	SIGNAL_TITLE_CHARS,
	skip,
	tallied,
	targetMet,
	taskSignal,
} from './rules.js'
import { task } from './fixtures.js'
import { parseProgress, parseTarget, toTask } from './types.js'

const CHICAGO = 'America/Chicago'
const AT = '2026-09-30T16:50:00.000Z'

describe('due', () => {
	it('is a day as it is, and an instant on the day where the owner is', () => {
		expect(dueDay('2026-09-30', CHICAGO)).toBe('2026-09-30')
		expect(dueDay('2026-09-30T04:30:00.000Z', CHICAGO)).toBe('2026-09-29')
		expect(dueDay('2026-09-30T04:30:00.000Z', 'Asia/Tokyo')).toBe('2026-09-30')
		expect(dueTime('2026-09-30', CHICAGO)).toBeNull()
		expect(dueTime('2026-09-30T04:30:00.000Z', CHICAGO)).toBe('23:30')
	})

	it('moves to another day keeping the time of day', () => {
		expect(moveDue('2026-09-28', '2026-10-01', CHICAGO)).toBe('2026-10-01')
		expect(moveDue(null, '2026-10-01', CHICAGO)).toBe('2026-10-01')
		expect(moveDue('2026-09-28T20:00:00.000Z', '2026-10-01', CHICAGO)).toBe('2026-10-01T20:00:00.000Z')
	})

	it('is overdue for a todo or a checklist not done whose day has passed, and for nothing else', () => {
		expect(isOverdue(task({ kind: 'todo', title: 't', due: '2026-09-29' }), '2026-09-30', CHICAGO)).toBe(true)
		expect(isOverdue(task({ kind: 'checklist', title: 't', due: '2026-09-29' }), '2026-09-30', CHICAGO)).toBe(true)
		expect(isOverdue(task({ kind: 'todo', title: 't', due: '2026-09-30' }), '2026-09-30', CHICAGO)).toBe(false)
		expect(isOverdue(task({ kind: 'todo', title: 't', due: '2026-09-29', done: true }), '2026-09-30', CHICAGO)).toBe(
			false
		)
		expect(isOverdue(task({ kind: 'todo', title: 't' }), '2026-09-30', CHICAGO)).toBe(false)
		expect(
			isOverdue(
				task({ kind: 'routine', title: 't', recurrence: { freq: 'daily', start: '2026-09-01' } }),
				'2026-09-30',
				CHICAGO
			)
		).toBe(false)
		// a timed task earlier today is not overdue
		expect(isOverdue(task({ kind: 'todo', title: 't', due: '2026-09-30T14:00:00.000Z' }), '2026-09-30', CHICAGO)).toBe(
			false
		)
	})
})

describe('addedToday', () => {
	it('gives a todo with no date today, and leaves a routine and a habit without a due', () => {
		expect(addedToday({ kind: 'todo', title: 'Renew library card' }, '2026-09-30')).toEqual({
			kind: 'todo',
			title: 'Renew library card',
			due: '2026-09-30',
		})
		expect(addedToday({ kind: 'todo', title: 'Call', due: '2026-10-01T20:00:00.000Z' }, '2026-09-30').due).toBe(
			'2026-10-01T20:00:00.000Z'
		)
		const rule = { freq: 'daily' as const, start: '2026-09-30' }
		expect(addedToday({ kind: 'routine', title: 'LMNT', recurrence: rule, timeOfDay: '06:50' }, '2026-09-30')).toEqual({
			kind: 'routine',
			title: 'LMNT',
			recurrence: rule,
			timeOfDay: '06:50',
		})
		expect(addedToday({ kind: 'habit', title: 'Stretch', target: { count: 3, per: 'week' } }, '2026-09-30')).toEqual({
			kind: 'habit',
			title: 'Stretch',
			target: { count: 3, per: 'week' },
		})
	})
})

describe('what an action changes', () => {
	it('completes a todo, and a checklist with every item', () => {
		expect(completion(task({ kind: 'todo', title: 't' }), '2026-09-30', AT)).toEqual({ done: true, completedAt: AT })
		const list = task({
			kind: 'checklist',
			title: 't',
			items: [
				{ text: 'a', done: false },
				{ text: 'b', done: true },
			],
		})
		expect(completion(list, '2026-09-30', AT)).toEqual({
			done: true,
			completedAt: AT,
			items: [
				{ text: 'a', done: true },
				{ text: 'b', done: true },
			],
		})
	})

	it('marks a routine done on the day, skips it, and opens it again', () => {
		const routine = task({ kind: 'routine', title: 't', recurrence: { freq: 'daily', start: '2026-09-01' } })
		expect(completion(routine, '2026-09-30', AT)).toEqual({ progress: { days: { '2026-09-30': { done: AT } } } })
		expect(skip(routine, '2026-09-30')).toEqual({ progress: { days: { '2026-09-30': { skipped: true } } } })
		const done = { ...routine, progress: { days: { '2026-09-30': { done: AT } } } }
		expect(reopened(done, '2026-09-30')).toEqual({ progress: { days: {} } })
	})

	it('tallies a habit and writes its streak beside it', () => {
		const habit = task({
			kind: 'habit',
			title: 't',
			target: { count: 1, per: 'day' },
			progress: { days: { '2026-09-29': { count: 1 } } },
		})
		expect(tallied(habit, '2026-09-30', 'monday')).toEqual({
			progress: { days: { '2026-09-29': { count: 1 }, '2026-09-30': { count: 1 } } },
			streak: 2,
		})
	})

	it('answers the way back with the fields as they stand', () => {
		const todo = task({ kind: 'todo', title: 't', due: '2026-09-28' })
		expect(inverseOf(todo, completion(todo, '2026-09-30', AT))).toEqual({ done: false, completedAt: null })
		expect(inverseOf(todo, { due: '2026-10-01' })).toEqual({ due: '2026-09-28' })
	})
})

describe('toTask', () => {
	const row = (fields: Partial<TaskRow>): TaskRow => ({
		uri: 'eden://task/01',
		id: '01',
		type: 'task',
		createdAt: '0',
		updatedAt: '0',
		deletedAt: null,
		mirror: false,
		source: null,
		externalId: null,
		snapshot: null,
		links: [],
		kind: 'todo',
		title: 't',
		notes: null,
		due: null,
		priority: 'none',
		at: null,
		timeOfDay: null,
		recurrence: null,
		items: null,
		target: null,
		grace: null,
		streak: 0,
		progress: null,
		done: false,
		completedAt: null,
		...fields,
	})

	it('reads the JSON fields, and what is malformed as nothing', () => {
		const read = toTask(
			row({
				kind: 'habit',
				target: { count: 3, per: 'week' },
				progress: { days: { '2026-09-30': { count: 2 }, 'not a day': { count: 1 }, '2026-09-29': {} } },
				grace: 1,
				timeOfDay: '06:50',
			})
		)
		expect(read.target).toEqual({ count: 3, per: 'week' })
		expect(read.progress).toEqual({ days: { '2026-09-30': { count: 2 } } })
		expect(read.grace).toBe(1)
		expect(read.timeOfDay).toBe('06:50')
		const bad = toTask(
			row({
				kind: 'routine',
				recurrence: { freq: 'hourly' },
				target: { count: 0, per: 'week' },
				progress: 'yes',
				timeOfDay: '25:00',
				items: [{ text: 'a', done: true }, { done: true }] as never,
			})
		)
		expect(bad.recurrence).toBeNull()
		expect(bad.target).toBeNull()
		expect(bad.progress).toEqual({ days: {} })
		expect(bad.timeOfDay).toBeNull()
		expect(bad.items).toEqual([{ text: 'a', done: true }])
	})

	it('reads a target and progress on their own', () => {
		expect(parseTarget({ count: 2, per: 'day' })).toEqual({ count: 2, per: 'day' })
		expect(parseTarget({ count: 2, per: 'month' })).toBeNull()
		expect(parseTarget(null)).toBeNull()
		expect(parseProgress({ days: {} })).toEqual({ days: {} })
		expect(parseProgress({})).toBeNull()
		expect(parseProgress([])).toBeNull()
	})
})

describe('the task signals', () => {
	it('names a created task by its id, and carries its URI, its kind, the day and its title', () => {
		const todo = task({ kind: 'todo', title: 'Renew library card', due: '2026-09-30' })
		expect(taskSignal('task.created', todo, '2026-09-30', 'monday')).toEqual({
			name: 'task.created',
			payload: { uris: [todo.uri], kind: 'todo', day: '2026-09-30', title: 'Renew library card' },
			dedupeKey: todo.id,
		})
	})

	it('keys a completion by the id and the day for a todo, a checklist and a routine', () => {
		for (const kind of ['todo', 'checklist', 'routine'] as const) {
			const done = task({ kind, title: 't' })
			expect(taskSignal('task.completed', done, '2026-09-30', 'monday').dedupeKey).toBe(`${done.id}:2026-09-30`)
		}
	})

	it('keys a habit met by the id and the first day of its period', () => {
		const daily = task({ kind: 'habit', title: 't', target: { count: 2, per: 'day' } })
		expect(taskSignal('task.completed', daily, '2026-09-30', 'monday').dedupeKey).toBe(`${daily.id}:2026-09-30`)
		const weekly = task({ kind: 'habit', title: 't', target: { count: 3, per: 'week' } })
		expect(taskSignal('task.completed', weekly, '2026-09-30', 'monday').dedupeKey).toBe(`${weekly.id}:2026-09-28`)
		expect(taskSignal('task.completed', weekly, '2026-09-30', 'sunday').dedupeKey).toBe(`${weekly.id}:2026-09-27`)
	})

	it('clips a long title so the payload can never pass the limit', () => {
		const long = task({ kind: 'todo', title: 'x'.repeat(5000) })
		const { payload } = taskSignal('task.created', long, '2026-09-30', 'monday')
		expect(payload.title).toHaveLength(SIGNAL_TITLE_CHARS)
		expect(new TextEncoder().encode(JSON.stringify(payload)).length).toBeLessThan(4096)
	})

	it('knows when a habit has met its target for the period', () => {
		const habit = task({
			kind: 'habit',
			title: 't',
			target: { count: 2, per: 'week' },
			progress: { days: { '2026-09-28': { count: 1 } } },
		})
		expect(targetMet(habit, '2026-09-30', 'monday')).toBe(false)
		const met = { ...habit, progress: { days: { '2026-09-28': { count: 1 }, '2026-09-30': { count: 1 } } } }
		expect(targetMet(met, '2026-09-30', 'monday')).toBe(true)
		expect(targetMet(task({ kind: 'todo', title: 't' }), '2026-09-30', 'monday')).toBe(false)
	})
})
