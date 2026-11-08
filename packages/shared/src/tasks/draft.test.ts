import { describe, expect, it } from 'vitest'
import { parseAbout, repeatOf, taskFromDraft } from './draft.js'

const CHICAGO = 'America/Chicago'
const TODAY = '2026-09-30'

describe('repeatOf', () => {
	it('reads a span as a frequency, from the day it starts', () => {
		expect(repeatOf({ every: 'day' }, TODAY)).toEqual({ freq: 'daily', start: TODAY })
		expect(repeatOf({ every: 'month', interval: 3 }, '2026-10-05')).toEqual({
			freq: 'monthly',
			start: '2026-10-05',
			interval: 3,
		})
		expect(repeatOf({ every: 'year' }, TODAY)).toEqual({ freq: 'yearly', start: TODAY })
	})

	it('keeps the days of the week for a weekly rule alone', () => {
		expect(repeatOf({ every: 'week', weekdays: ['mo', 'th'] }, TODAY)).toEqual({
			freq: 'weekly',
			start: TODAY,
			weekdays: ['mo', 'th'],
		})
		expect(repeatOf({ every: 'week', interval: 2 }, TODAY)).toEqual({ freq: 'weekly', start: TODAY, interval: 2 })
		expect(repeatOf({ every: 'day', weekdays: ['mo'] }, TODAY)).toEqual({ freq: 'daily', start: TODAY })
	})

	it('takes a field sent as null as one left out', () => {
		expect(repeatOf({ every: 'week', interval: null, weekdays: null }, TODAY)).toEqual({ freq: 'weekly', start: TODAY })
	})

	it('answers nothing for what is not a rule, so one is never half applied', () => {
		expect(repeatOf(undefined, TODAY)).toBeNull()
		expect(repeatOf('weekly', TODAY)).toBeNull()
		expect(repeatOf({ every: 'fortnight' }, TODAY)).toBeNull()
		expect(repeatOf({ every: 'week', interval: 0 }, TODAY)).toBeNull()
		expect(repeatOf({ every: 'week', weekdays: ['monday'] }, TODAY)).toBeNull()
		expect(repeatOf({ every: 'week' }, 'Friday')).toBeNull()
	})
})

describe('taskFromDraft', () => {
	it('makes a todo due today when the draft names no day, as a line added on Today is', () => {
		expect(taskFromDraft({ title: 'Call the dentist' }, TODAY, CHICAGO)).toEqual({
			kind: 'todo',
			title: 'Call the dentist',
			due: TODAY,
			priority: 'none',
		})
	})

	it('joins a todo’s time into its due as an instant in the owner’s zone', () => {
		expect(
			taskFromDraft(
				{ title: 'Call', due: '2026-10-02', timeOfDay: '15:00', priority: 'high', notes: 'ask about x-rays' },
				TODAY,
				CHICAGO
			)
		).toEqual({
			kind: 'todo',
			title: 'Call',
			due: '2026-10-02T20:00:00.000Z',
			priority: 'high',
			notes: 'ask about x-rays',
		})
	})

	it('reads a day or a time that is not one as none', () => {
		expect(taskFromDraft({ title: 'Call', due: 'Friday', timeOfDay: '3pm' }, TODAY, CHICAGO)).toMatchObject({
			due: TODAY,
		})
	})

	it('makes a routine of a draft with a recurrence: no due, and its time kept as a time of day', () => {
		const recurrence = repeatOf({ every: 'week', weekdays: ['mo', 'th'] }, TODAY)!
		expect(taskFromDraft({ title: 'Water the plants', timeOfDay: '07:00', recurrence }, TODAY, CHICAGO)).toEqual({
			kind: 'routine',
			title: 'Water the plants',
			recurrence,
			timeOfDay: '07:00',
		})
	})

	it('makes a habit of a draft with a target: the target and nothing of a day or a time', () => {
		expect(
			taskFromDraft(
				{ title: 'Run', due: '2026-10-02', timeOfDay: '07:00', target: { count: 3, per: 'week' } },
				TODAY,
				CHICAGO
			)
		).toEqual({ kind: 'habit', title: 'Run', target: { count: 3, per: 'week' } })
	})

	it('links a task to the row it is for, under the row’s name', () => {
		const about = { uri: 'eden://bill/01J9ZX00000000000000000000', label: 'Texas Gas Service' }
		expect(taskFromDraft({ title: 'Pay the gas bill', due: '2026-10-01', about }, TODAY, CHICAGO)).toEqual({
			kind: 'todo',
			title: 'Pay the gas bill',
			due: '2026-10-01',
			priority: 'none',
			links: [{ uri: about.uri, relation: 'about', label: 'Texas Gas Service' }],
		})
		expect(
			taskFromDraft(
				{ title: 'Check the meter', about: { uri: about.uri }, target: { count: 1, per: 'week' } },
				TODAY,
				CHICAGO
			)
		).toMatchObject({ kind: 'habit', links: [{ uri: about.uri, relation: 'about' }] })
	})
})

describe('parseAbout', () => {
	const REACH = ['bill', 'stock-item', 'task']
	const entity = (type: string) => ['bill', 'stock-item', 'recipe'].includes(type)
	const id = '01J9ZX00000000000000000000'

	it('accepts a row of an entity type in reach', () => {
		expect(parseAbout({ type: 'bill', id }, REACH, entity)).toEqual({ type: 'bill', id })
	})

	it('refuses a type out of reach, a type that is not an entity and a malformed value, naming what is wrong', () => {
		expect(parseAbout({ type: 'recipe', id }, REACH, entity)).toEqual({
			error: '`about.type` "recipe" is not one this conversation may read.',
		})
		expect(parseAbout({ type: 'task', id }, REACH, entity)).toEqual({
			error: '`about.type` "task" is not a type of row a task can be for.',
		})
		for (const bad of [null, 'bill', ['bill', id], { type: 'bill' }, { type: 'bill', id: 'nope' }, { id }])
			expect(parseAbout(bad, REACH, entity), JSON.stringify(bad)).toHaveProperty('error')
	})
})
