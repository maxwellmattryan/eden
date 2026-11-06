// The phone lock: the gate the mobile layout starts and LockScreen draws (docs/engineering/app-scaffold.md).
export { PhoneLock, phoneLock } from './lock.svelte.js'
export {
	INITIAL_LOCK,
	LOCK_AFTER,
	lockAfterMs,
	parseLockAfter,
	relockDue,
	transition,
	type LockAfter,
	type LockEvent,
	type LockPhase,
	type LockState,
} from './relock.js'
