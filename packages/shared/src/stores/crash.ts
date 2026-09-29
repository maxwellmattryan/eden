import { derived, writable } from 'svelte/store'
import type { CrashInfo } from '../types/index.js'

interface CrashState {
	hasCrashed: boolean
	error: CrashInfo | null
}

const initialState: CrashState = { hasCrashed: false, error: null }

function createCrashStore() {
	const { subscribe, set } = writable<CrashState>(initialState)

	return {
		subscribe,

		/** Record a fatal crash; the crash screen takes over the window. */
		setCrash(error: CrashInfo): void {
			set({ hasCrashed: true, error })
		},

		/** Back to the initial state. */
		clear(): void {
			set(initialState)
		},

		/** The lines the copy button puts on the clipboard. */
		formatErrorDetails(state: CrashState): string {
			if (!state.error) return 'No error details available'
			const lines = [
				`Timestamp: ${state.error.timestamp}`,
				`Source: ${state.error.source || 'Unknown'}`,
				`Message: ${state.error.message}`,
			]
			if (state.error.stack) lines.push('', 'Stack Trace:', state.error.stack)
			return lines.join('\n')
		},
	}
}

export const crashStore = createCrashStore()

/** Whether the app has crashed. */
export const hasCrashed = derived(crashStore, ($store) => $store.hasCrashed)

/** The crash error info. */
export const crashError = derived(crashStore, ($store) => $store.error)
