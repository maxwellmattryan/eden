// Runs before any SvelteKit component. It is the fallback crash screen for an error so early that neither
// +error.svelte nor the CrashScreen can render it; once the layout mounts, `markSvelteKitReady()` hands over. The
// colours come from the kit's resolved tokens, keyed on the theme the pre-paint script already put on <html>.
import { colors, storageKeys, type Theme } from '@eden/ui-kit/tokens'

interface EarlyError {
	message: string
	stack?: string
	timestamp: string
}

const FALLBACK_ID = 'early-crash-screen'
let svelteKitReady = false

function themePreference(): Theme {
	const attr = document.documentElement.getAttribute('data-theme')
	if (attr === 'light' || attr === 'dark') return attr
	try {
		const stored = localStorage.getItem(storageKeys.theme)
		if (stored === 'light' || stored === 'dark') return stored
	} catch {
		// no storage
	}
	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function escapeHtml(text: string): string {
	const div = document.createElement('div')
	div.textContent = text
	return div.innerHTML
}

function showFallbackCrashScreen(error: EarlyError): void {
	if (svelteKitReady || document.getElementById(FALLBACK_ID)) return
	const c = colors[themePreference()]
	const container = document.createElement('div')
	container.id = FALLBACK_ID
	container.style.cssText = `position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:${c['surface-0']};font-family:system-ui,-apple-system,sans-serif;color:${c['text-primary']}`
	container.innerHTML = `
		<div style="width:100%;max-width:28rem;border-radius:12px;border:1px solid ${c.stroke};background:${c['surface-1']};padding:24px">
			<h2 style="margin:0;font-size:18px;font-weight:600">Something went wrong</h2>
			<p style="margin:4px 0 16px;font-size:14px;color:${c['text-secondary']}">Eden hit an error before it could start.</p>
			<pre style="margin:0 0 16px;max-height:8rem;overflow:auto;white-space:pre-wrap;word-break:break-all;border-radius:8px;border:1px solid ${c.stroke};background:${c['surface-2']};padding:12px;font-size:12px;color:${c['text-secondary']}">${escapeHtml(error.message)}</pre>
			<div style="display:flex;justify-content:flex-end;gap:8px">
				<button id="early-crash-copy" style="padding:8px 14px;border-radius:8px;border:1px solid ${c.stroke};background:transparent;color:${c['text-primary']};font-size:14px;cursor:pointer">Copy details</button>
				<button id="early-crash-reset" style="padding:8px 14px;border-radius:8px;border:0;background:${c['brand-primary']};color:${c['on-brand']};font-size:14px;cursor:pointer">Restart</button>
			</div>
		</div>`
	document.body.appendChild(container)
	document.getElementById('early-crash-reset')?.addEventListener('click', () => window.location.reload())
	document.getElementById('early-crash-copy')?.addEventListener('click', () => {
		const details = [
			`Timestamp: ${error.timestamp}`,
			`Message: ${error.message}`,
			error.stack ? `Stack:\n${error.stack}` : '',
		]
			.filter(Boolean)
			.join('\n')
		navigator.clipboard?.writeText(details).catch(() => {})
	})
}

function handleError(event: ErrorEvent): void {
	if (svelteKitReady) return
	event.preventDefault()
	showFallbackCrashScreen({
		message: event.message || 'An unexpected error occurred',
		stack: event.error?.stack,
		timestamp: new Date().toISOString(),
	})
}

function handleRejection(event: PromiseRejectionEvent): void {
	if (svelteKitReady) return
	event.preventDefault()
	const reason = event.reason
	const message =
		reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : 'Unhandled promise rejection'
	showFallbackCrashScreen({
		message,
		stack: reason instanceof Error ? reason.stack : undefined,
		timestamp: new Date().toISOString(),
	})
}

window.addEventListener('error', handleError)
window.addEventListener('unhandledrejection', handleRejection)

/** The layout has mounted: remove the fallback and its handlers; the global error handler takes over. */
export function markSvelteKitReady(): void {
	svelteKitReady = true
	document.getElementById(FALLBACK_ID)?.remove()
	window.removeEventListener('error', handleError)
	window.removeEventListener('unhandledrejection', handleRejection)
}
