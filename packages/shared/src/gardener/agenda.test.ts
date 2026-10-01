import { describe, expect, it } from 'vitest'
import { task } from '../tasks/fixtures.js'
import { agenda, AGENDA_DAYS, agendaWindow, type AgendaEventRow, type AgendaInput } from './agenda.js'

const CHICAGO = 'America/Chicago'
const TOKYO = 'Asia/Tokyo'
/** Wednesday 2026-09-30, 09:40 in Chicago. */
const NOW = Date.UTC(2026, 8, 30, 14, 40)
const TODAY = '2026-09-30'

let next = 0
const event = (fields: Partial<AgendaEventRow> & Pick<AgendaEventRow, 'title' | 'startAt'>): AgendaEventRow => ({
	id: `e${(next += 1)}`,
	kind: 'local-event',
	endAt: null,
	allDay: false,
	status: 'confirmed',
	...fields,
})

const ask = (over: Partial<AgendaInput> = {}) =>
	agenda({ tasks: [], events: [], first: TODAY, days: 1, now: NOW, zone: CHICAGO, weekStart: 'monday', ...over })

describe('agendaWindow', () => {
	it('asks for a day on either side, as bare dates, so every zone’s edges and every all-day event are in', () => {
		expect(agendaWindow(TODAY, 1)).toEqual({ from: '2026-09-29', to: '2026-10-02' })
		expect(agendaWindow('2026-12-30', 7)).toEqual({ from: '2026-12-29', to: '2027-01-07' })
		// the store keeps an event that ends at or after `from` and starts at or before `to`, comparing text: an
		// all-day event on the first day sorts after `from`, and an instant late on the last day before `to`
		const { from, to } = agendaWindow(TODAY, 1)
		expect('2026-09-30' >= from && '2026-09-30' <= to).toBe(true)
		expect('2026-10-01T04:59:00.000Z' <= to).toBe(true)
	})
})

