import { describe, expect, it } from 'vitest'
import { task } from './fixtures.js'
import { todayView } from './today.js'
import type { Task } from './types.js'

// Wednesday 2026-09-30 at 11:50 in Chicago (16:50Z).
const NOW = Date.parse('2026-09-30T16:50:00Z')
const CHICAGO = 'America/Chicago'

const view = (tasks: Task[], now = NOW, zone: string | undefined = CHICAGO) => todayView(tasks, now, zone, 'monday')
const titles = (items: { task: Task }[]) => items.map((item) => item.task.title)

describe('overdue and due today', () => {
	it('puts a todo due before today under overdue, and one due today under due', () => {
		const tasks = [
			task({ kind: 'todo', title: 'Book the dentist', due: '2026-09-28' }),
			task({ kind: 'todo', title: 'Renew library card', due: '2026-09-30' }),
			task({ kind: 'todo', title: 'Plan the trip', due: '2026-10-05' }),
		]
		const { sections, counts } = view(tasks)
		expect(titles(sections.overdue)).toEqual(['Book the dentist'])
		expect(titles(sections.due)).toEqual(['Renew library card'])
		expect(counts).toEqual({ overdue: 1, due: 1 })
	})

	it('leaves out what is done and what has no due', () => {
		const tasks = [
			task({ kind: 'todo', title: 'Done already', due: '2026-09-28', done: true, completedAt: '2026-09-29' }),
			task({ kind: 'todo', title: 'Made elsewhere' }),
			task({ kind: 'checklist', title: 'Finished list', due: '2026-09-30', done: true }),
		]
		const { sections } = view(tasks)
		expect(sections.overdue).toEqual([])
		expect(sections.due).toEqual([])
	})

	it('reads a timed due in the owner zone, so the same instant is today in one zone and yesterday in another', () => {
		// 14:30Z on the 30th: 09:30 on the 30th in Chicago, where it is still that morning; 23:30 on the 30th in
		// Tokyo, where the 1st has begun
		const tasks = [task({ kind: 'todo', title: 'Late call', due: '2026-09-30T14:30:00.000Z' })]
		const chicago = view(tasks)
		expect(chicago.sections.overdue).toEqual([])
		expect(chicago.sections.due[0]).toMatchObject({ day: '2026-09-30', time: '09:30', late: true })
		const tokyo = view(tasks, NOW, 'Asia/Tokyo')
		expect(tokyo.sections.due).toEqual([])
		expect(tokyo.sections.overdue[0]).toMatchObject({ day: '2026-09-30', time: '23:30', late: false })
	})

	it('keeps a timed task whose time has passed today under due, marked late', () => {
		const tasks = [
			task({ kind: 'todo', title: 'Morning call', due: '2026-09-30T14:00:00.000Z' }),
			task({ kind: 'todo', title: 'Afternoon call', due: '2026-09-30T20:00:00.000Z' }),
		]
		const { sections } = view(tasks)
		expect(sections.overdue).toEqual([])
		expect(sections.due.map((item) => [item.task.title, item.time, item.late])).toEqual([
			['Morning call', '09:00', true],
			['Afternoon call', '15:00', false],
		])
	})

	it('orders the overdue by day, and the due by time, then priority, then age', () => {
		const tasks = [
			task({ kind: 'todo', title: 'Low', due: '2026-09-30', priority: 'low' }),
			task({ kind: 'todo', title: 'Plain', due: '2026-09-30' }),
			task({ kind: 'todo', title: 'High', due: '2026-09-30', priority: 'high' }),
			task({ kind: 'todo', title: 'Later plain', due: '2026-09-30' }),
			task({ kind: 'todo', title: 'At three', due: '2026-09-30T20:00:00.000Z' }),
			task({ kind: 'todo', title: 'At nine', due: '2026-09-30T14:00:00.000Z' }),
			task({ kind: 'todo', title: 'Monday', due: '2026-09-28' }),
			task({ kind: 'todo', title: 'Sunday', due: '2026-09-27' }),
		]
		const { sections } = view(tasks)
		expect(titles(sections.due)).toEqual(['At nine', 'At three', 'High', 'Plain', 'Later plain', 'Low'])
		expect(titles(sections.overdue)).toEqual(['Sunday', 'Monday'])
	})

	it('counts a checklist by its items', () => {
		const items = [
			{ text: 'Passport', done: true },
			{ text: 'Charger', done: false },
		]
		const [item] = view([task({ kind: 'checklist', title: 'Pack', due: '2026-09-30', items })]).sections.due
		expect(item?.items).toEqual({ done: 1, total: 2 })
	})
})

