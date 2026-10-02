// A queue that lets so many calls through a second, in the order they were asked: what a free geocoder's terms ask of
// a client. The clock and the wait are given, so a test runs it without waiting.

export interface ThrottleClock {
	now(): number
	sleep(ms: number): Promise<void>
}

const realClock: ThrottleClock = {
	now: () => Date.now(),
	sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}

/**
 * Wraps `run` so that calls begin no closer together than `perSecond` allows, one after another in the order asked.
 * A call that rejects does not hold up the ones behind it.
 */
export function throttle<A extends unknown[], R>(
	run: (...args: A) => Promise<R>,
	perSecond: number,
	clock: ThrottleClock = realClock
): (...args: A) => Promise<R> {
	const gap = 1000 / perSecond
	let last = -Infinity
	let tail: Promise<unknown> = Promise.resolve()
	return (...args: A) => {
		const turn = tail.then(async () => {
			const wait = last + gap - clock.now()
			if (wait > 0) await clock.sleep(wait)
			last = clock.now()
			return run(...args)
		})
		tail = turn.catch(() => undefined)
		return turn
	}
}
