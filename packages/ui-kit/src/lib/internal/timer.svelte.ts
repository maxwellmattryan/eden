/**
 * A countdown that can pause and resume, for the toast: eight seconds that stop while the pointer or focus is on it.
 * `remaining` and `running` are reactive so a host can show them if it ever wants to.
 */
export class PausableTimer {
	remaining = $state(0)
	running = $state(false)
	#deadline = 0
	#handle: ReturnType<typeof setTimeout> | undefined
	#onDone: () => void

	constructor(onDone: () => void) {
		this.#onDone = onDone
	}

	start(ms: number) {
		this.cancel()
		this.remaining = ms
		this.resume()
	}

	resume() {
		if (this.running || this.remaining <= 0) return
		this.running = true
		this.#deadline = performance.now() + this.remaining
		this.#handle = setTimeout(() => {
			this.running = false
			this.remaining = 0
			this.#onDone()
		}, this.remaining)
	}

	pause() {
		if (!this.running) return
		clearTimeout(this.#handle)
		this.remaining = Math.max(0, this.#deadline - performance.now())
		this.running = false
	}

	cancel() {
		clearTimeout(this.#handle)
		this.running = false
		this.remaining = 0
	}
}
