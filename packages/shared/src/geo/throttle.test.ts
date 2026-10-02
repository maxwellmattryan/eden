import { describe, expect, it } from 'vitest'
import { throttle } from './throttle.js'

/** A clock that moves only when something sleeps on it. */
function fakeClock() {
	let at = 0
	const sleeps: number[] = []
	return {
		sleeps,
		now: () => at,
		sleep: async (ms: number) => {
			sleeps.push(ms)
			at += ms
		},
	}
}

describe('throttle', () => {
	it('lets calls begin one a second, in the order asked', async () => {
		const clock = fakeClock()
		const began: [string, number][] = []
		const look = throttle(
			async (name: string) => {
				began.push([name, clock.now()])
				return name.length
			},
			1,
			clock
		)
		const answers = await Promise.all([look('cosmic'), look('radio'), look('mozart')])
		expect(answers).toEqual([6, 5, 6])
		expect(began).toEqual([
			['cosmic', 0],
			['radio', 1000],
			['mozart', 2000],
		])
		expect(clock.sleeps).toEqual([1000, 1000])
	})

	it('does not wait when the last call was long enough ago', async () => {
		const clock = fakeClock()
		const look = throttle(async () => 'found', 2, clock)
		await look()
		await clock.sleep(800)
		await look()
		expect(clock.sleeps).toEqual([800])
	})

	it('lets a failure pass without holding up the calls behind it', async () => {
		const clock = fakeClock()
		const look = throttle(
			async (name: string) => {
				if (name === 'gone') throw new Error('not there')
				return name
			},
			1,
			clock
		)
		const first = look('gone')
		const second = look('here')
		await expect(first).rejects.toThrow('not there')
		await expect(second).resolves.toBe('here')
	})
})
