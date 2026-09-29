// The one toast. `toast()` shows it (replacing whatever was showing), `dismissToast()` hides it; ToastHost renders
// `toastStore.current`. Eight seconds by default, paused while the pointer or focus is on it (docs/design/ux-patterns.md).
import { PausableTimer } from '../internal/timer.svelte.js'
import type { IconName } from '../icons/icons.js'

export interface ToastAction {
	label: string
	icon?: IconName
	onclick?: () => void
}

export interface ToastOptions {
	/** One sentence in the voice: "82.4 kg logged." */
	message: string
	/** Usually Undo. */
	action?: ToastAction
	/** An error toast: danger ink and the alert icon. */
	error?: boolean
	/** Milliseconds; default 8000. */
	duration?: number
}

export interface ToastItem extends ToastOptions {
	id: number
}

export const TOAST_DURATION = 8000

export class ToastStore {
	current = $state<ToastItem | null>(null)
	#seq = 0
	#timer = new PausableTimer(() => this.dismiss())

	get remaining() {
		return this.#timer.remaining
	}

	show(options: ToastOptions) {
		this.current = { ...options, id: ++this.#seq }
		this.#timer.start(options.duration ?? TOAST_DURATION)
	}

	dismiss() {
		this.#timer.cancel()
		this.current = null
	}

	pause() {
		this.#timer.pause()
	}

	resume() {
		this.#timer.resume()
	}
}

export const toastStore = new ToastStore()

/** Show the one toast. */
export function toast(options: ToastOptions) {
	toastStore.show(options)
}

export function dismissToast() {
	toastStore.dismiss()
}
