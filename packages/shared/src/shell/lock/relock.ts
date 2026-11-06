// The phone lock's state machine (docs/engineering/app-scaffold.md, "The phone lock"). Pure, so a test reads it
// without compiling a rune. `open` is no gate; `held` is the gate raised while the page is hidden, so it is already
// painted for the return, and nothing is asked; `locked` is the gate that only an unlock takes down. The lock is a
// gate on the UI only: nothing here reaches the stores or any background work.

/** The choices of Lock after. There is no "off": the lock is required. */
export const LOCK_AFTER = ['immediately', '1m', '5m', '15m'] as const
export type LockAfter = (typeof LOCK_AFTER)[number]

const DEFAULT_LOCK_AFTER: LockAfter = '1m'
const LOCK_AFTER_MS: Record<LockAfter, number> = { immediately: 0, '1m': 60_000, '5m': 300_000, '15m': 900_000 }

/** A stored Lock after, or the default (one minute) for anything else. */
export function parseLockAfter(value: string | null): LockAfter {
	return value !== null && (LOCK_AFTER as readonly string[]).includes(value) ? (value as LockAfter) : DEFAULT_LOCK_AFTER
}

/** How long Eden may be away before it locks, in ms. */
export function lockAfterMs(value: LockAfter): number {
	return LOCK_AFTER_MS[parseLockAfter(value)]
}

/**
 * Whether a return locks: always after a cold launch (`hiddenAt` null) and when the clock went backwards, which
 * fails closed; otherwise once the time away reaches `afterMs`.
 */
export function relockDue(hiddenAt: number | null, now: number, afterMs: number): boolean {
	if (hiddenAt === null || now < hiddenAt) return true
	return now - hiddenAt >= afterMs
}

export type LockPhase = 'open' | 'held' | 'locked'

export type LockState = {
	phase: LockPhase
	/** When the page went hidden, while held. */
	hiddenAt: number | null
	/** The last prompt failed or was cancelled: the error shows and nothing asks again on its own. */
	failed: boolean
	/** The device cannot lock (no passcode): Eden opens and the gate never rises. */
	unavailable: boolean
}

export type LockEvent =
	| { type: 'launch'; lockable: boolean }
	| { type: 'hide'; now: number }
	| { type: 'show'; now: number; afterMs: number }
	| { type: 'unlocked' }
	| { type: 'failed' }
	| { type: 'no-passcode' }

/** The state before the phone has asked: no gate, and nothing known to lock with. */
export const INITIAL_LOCK: LockState = { phase: 'open', hiddenAt: null, failed: false, unavailable: true }

/** The gate a launch raises on the first frame, before the device has said whether it can lock. */
export const LAUNCH_LOCK: LockState = { phase: 'locked', hiddenAt: null, failed: false, unavailable: false }

export function transition(state: LockState, event: LockEvent): LockState {
	switch (event.type) {
		case 'launch':
			return event.lockable ? LAUNCH_LOCK : { ...INITIAL_LOCK }
		case 'hide':
			if (state.unavailable || state.phase !== 'open') return state
			return { ...state, phase: 'held', hiddenAt: event.now }
		case 'show':
			if (state.unavailable || state.phase !== 'held') return state
			return relockDue(state.hiddenAt, event.now, event.afterMs)
				? { ...state, phase: 'locked', hiddenAt: null, failed: false }
				: { ...state, phase: 'open', hiddenAt: null }
		case 'unlocked':
			return { ...state, phase: 'open', hiddenAt: null, failed: false }
		case 'failed':
			return state.phase === 'locked' ? { ...state, failed: true } : state
		case 'no-passcode':
			return { ...INITIAL_LOCK }
	}
}