describe('agenda', () => {
	it('answers the days asked for, each with its weekday, and leaves out what is empty', () => {
		const answer = ask({ days: 3 })
		expect(answer).toEqual({
			today: TODAY,
			days: [
				{ day: '2026-09-30', weekday: 'Wednesday' },
				{ day: '2026-10-01', weekday: 'Thursday' },
				{ day: '2026-10-02', weekday: 'Friday' },
			],
		})
		expect(ask({ days: 400 }).days).toHaveLength(AGENDA_DAYS)
		expect(ask({ days: 0 }).days).toHaveLength(1)
	})

	it('puts a task on the day its due falls where the owner is, never on the date its instant begins with', () => {
		// 20:00 on Thursday in Chicago is 01:00 on Friday in UTC
		const evening = task({ kind: 'todo', title: 'Call home', due: '2026-10-02T01:00:00.000Z', priority: 'high' })
		const chicago = ask({ tasks: [evening], first: '2026-10-01', days: 2 })
		expect(chicago.days[0]).toMatchObject({
			day: '2026-10-01',
			due: [{ id: evening.id, title: 'Call home', kind: 'todo', time: '20:00', priority: 'high' }],
		})
		expect(chicago.days[1]?.due).toBeUndefined()
		const tokyo = ask({ tasks: [evening], first: '2026-10-01', days: 2, zone: TOKYO })
		expect(tokyo.days[0]?.due).toBeUndefined()
		expect(tokyo.days[1]?.due?.[0]).toMatchObject({ time: '10:00' })
	})

	it('orders a day’s tasks by time, then priority, and counts a checklist’s items', () => {
		const tasks = [
			task({ kind: 'todo', title: 'Untimed, low', due: TODAY, priority: 'low' }),
			task({ kind: 'todo', title: 'Untimed, high', due: TODAY, priority: 'high' }),
			task({ kind: 'todo', title: 'At three', due: '2026-09-30T20:00:00.000Z' }),
			task({
				kind: 'checklist',
				title: 'Pack',
				due: '2026-09-30T13:00:00.000Z',
				items: [
					{ text: 'a', done: true },
					{ text: 'b', done: false },
				],
			}),
		]
		const due = ask({ tasks }).days[0]?.due
		expect(due?.map((entry) => entry.title)).toEqual(['Pack', 'At three', 'Untimed, high', 'Untimed, low'])
		expect(due?.[0]).toMatchObject({ kind: 'checklist', time: '08:00', items: { done: 1, total: 2 } })
		// nothing of the ordering leaks into what is answered
		expect(due?.every((entry) => !('rank' in entry))).toBe(true)
	})

	it('lists a done task on the day it was done where the owner is', () => {
		// 22:30 on Wednesday in Chicago is 03:30 on Thursday in UTC
		const posted = task({
			kind: 'todo',
			title: 'Post the letter',
			due: TODAY,
			done: true,
			completedAt: '2026-10-01T03:30:00.000Z',
		})
		const answer = ask({ tasks: [posted], days: 2 })
		expect(answer.days[0]).toMatchObject({ done: [{ id: posted.id, title: 'Post the letter' }] })
		expect(answer.days[0]?.due).toBeUndefined()
		expect(answer.days[1]?.done).toBeUndefined()
	})

	it('names what is overdue only when the days reach today: before the first day apart, within them on their day', () => {
		const old = task({ kind: 'todo', title: 'Renew the passport', due: '2026-09-20' })
		const recent = task({ kind: 'todo', title: 'Return the book', due: '2026-09-29' })
		const done = task({ kind: 'todo', title: 'Done long ago', due: '2026-09-01', done: true, completedAt: null })
		const tasks = [recent, old, done]

		const today = ask({ tasks })
		expect(today.overdue).toEqual([
			{ id: old.id, title: 'Renew the passport', kind: 'todo', overdue: true, day: '2026-09-20' },
			{ id: recent.id, title: 'Return the book', kind: 'todo', overdue: true, day: '2026-09-29' },
		])

		// from yesterday: the one due yesterday is on its own day, marked, and only the older one stands apart
		const fromYesterday = ask({ tasks, first: '2026-09-29', days: 2 })
		expect(fromYesterday.days[0]?.due).toEqual([
			{ id: recent.id, title: 'Return the book', kind: 'todo', overdue: true },
		])
		expect(fromYesterday.overdue?.map((entry) => entry.title)).toEqual(['Renew the passport'])

		// a stretch that does not reach today says nothing of what is overdue now
		expect(ask({ tasks, first: '2026-10-05', days: 3 }).overdue).toBeUndefined()
		expect(ask({ tasks, first: '2026-09-19', days: 3 }).overdue).toBeUndefined()
		expect(ask({ tasks, first: '2026-09-19', days: 3 }).days[1]?.due?.[0]).toMatchObject({ overdue: true })
	})

	it('places a routine on the days its rule falls on, with what became of each', () => {
		const water = task({
			kind: 'routine',
			title: 'Water the plants',
			timeOfDay: '07:00',
			recurrence: { freq: 'weekly', start: '2026-09-01', weekdays: ['mo', 'we', 'fr'] },
			progress: {
				days: { '2026-09-28': { done: '2026-09-28T12:05:00.000Z' }, '2026-09-30': { skipped: true } },
			},
		})
		const stretch = ask({ tasks: [water], first: '2026-09-28', days: 5 })
		expect(stretch.days.map((day) => day.routines?.[0]?.state)).toEqual([
			'done',
			undefined,
			'skipped',
			undefined,
			'open',
		])
		expect(stretch.days[0]?.routines).toEqual([
			{ id: water.id, title: 'Water the plants', time: '07:00', state: 'done' },
		])
		// before its first day it falls on nothing
		expect(ask({ tasks: [water], first: '2026-08-24', days: 7 }).days.some((day) => day.routines)).toBe(false)
	})

	it('shows a routine whose rule cannot be read on today alone', () => {
		const odd = task({ kind: 'routine', title: 'Stretch', recurrence: null })
		const stretch = ask({ tasks: [odd], first: '2026-09-29', days: 3 })
		expect(stretch.days.map((day) => day.routines?.length ?? 0)).toEqual([0, 1, 0])
	})

	it('says where the habits stand only when the days reach today', () => {
		const run = task({
			kind: 'habit',
			title: 'Run',
			target: { count: 3, per: 'week' },
			progress: { days: { '2026-09-28': { count: 1 }, '2026-09-29': { count: 1 } } },
		})
		expect(ask({ tasks: [run] }).habits).toEqual([
			{ id: run.id, title: 'Run', count: 2, target: 3, per: 'week', met: false, streak: expect.any(Number) },
		])
		expect(ask({ tasks: [run], first: '2026-10-05' }).habits).toBeUndefined()
	})

	it('puts an all-day event on each of its days, the first and the last asked for included', () => {
		const events = [
			event({ title: 'Market', startAt: '2026-09-30', allDay: true, kind: 'shop-day' }),
			event({ title: 'Conference', startAt: '2026-10-01', endAt: '2026-10-02', allDay: true }),
			event({ title: 'Before', startAt: '2026-09-29', allDay: true }),
			event({ title: 'After', startAt: '2026-10-03', allDay: true }),
		]
		const answer = ask({ events, days: 3 })
		expect(answer.days[0]?.events).toEqual([{ id: events[0]!.id, title: 'Market', kind: 'shop-day', allDay: true }])
		expect(answer.days[1]?.events).toEqual([
			{
				id: events[1]!.id,
				title: 'Conference',
				kind: 'local-event',
				allDay: true,
				from: '2026-10-01',
				until: '2026-10-02',
			},
		])
		expect(answer.days[2]?.events?.map((entry) => entry.title)).toEqual(['Conference'])
	})

	it('puts a timed event on the owner’s day, with its times on their clock, all-day ones first', () => {
		const events = [
			// 19:00 to 21:00 on Wednesday in Chicago
			event({ title: 'Dinner', startAt: '2026-10-01T00:00:00.000Z', endAt: '2026-10-01T02:00:00.000Z' }),
			event({ title: 'Dentist', startAt: '2026-09-30T15:00:00.000Z', status: 'tentative' }),
			event({ title: 'Holiday', startAt: '2026-09-30', allDay: true }),
			event({ title: 'Called off', startAt: '2026-09-30T16:00:00.000Z', status: 'cancelled' }),
		]
		expect(ask({ events }).days[0]?.events).toEqual([
			{ id: events[2]!.id, title: 'Holiday', kind: 'local-event', allDay: true },
			{ id: events[1]!.id, title: 'Dentist', kind: 'local-event', start: '10:00', tentative: true },
			{ id: events[0]!.id, title: 'Dinner', kind: 'local-event', start: '19:00', end: '21:00' },
		])
		// in Tokyo both are on Thursday: the dentist at midnight, the dinner in the morning
		const tokyo = ask({ events, zone: TOKYO, days: 2 })
		expect(tokyo.days[1]?.events?.map((entry) => [entry.title, entry.start])).toEqual([
			['Dentist', '00:00'],
			['Dinner', '09:00'],
		])
	})

	it('ends an event that ends at midnight on the evening before, and runs a longer one over its days', () => {
		const events = [
			// 22:00 Wednesday to 00:00 Thursday in Chicago
			event({ title: 'Film', startAt: '2026-10-01T03:00:00.000Z', endAt: '2026-10-01T05:00:00.000Z' }),
			// 23:00 Wednesday to 01:30 Thursday
			event({ title: 'Flight', startAt: '2026-10-01T04:00:00.000Z', endAt: '2026-10-01T06:30:00.000Z' }),
		]
		const answer = ask({ events, days: 2 })
		expect(answer.days[0]?.events).toEqual([
			{ id: events[0]!.id, title: 'Film', kind: 'local-event', start: '22:00', end: '00:00' },
			{
				id: events[1]!.id,
				title: 'Flight',
				kind: 'local-event',
				start: '23:00',
				from: '2026-09-30',
				until: '2026-10-01',
			},
		])
		expect(answer.days[1]?.events).toEqual([
			{
				id: events[1]!.id,
				title: 'Flight',
				kind: 'local-event',
				end: '01:30',
				from: '2026-09-30',
				until: '2026-10-01',
			},
		])
	})

	it('reads a time written without a zone as the owner’s, and skips a start that is no time at all', () => {
		const events = [
			event({ title: 'Lunch', startAt: '2026-09-30T12:30', endAt: '2026-09-30T13:15:00' }),
			event({ title: 'Broken', startAt: 'soon' }),
		]
		expect(ask({ events }).days[0]?.events).toEqual([
			{ id: events[0]!.id, title: 'Lunch', kind: 'local-event', start: '12:30', end: '13:15' },
		])
	})

	it('carries Sky’s reading for each day it has one, and the alerts only when the days reach today', () => {
		const weather = { '2026-09-30': { condition: 'rain', high: 71 }, '2026-10-02': { condition: 'clear', high: 80 } }
		const alerts = [{ event: 'Flood Watch', severity: 'severe' }]
		const answer = ask({ days: 3, weather, alerts })
		expect(answer.days.map((day) => day.weather)).toEqual([weather['2026-09-30'], undefined, weather['2026-10-02']])
		expect(answer.alerts).toEqual(alerts)
		expect(ask({ first: '2026-10-02', weather, alerts }).alerts).toBeUndefined()
		expect(ask({ alerts: [] }).alerts).toBeUndefined()
	})
})
