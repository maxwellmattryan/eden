import { describe, expect, it } from 'vitest'
import { createBus } from './bus.js'

describe('signal bus', () => {
	it('hands a signal to the subscribers of its name until they leave', async () => {
		const bus = createBus()
		const heard: unknown[] = []
		const stop = bus.subscribe('scheduler.fired', (payload) => void heard.push(payload))
		bus.subscribe('stock.expiring', () => void heard.push('other'))
		await bus.dispatch('scheduler.fired', { name: 'weather.alerts' })
		stop()
		await bus.dispatch('scheduler.fired', { name: 'kitchen.morning' })
		await bus.dispatch('weather.alert', {})
		expect(heard).toEqual([{ name: 'weather.alerts' }])
	})

	it('a handler that throws does not stop the others', async () => {
		const errors: [string, unknown][] = []
		const bus = createBus((name, error) => errors.push([name, error]))
		const heard: string[] = []
		bus.subscribe('scheduler.fired', () => {
			throw new Error('broken')
		})
		bus.subscribe('scheduler.fired', async () => {
			await Promise.reject(new Error('rejected'))
		})
		bus.subscribe('scheduler.fired', () => void heard.push('heard'))
		await bus.dispatch('scheduler.fired', {})
		expect(heard).toEqual(['heard'])
		expect(errors.map(([name, error]) => [name, (error as Error).message])).toEqual([
			['scheduler.fired', 'broken'],
			['scheduler.fired', 'rejected'],
		])
	})
})
