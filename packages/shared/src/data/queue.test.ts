import { describe, expect, it } from 'vitest'
import { WriteQueue } from './queue.js'

describe('WriteQueue', () => {
	it('sends the writes one at a time, in order', async () => {
		const queue = new WriteQueue()
		const log: string[] = []
		const write = (name: string, ms: number) => async () => {
			log.push(`${name} starts`)
			await new Promise((resolve) => setTimeout(resolve, ms))
			log.push(`${name} ends`)
		}
		queue.enqueue(write('a', 10))
		queue.enqueue(write('b', 1))
		queue.enqueue(write('c', 1))
		await queue.settled()
		expect(log).toEqual(['a starts', 'a ends', 'b starts', 'b ends', 'c starts', 'c ends'])
		expect(queue.size).toBe(0)
		expect(queue.failed).toBe(false)
	})

	it('stops on a failure and holds what is behind it until the retry', async () => {
		const changes: boolean[] = []
		const errors: unknown[] = []
		const queue = new WriteQueue(
			(failed) => changes.push(failed),
			(error) => errors.push(error)
		)
		const log: string[] = []
		let offline = true
		queue.enqueue(async () => {
			if (offline) throw new Error('offline')
			log.push('a')
		})
		queue.enqueue(async () => void log.push('b'))
		await queue.settled()

		expect(queue.failed).toBe(true)
		expect(queue.size).toBe(2)
		expect(log).toEqual([])
		expect(errors).toHaveLength(1)

		// a write made while it is stopped waits its turn
		queue.enqueue(async () => void log.push('c'))
		await queue.settled()
		expect(log).toEqual([])

		// a retry that fails again stops again
		await queue.retry()
		expect(queue.failed).toBe(true)
		expect(log).toEqual([])

		offline = false
		await queue.retry()
		expect(queue.failed).toBe(false)
		expect(log).toEqual(['a', 'b', 'c'])
		expect(changes).toEqual([true, false, true, false])
	})

	it('settles at once when there is nothing to send', async () => {
		const queue = new WriteQueue()
		await queue.settled()
		await queue.retry()
		expect(queue.failed).toBe(false)
	})
})
