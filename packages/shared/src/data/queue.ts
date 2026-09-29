// The order of a store's writes. A store changes what it shows at once and sends the write after; the queue sends
// the writes one at a time, in the order they were made, so a row is never updated before it is created. When a
// write fails the queue stops with it at the head: nothing later is sent until `retry()` gets it through.

export type Write = () => Promise<unknown>

export class WriteQueue {
	#pending: Write[] = []
	#running = false
	#failed = false
	#idle: (() => void)[] = []
	readonly #onchange: (failed: boolean) => void
	readonly #onerror: (error: unknown) => void

	/** `onchange` hears every change of `failed`; `onerror` hears what a write rejected with. */
	constructor(onchange: (failed: boolean) => void = () => {}, onerror: (error: unknown) => void = () => {}) {
		this.#onchange = onchange
		this.#onerror = onerror
	}

	/** A write failed and is waiting for `retry()`. */
	get failed(): boolean {
		return this.#failed
	}

	get size(): number {
		return this.#pending.length
	}

	enqueue(write: Write): void {
		this.#pending.push(write)
		if (!this.#failed) void this.#run()
	}

	/** Sends the write that failed again, and then the ones behind it. Resolves when the queue has settled. */
	async retry(): Promise<void> {
		this.#setFailed(false)
		await this.#run()
	}

	/** Resolves once nothing is being sent: when the queue is empty, or stopped on a failure. */
	settled(): Promise<void> {
		if (!this.#running) return Promise.resolve()
		return new Promise((resolve) => this.#idle.push(resolve))
	}

	async #run(): Promise<void> {
		if (this.#running) return this.settled()
		this.#running = true
		while (this.#pending.length) {
			try {
				await this.#pending[0]?.()
				this.#pending.shift()
			} catch (error) {
				this.#onerror(error)
				this.#setFailed(true)
				break
			}
		}
		this.#running = false
		for (const resolve of this.#idle.splice(0)) resolve()
	}

	#setFailed(failed: boolean): void {
		if (this.#failed === failed) return
		this.#failed = failed
		this.#onchange(failed)
	}
}
