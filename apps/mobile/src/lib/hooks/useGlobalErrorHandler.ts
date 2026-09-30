import { logError } from '@eden/shared/api'
import { isBenignErrorEvent } from '@eden/shared/errors'
import { crashStore } from '@eden/shared/stores'
import { markSvelteKitReady } from '../../hooks.client'

/**
 * Global handlers for uncaught errors and unhandled rejections: each is logged to diagnostics and to the console, and
 * sets the crash store, which the CrashScreen renders. The console line is written by hand because `preventDefault()`
 * takes the browser's own away, and without it a crash leaves no trace where a developer looks first. Calling it also
 * tells hooks.client.ts that SvelteKit is up. A browser notice that is not an exception (the ResizeObserver loop) is
 * left to the browser's own console line and never becomes a crash. Call once from the layout's onMount; the return
 * value removes the handlers.
 */
export function useGlobalErrorHandler(): () => void {
	markSvelteKitReady()

	function record(message: string, stack: string | undefined, source: string, cause: unknown) {
		const info = { message, stack, source, timestamp: new Date().toISOString() }
		console.error(`[crash] ${source}:`, cause ?? message)
		logError('Crash', info.message, info.stack).catch(() => {})
		crashStore.setCrash(info)
	}

	function handleError(event: ErrorEvent): void {
		if (isBenignErrorEvent(event)) return
		event.preventDefault()
		record(event.message || 'An unexpected error occurred', event.error?.stack, 'window.onerror', event.error)
	}

	function handleRejection(event: PromiseRejectionEvent): void {
		event.preventDefault()
		const reason = event.reason
		const message =
			reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : 'Unhandled promise rejection'
		record(message, reason instanceof Error ? reason.stack : undefined, 'unhandledrejection', reason)
	}

	window.addEventListener('error', handleError)
	window.addEventListener('unhandledrejection', handleRejection)

	return () => {
		window.removeEventListener('error', handleError)
		window.removeEventListener('unhandledrejection', handleRejection)
	}
}
