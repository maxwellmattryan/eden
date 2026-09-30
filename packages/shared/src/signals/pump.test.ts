import { describe, expect, it } from 'vitest'
import type { FiredSchedule } from '../scheduler/types.js'
import { createPump } from './pump.js'

const fired = (name: string): FiredSchedule => ({ name, dueAt: 0 })

describe('signals pump', () => {
	it('hands on each schedule that was due, and carries on past one that fails', async () => {
		const delivered: string[] = []
		const errors: unknown[] = []
		const pump = createPump(
			async () => [fired('weather.alerts'), fired('kitchen.morning'), fired('kitchen.shop-day')],
			async ({ name }) => {
				if (name === 'kitchen.morning') throw new Error('broken')
				delivered.push(name)
			},
			(error) => errors.push(error)
		)
		await pump()
		expect(delivered).toEqual(['weather.alerts', 'kitchen.shop-day'])
		expect(errors).toHaveLength(1)
	})

	it('takes once more after a call that came while it was taking, and never twice at once', async () => {
		const due = [[fired('weather.alerts')], [fired('kitchen.morning')], []]
		let taking = 0
		let most = 0
		let takes = 0
		const delivered: string[] = []
		const pump = createPump(
			async () => {
				taking += 1
				most = Math.max(most, taking)
				takes += 1
				await Promise.resolve()
				taking -= 1
				return due.shift() ?? []
			},
			async ({ name }) => void delivered.push(name)
		)
		// The alarm, the window's return and the start arrive together: one take, then one more.
		await Promise.all([pump(), pump(), pump()])
		expect(most).toBe(1)
		expect(takes).toBe(2)
		expect(delivered).toEqual(['weather.alerts', 'kitchen.morning'])
		await pump()
		expect(takes).toBe(3)
	})

	it('survives a take that fails', async () => {
		const errors: unknown[] = []
		let broken = true
		const pump = createPump(
			async () => {
				if (broken) throw new Error('no store')
				return [fired('weather.alerts')]
			},
			async () => {},
			(error) => errors.push(error)
		)
		await pump()
		expect(errors).toHaveLength(1)
		broken = false
		await pump()
		expect(errors).toHaveLength(1)
	})
})
