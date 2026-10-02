import { describe, expect, it } from 'vitest'
import type { WeeklyState } from './listings.js'
import { weeklyMorning, type WeeklyOutcome } from './signals.js'

/** A device: the state it keeps, the searches it ran and what it said. */
function device(initial: WeeklyState = {}) {
	let state = initial
	const said: [number, string, string][] = []
	let searches = 0
	const run = (today: string, outcome: WeeklyOutcome, on = true) =>
		weeklyMorning(
			async () => {
				searches += 1
				return outcome
			},
			{
				today,
				on,
				read: () => state,
				write: (next) => (state = next),
				say: async (payload, key) => void said.push([payload.count, payload.first, key]),
			}
		)
	return { run, said, state: () => state, searches: () => searches }
}

const found: WeeklyOutcome = { outcome: 'found', titles: ['Blanton late night', 'Hot Luck food festival'] }

describe('the weekly listings search (D-134)', () => {
	it('runs on Sunday, says what matched once, and does not run again that week', async () => {
		const d = device()
		expect(await d.run('2026-10-04', found)).toBe('found')
		expect(d.said).toEqual([[2, 'Blanton late night', '2026-10-04']])
		expect(d.state()).toEqual({ doneFor: '2026-10-04' })
		expect(await d.run('2026-10-05', found)).toBe('not-due')
		expect(await d.run('2026-10-04', found)).toBe('not-due')
		expect(d.searches()).toBe(1)
	})

	it('does not run on any other day, and never when the owner turned it off', async () => {
		const d = device()
		for (const day of ['2026-09-30', '2026-10-03', '2026-10-06']) expect(await d.run(day, found)).toBe('not-due')
		expect(await d.run('2026-10-04', found, false)).toBe('off')
		expect(d.searches()).toBe(0)
		expect(d.said).toEqual([])
	})

	it('tries again the next morning when the Gardener was busy, and settles then', async () => {
		const d = device({ doneFor: '2026-09-27' })
		expect(await d.run('2026-10-04', { outcome: 'busy' })).toBe('busy')
		expect(d.state()).toEqual({ doneFor: '2026-09-27' })
		expect(await d.run('2026-10-05', found)).toBe('found')
		expect(d.state()).toEqual({ doneFor: '2026-10-04' })
		// said under the Sunday it belongs to, so a second emit of the week is dropped as a duplicate
		expect(d.said).toEqual([[2, 'Blanton late night', '2026-10-04']])
	})

	it('settles the week and says nothing when the search was skipped or found nothing', async () => {
		for (const outcome of ['skipped', 'nothing'] as const) {
			const d = device()
			expect(await d.run('2026-10-04', { outcome })).toBe(outcome)
			expect(d.state()).toEqual({ doneFor: '2026-10-04' })
			expect(d.said).toEqual([])
			expect(await d.run('2026-10-05', found)).toBe('not-due')
		}
	})
})