describe('routines', () => {
	it('shows a routine on the days its recurrence falls, with its time', () => {
		const tasks = [
			task({
				kind: 'routine',
				title: 'Morning LMNT',
				timeOfDay: '06:50',
				recurrence: { freq: 'daily', start: '2026-09-01' },
			}),
			task({
				kind: 'routine',
				title: 'Gym',
				recurrence: { freq: 'weekly', start: '2026-09-01', weekdays: ['mo', 'th'] },
			}),
		]
		const { sections } = view(tasks)
		expect(sections.routines.map((item) => [item.task.title, item.time, item.done, item.late])).toEqual([
			['Morning LMNT', '06:50', false, true],
		])
		expect(titles(view(tasks, Date.parse('2026-10-01T16:50:00Z')).sections.routines)).toEqual(['Morning LMNT', 'Gym'])
	})

	it('keeps a done routine on the list, struck through with its time, and drops a skipped one', () => {
		const doneAt = '2026-09-30T11:50:00.000Z'
		const tasks = [
			task({
				kind: 'routine',
				title: 'Morning LMNT',
				timeOfDay: '06:50',
				recurrence: { freq: 'daily', start: '2026-09-01' },
				progress: { days: { '2026-09-30': { done: doneAt } } },
			}),
			task({
				kind: 'routine',
				title: 'Skipped',
				recurrence: { freq: 'daily', start: '2026-09-01' },
				progress: { days: { '2026-09-30': { skipped: true } } },
			}),
		]
		const { sections } = view(tasks)
		expect(sections.routines.map((item) => [item.task.title, item.done, item.doneAt, item.late])).toEqual([
			['Morning LMNT', true, doneAt, false],
		])
	})

	it('never makes a missed routine overdue', () => {
		const tasks = [task({ kind: 'routine', title: 'Missed', recurrence: { freq: 'daily', start: '2026-09-01' } })]
		const { sections } = view(tasks)
		expect(sections.overdue).toEqual([])
		expect(titles(sections.routines)).toEqual(['Missed'])
	})

	it('shows a routine whose rule cannot be read every day, so it can still be acted on', () => {
		const { sections } = view([task({ kind: 'routine', title: 'Unreadable' })])
		expect(titles(sections.routines)).toEqual(['Unreadable'])
	})

	it('orders routines by their time, those without one last', () => {
		const daily = { freq: 'daily' as const, start: '2026-09-01' }
		const tasks = [
			task({ kind: 'routine', title: 'Untimed', recurrence: daily }),
			task({ kind: 'routine', title: 'Evening', timeOfDay: '21:00', recurrence: daily }),
			task({ kind: 'routine', title: 'Morning', timeOfDay: '06:50', recurrence: daily }),
		]
		expect(titles(view(tasks).sections.routines)).toEqual(['Morning', 'Evening', 'Untimed'])
	})
})

describe('habits', () => {
	it('shows a habit every day with its tally for the period, its target and its streak', () => {
		const tasks = [
			task({
				kind: 'habit',
				title: 'Stretch',
				target: { count: 5, per: 'week' },
				progress: { days: { '2026-09-28': { count: 1 }, '2026-09-29': { count: 1 }, '2026-09-27': { count: 3 } } },
			}),
			task({ kind: 'habit', title: 'Water', target: { count: 8, per: 'day' } }),
		]
		const { sections } = view(tasks)
		expect(sections.habits.map((item) => [item.task.title, item.tally])).toEqual([
			['Stretch', { count: 2, target: { count: 5, per: 'week' }, met: false, streak: 0 }],
			['Water', { count: 0, target: { count: 8, per: 'day' }, met: false, streak: 0 }],
		])
	})

	it('leaves out a habit without a readable target', () => {
		expect(view([task({ kind: 'habit', title: 'No target' })]).sections.habits).toEqual([])
	})
})

describe('the tile', () => {
	it('takes the first three of overdue, due and routines, in that order', () => {
		const tasks = [
			task({ kind: 'routine', title: 'Morning LMNT', recurrence: { freq: 'daily', start: '2026-09-01' } }),
			task({ kind: 'todo', title: 'Renew library card', due: '2026-09-30' }),
			task({ kind: 'todo', title: 'Book the dentist', due: '2026-09-28' }),
			task({ kind: 'habit', title: 'Water', target: { count: 8, per: 'day' } }),
			task({ kind: 'todo', title: 'Also today', due: '2026-09-30' }),
		]
		const { top, day } = view(tasks)
		expect(day).toBe('2026-09-30')
		expect(titles(top)).toEqual(['Book the dentist', 'Renew library card', 'Also today'])
	})

	it('reads today in the zone, so the day turns where the owner is', () => {
		const tasks = [task({ kind: 'todo', title: 'Renew library card', due: '2026-09-30' })]
		// 03:00Z on 10-01: still the 30th in Chicago, already the 1st in Tokyo
		const late = Date.parse('2026-10-01T03:00:00Z')
		expect(view(tasks, late).sections.due).toHaveLength(1)
		expect(view(tasks, late, 'Asia/Tokyo').sections.overdue).toHaveLength(1)
	})
})
