import { describe, expect, it } from 'vitest'
import { PACK_DONE_DAYS, PACK_PROGRESS_DAYS, tasksForPack } from './pack.js'

const CHICAGO = 'America/Chicago'
/** Wednesday 2026-09-30, 09:40 in Chicago. */
const NOW = Date.UTC(2026, 8, 30, 14, 40)

const row = (id: string, fields: Record<string, unknown>) => ({ uri: `eden://task/${id}`, id, ...fields })

describe('tasksForPack', () => {
	it('keeps what is open and the todos done in the last week, by the day where the owner is', () => {
		const rows = [
			row('open', { kind: 'todo', done: false, due: '2026-06-01' }),
			row('recent', { kind: 'todo', done: true, completedAt: '2026-09-25T15:00:00.000Z' }),
			// done at 23:30 on the 23rd in Chicago, which is the 24th in UTC: the owner's day is what counts
			row('edge', { kind: 'todo', done: true, completedAt: '2026-09-24T04:30:00.000Z' }),
			row('old', { kind: 'checklist', done: true, completedAt: '2026-09-22T15:00:00.000Z' }),
			row('untimed', { kind: 'todo', done: true, completedAt: null }),
		]
		expect(PACK_DONE_DAYS).toBe(7)
		expect(tasksForPack(rows, NOW, CHICAGO).map((entry) => entry.id)).toEqual(['open', 'recent', 'edge'])
		// in Tokyo the checklist was done just after midnight on the 23rd, which is still within the week
		expect(tasksForPack(rows, NOW, 'Asia/Tokyo').map((entry) => entry.id)).toEqual(['open', 'recent', 'edge', 'old'])
	})

	it('keeps the first day of the week it counts, and drops the day before', () => {
		const on = (completedAt: string) => tasksForPack([row('t', { done: true, completedAt })], NOW, CHICAGO).length
		// seven days back from the 30th is the 23rd
		expect(on('2026-09-23T15:00:00.000Z')).toBe(1)
		expect(on('2026-09-22T15:00:00.000Z')).toBe(0)
	})

	it('cuts a routine’s and a habit’s progress to the last two weeks, and leaves the rest of the row', () => {
		const days = { '2026-08-01': { done: 'x' }, '2026-09-16': { skipped: true }, '2026-09-29': { count: 2 } }
		const [routine] = tasksForPack(
			[row('r', { kind: 'routine', title: 'Run', streak: 4, progress: { days } })],
			NOW,
			CHICAGO
		)
		expect(PACK_PROGRESS_DAYS).toBe(14)
		expect(routine).toMatchObject({ kind: 'routine', title: 'Run', streak: 4 })
		expect(Object.keys((routine as { progress: { days: object } }).progress.days)).toEqual(['2026-09-16', '2026-09-29'])
		// the row handed in is not changed
		expect(Object.keys(days)).toHaveLength(3)
	})

	it('reads a row with no progress, or one that is not what it should be, as it is', () => {
		const rows = [
			row('none', { kind: 'routine', progress: null }),
			row('odd', { kind: 'habit', progress: 'nothing' }),
			row('bare', {}),
		]
		expect(tasksForPack(rows, NOW, CHICAGO)).toEqual(rows)
	})

	it('never drops a row the conversation is about', () => {
		const old = row('old', { kind: 'todo', done: true, completedAt: '2026-01-02T15:00:00.000Z' })
		expect(tasksForPack([old], NOW, CHICAGO)).toEqual([])
		expect(tasksForPack([old], NOW, CHICAGO, new Set([old.uri]))).toEqual([old])
	})
})
