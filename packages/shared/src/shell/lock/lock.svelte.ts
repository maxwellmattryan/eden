// The phone lock (docs/engineering/app-scaffold.md, "The phone lock"): the gate over the shell on iOS and Android,
// which the mobile layout starts and LockScreen draws. A gate on the UI only: the pages stay mounted under it, and
// the stores and every piece of background work keep running, so nothing here imports them. The transitions
// are `relock.ts`'s; this holds them in a rune, asks the system, and hears the page go hidden and come back.
import { settings } from '../../settings/settings.svelte.js'
import type { Biometry, LockStatus, UnlockOutcome } from '../../types/index.js'
import { INITIAL_LOCK, LAUNCH_LOCK, lockAfterMs, transition, type LockEvent, type LockState } from './relock.js'

type StartOptions = {
	/** Whether the device can lock, and its biometry (`phoneLockStatus`). */
	status: () => Promise<LockStatus>
	/** One system prompt (`unlockPhone`). */
	unlock: (reason: string) => Promise<UnlockOutcome>
	/** The prompt's line, in the owner's language. */
	reason: () => string
	now?: () => number
	/** How long Eden may be away before it locks, in ms; the owner's Lock after by default. */
	afterMs?: () => number
}

const EVENT_OF: Record<UnlockOutcome, LockEvent> = {
	unlocked: { type: 'unlocked' },
	cancelled: { type: 'failed' },
	failed: { type: 'failed' },
	'no-passcode': { type: 'no-passcode' },
}

export class PhoneLock {
	state = $state<LockState>({ ...INITIAL_LOCK })
	/** Set once, when the device answers, so the button's label never changes while the prompt is up. */
	biometry = $state<Biometry>('none')
	/** A prompt is up: the button is disabled, and a second prompt never starts. */
	prompting = $state(false)

	#unlock: ((reason: string) => Promise<UnlockOutcome>) | undefined
	#reason: () => string = () => ''
	/** Whether the device has answered `status`: until then a prompt waits for it. */
	#launched = false
	/** The automatic ask came before the device answered, and runs once it does. */
	#promptWanted = false
	/** `__edenLock('fail')`: the next Unlock fails. */
	#failNext = false

	get phase() {
		return this.state.phase
	}
	get failed() {
		return this.state.failed
	}
	/** The device cannot lock (no passcode, or not a phone): Settings says so and disables Lock after. */
	get unavailable() {
		return this.state.unavailable
	}

	#apply(event: LockEvent) {
		this.state = transition(this.state, event)
	}

	/**
	 * Raises the gate at once, before the device answers, so it is up on the first frame; then applies the device's
	 * answer and hears the page go hidden and come back. Returns the stop.
	 */
	start({ status, unlock, reason, now = Date.now, afterMs = () => lockAfterMs(settings.lockAfter) }: StartOptions) {
		this.#unlock = unlock
		this.#reason = reason
		this.#launched = false
		this.state = { ...LAUNCH_LOCK }
		let stopped = false
		status()
			.then((answer) => {
				if (stopped) return
				this.biometry = answer.biometry
				this.#launched = true
				// an unlock that already went through before the answer stays open
				if (!answer.lockable || this.state.phase === 'locked')
					this.#apply({ type: 'launch', lockable: answer.lockable })
				if (this.#promptWanted) {
					this.#promptWanted = false
					this.prompt()
				}
			})
			// No answer fails closed: the gate stays up and Unlock still asks.
			.catch(() => {
				if (stopped) return
				this.#launched = true
				this.#promptWanted = false
			})
		const onVisibility = () => {
			if (document.visibilityState === 'hidden') {
				this.#apply({ type: 'hide', now: now() })
				return
			}
			const before = this.state.phase
			this.#apply({ type: 'show', now: now(), afterMs: afterMs() })
			if (before === 'held' && this.state.phase === 'locked') this.prompt()
		}
		document.addEventListener('visibilitychange', onVisibility)
		return () => {
			stopped = true
			document.removeEventListener('visibilitychange', onVisibility)
		}
	}

	/** The automatic ask, after a launch or a return that locks: once, and never after a failure or a cancel. */
	prompt() {
		if (this.state.phase !== 'locked' || this.state.failed || this.prompting) return
		if (!this.#launched) {
			this.#promptWanted = true
			return
		}
		void this.unlock()
	}

	/** One prompt, from the Unlock button or the automatic ask. */
	async unlock() {
		if (this.prompting || this.state.phase === 'open') return
		this.prompting = true
		let outcome: UnlockOutcome
		try {
			if (this.#failNext) {
				this.#failNext = false
				outcome = 'failed'
			} else {
				outcome = this.#unlock ? await this.#unlock(this.#reason()) : 'unlocked'
			}
		} catch {
			outcome = 'failed'
		} finally {
			this.prompting = false
		}
		this.#apply(EVENT_OF[outcome])
	}

	/**
	 * `window.__edenLock()` in a development build: raises the gate without asking, so the screen can be seen in a
	 * browser. With `fail`, the next Unlock fails, so the error shows. Unlock in a browser unlocks.
	 */
	devRaise(fail = false) {
		this.#failNext = fail
		this.#launched = true
		this.state = { ...this.state, phase: 'locked', hiddenAt: null, failed: false }
	}
}

export const phoneLock = new PhoneLock()
