// What the global error handlers must not treat as a crash. Dependency-free on purpose: hooks.client.ts loads it
// before anything else in the app exists.

/** The minimum of an ErrorEvent the check reads. */
export interface ErrorEventLike {
	message?: string
	error?: unknown
}

/**
 * Whether an `error` event is a browser notice rather than an exception. The one such notice is the ResizeObserver
 * loop ("loop completed with undelivered notifications", or "loop limit exceeded" in older engines): a resize callback
 * changed a size it observes, the browser delivers the rest a frame later, and nothing is broken. It carries no error
 * object; a real exception with the same words in its message is still a crash.
 */
export function isBenignErrorEvent(event: ErrorEventLike): boolean {
	return event.error == null && (event.message ?? '').startsWith('ResizeObserver loop')
}
