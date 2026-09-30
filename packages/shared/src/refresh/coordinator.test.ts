import { describe, expect, it } from 'vitest'
import { createCoordinator, type Refreshable } from './coordinator.js'

const MINUTE = 60 * 1000

/** A resource whose age is set by hand and which counts its fetches; a fetch makes it fresh. */
function resource(fields: Partial<Refreshable> & { id: string }) {
	const state = { age: Infinity, fetched: 0 }
	const it: Refreshable = {
		age: () => state.age,
		refresh: async () => {
			state.fetched += 1
			state.age = 0
		},
		...fields,
	}
	return { it, state }
}

describe('refresh coordinator', () => {
	it('refreshes what is read once it is older than its interval, while the window is seen', async () => {
		const coordinator = createCoordinator()
		const forecast = resource({ id: 'weather.forecast', foreground: 15 * MINUTE })
		coordinator.register(forecast.it)
		coordinator.watch('weather.forecast')
		// A view that starts reading a resource that was never fetched has it fetched at once.
		await coordinator.check(true)
		expect(forecast.state.fetched).toBe(1)

		forecast.state.age = 14 * MINUTE
		await coordinator.check(true)
		expect(forecast.state.fetched).toBe(1)
		forecast.state.age = 15 * MINUTE
		await coordinator.check(true)
		expect(forecast.state.fetched).toBe(2)
	})

	it('leaves alone what nothing reads, and everything while the window is hidden', async () => {
		const coordinator = createCoordinator()
		const forecast = resource({ id: 'weather.forecast', foreground: 15 * MINUTE })
		coordinator.register(forecast.it)
		await coordinator.check(true)
		expect(forecast.state.fetched).toBe(0)

		const release = coordinator.watch('weather.forecast')
		await coordinator.check(true)
		expect(forecast.state.fetched).toBe(1)
		forecast.state.age = 60 * MINUTE
		await coordinator.check(false)
		expect(forecast.state.fetched).toBe(1)

		// Two readers, then none: the last release stops it, and a release counts once.
		const second = coordinator.watch('weather.forecast')
		await coordinator.check(true)
		expect(forecast.state.fetched).toBe(2)
		release()
		release()
		forecast.state.age = 60 * MINUTE
		await coordinator.check(true)
		expect(forecast.state.fetched).toBe(3)
		second()
		forecast.state.age = 60 * MINUTE
		await coordinator.check(true)
		expect(forecast.state.fetched).toBe(3)
	})

	it('refreshes what is bound to a schedule when it fires, read or not, seen or not', async () => {
		const coordinator = createCoordinator()
		const alerts = resource({ id: 'weather.alerts', schedule: 'weather.alerts' })
		const forecast = resource({ id: 'weather.forecast', foreground: 15 * MINUTE })
		coordinator.register(alerts.it)
		coordinator.register(forecast.it)
		await coordinator.fired('weather.alerts')
		expect([alerts.state.fetched, forecast.state.fetched]).toEqual([1, 0])
		await coordinator.fired('kitchen.morning')
		expect(alerts.state.fetched).toBe(1)
		// With no interval of its own, being read does not refresh it: the schedule is its only clock.
		coordinator.watch('weather.alerts')
		alerts.state.age = 60 * MINUTE
		await coordinator.check(true)
		expect(alerts.state.fetched).toBe(1)
	})

	it('joins a fetch that is already under way', async () => {
		const coordinator = createCoordinator()
		let finish = () => {}
		let fetched = 0
		coordinator.register({
			id: 'weather.forecast',
			age: () => Infinity,
			foreground: MINUTE,
			refresh: () => {
				fetched += 1
				return new Promise<void>((resolve) => (finish = resolve))
			},
		})
		coordinator.watch('weather.forecast')
		const first = coordinator.check(true)
		const second = coordinator.refresh('weather.forecast')
		expect(fetched).toBe(1)
		finish()
		await Promise.all([first, second])
		// Once it has settled, the next refresh fetches again.
		void coordinator.refresh('weather.forecast')
		expect(fetched).toBe(2)
	})

	it('reports a failed refresh and carries on', async () => {
		const failed: string[] = []
		const coordinator = createCoordinator((id) => failed.push(id))
		const alerts = resource({ id: 'weather.alerts', schedule: 'weather.alerts' })
		coordinator.register(alerts.it)
		coordinator.register({
			id: 'broken',
			schedule: 'weather.alerts',
			age: () => 0,
			refresh: () => Promise.reject(new Error('offline')),
		})
		await coordinator.fired('weather.alerts')
		expect(failed).toEqual(['broken'])
		expect(alerts.state.fetched).toBe(1)
	})

	it('knows a reader that came before the resource, and forgets a resource that is taken away', async () => {
		const coordinator = createCoordinator()
		coordinator.watch('weather.forecast')
		const forecast = resource({ id: 'weather.forecast', foreground: 15 * MINUTE })
		const unregister = coordinator.register(forecast.it)
		await coordinator.refresh('weather.forecast')
		expect(forecast.state.fetched).toBe(1)

		unregister()
		forecast.state.age = Infinity
		await coordinator.check(true)
		await coordinator.refresh('weather.forecast')
		expect(forecast.state.fetched).toBe(1)
	})
})
