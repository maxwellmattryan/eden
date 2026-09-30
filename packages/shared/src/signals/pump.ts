// The pump that takes what the scheduler has due and hands each schedule on. It runs when the alarm rings, when the
// shell starts and when the window comes back, and those can arrive together: a call while a take is under way does
// not start a second one beside it but asks for one more after, so nothing that became due in between waits for the
// next ring. A take hands each occurrence over once (the store has already moved the schedule on), so what is done
// with one must not stop the rest.
import type { FiredSchedule } from '../scheduler/types.js'

export function createPump(
	take: () => Promise<FiredSchedule[]>,
	deliver: (fired: FiredSchedule) => Promise<void>,
	onError: (error: unknown) => void = () => {}
): () => Promise<void> {
	let running: Promise<void> | null = null
	let again = false

	async function run() {
		do {
			again = false
			try {
				for (const fired of await take()) {
					try {
						await deliver(fired)
					} catch (error) {
						onError(error)
					}
				}
			} catch (error) {
				onError(error)
			}
		} while (again)
	}

	return () => {
		if (running) {
			again = true
			return running
		}
		running = run().finally(() => (running = null))
		return running
	}
}
