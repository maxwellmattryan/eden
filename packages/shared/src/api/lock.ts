// The phone lock's two commands (src-tauri/src/commands/lock.rs). The crate calls the biometric plugin itself, so
// the webview holds no permission for it. A browser never locks: it answers not lockable, and an unlock that unlocks.
import { invoke } from '@tauri-apps/api/core'
import type { LockStatus, UnlockOutcome } from '../types/index.js'
import { isTauri } from './tauri.js'

/** Whether this device can lock Eden, and the biometry its prompt offers. Desktop answers not lockable. */
export async function phoneLockStatus(): Promise<LockStatus> {
	if (!isTauri()) return { lockable: false, biometry: 'none' }
	return invoke<LockStatus>('phone_lock_status')
}

/** Asks the system once (biometry, falling back to the passcode), with `reason` as the prompt's line. */
export async function unlockPhone(reason: string): Promise<UnlockOutcome> {
	if (!isTauri()) return 'unlocked'
	return invoke<UnlockOutcome>('phone_lock_unlock', { reason })
}
