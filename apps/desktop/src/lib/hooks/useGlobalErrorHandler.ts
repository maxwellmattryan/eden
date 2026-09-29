import { logError } from '@eden/shared/api'
import { crashStore } from '@eden/shared/stores'
import { markSvelteKitReady } from '../../hooks.client'

/**
 * Global handlers for uncaught errors and unhandled rejections: each is logged to diagnostics and sets the crash
 * store, which the CrashScreen renders. Calling it also tells hooks.client.ts that SvelteKit is up. Call once from the
 * layout's onMount; the return value removes the handlers.
 */
export function useGlobalErrorHandler(): () => void {
	markSvelteKitReady()

	function record(message: string, stack: string | undefined, source: string) {
		const info = { message, stack, source, timestamp: new Date().toISOString() }
		logError('Crash', info.message, info.stack).catch(() => {})
		crashStore.setCrash(info)
	}

	function handleError(event: ErrorEvent): void {
		event.preventDefault()
		record(event.message || 'An unexpected error occurred', event.error?.stack, 'window.onerror')
	}

	function handleRejection(event: PromiseRejectionEvent): void {
		event.preventDefault()
		const reason = event.reason
		const message =
			reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : 'Unhandled promise rejection'
		record(message, reason instanceof Error ? reason.stack : undefined, 'unhandledrejection')
	}

	window.addEventListener('error', handleError)
	window.addEventListener('unhandledrejection', handleRejection)

	return () => {
		window.removeEventListener('error', handleError)
		window.removeEventListener('unhandledrejection', handleRejection)
	}
}
