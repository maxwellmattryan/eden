// Runs before any SvelteKit component. It is the crash screen for an error so early that neither +error.svelte nor
// the CrashScreen can render it; once the layout mounts, `markSvelteKitReady()` hands over. It mounts the same
// CrashCard the CrashScreen renders, so the two look alike by construction, and the stylesheet chain is imported here
// so the kit's tokens are already applied when it does (in a build that makes it the page's one blocking stylesheet).
// When the root layout cannot load, SvelteKit shows its static error page by swapping in a <head> of its own, which
// drops every stylesheet the app had; the app's head is put back before the card mounts. Only if the card cannot be
// loaded, or its styles still did not apply, does it draw a plain copy by hand, from the kit's variables with the
// resolved tokens behind them.
import './app.css'
import { mount, unmount } from 'svelte'
import { isBenignErrorEvent } from '@eden/shared/errors'
import { colors, storageKeys, type ColorToken, type Theme } from '@eden/ui-kit/tokens'

interface EarlyError {
	message: string
	stack?: string
	timestamp: string
}

const FALLBACK_ID = 'early-crash-screen'
const LANGUAGE_KEY = 'eden:language'
let svelteKitReady = false
let card: Record<string, unknown> | undefined
/** The app's own <head>, with the pre-paint and every stylesheet, kept in case SvelteKit swaps it out. */
const appHead = document.head

/**
 * Puts the app's <head> back if SvelteKit's static error page replaced it, carrying over the stylesheets that were
 * added to the replacement since (Vite's injected styles in dev, preloaded CSS in a build) but not the error page's
 * own.
 */
function restoreAppHead(): void {
	const current = document.head
	if (current === appHead) return
	for (const sheet of current.querySelectorAll('style[data-vite-dev-id], link[rel="stylesheet"]')) {
		appHead.appendChild(sheet)
	}
	document.documentElement.replaceChild(appHead, current)
}

/** Whether the kit's tokens and the card's own scoped styles reached the page: the browser's <dialog> has a border. */
function stylesApplied(dialog: HTMLDialogElement | null): boolean {
	if (!dialog) return false
	if (!getComputedStyle(document.documentElement).getPropertyValue('--surface-0').trim()) return false
	return getComputedStyle(dialog).borderTopStyle === 'none'
}

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

function savedLanguage(): string | null {
	try {
		return localStorage.getItem(LANGUAGE_KEY)
	} catch {
		return null
	}
}

function escapeHtml(text: string): string {
	const div = document.createElement('div')
	div.textContent = text
	return div.innerHTML
}

function details(error: EarlyError): string {
	return [`Timestamp: ${error.timestamp}`, `Message: ${error.message}`, error.stack ? `Stack:\n${error.stack}` : '']
		.filter(Boolean)
		.join('\n')
}

/** The card by hand, laid out as CrashCard is: used only when the component or the kit could not be loaded. */
function drawPlainCard(container: HTMLElement, error: EarlyError): void {
	const resolved = colors[themePreference()]
	const c = (token: ColorToken) => `var(--${token},${resolved[token]})`
	const sans = `var(--ed-font-sans,system-ui,-apple-system,sans-serif)`
	const display = `var(--ed-font-display,Georgia,serif)`
	const mono = `var(--ed-font-mono,ui-monospace,Menlo,monospace)`
	const button = `display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;height:var(--ed-control,32px);margin:0;padding:0 var(--ed-btn-pad,16px);border-radius:var(--ed-radius-control,10px);font:var(--ed-t-button,500 15px/20px ${display});white-space:nowrap;cursor:pointer`
	container.style.cssText = `position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;box-sizing:border-box;padding:var(--ed-gutter,32px);background:${c('surface-0')};color:${c('text-primary')}`
	container.innerHTML = `
		<div role="alertdialog" aria-labelledby="early-crash-title" style="width:100%;max-width:28rem;box-sizing:border-box;display:grid;gap:12px;border:1px solid ${c('stroke')};border-radius:var(--ed-radius-card,14px);background:${c('surface-1')};padding:24px">
			<h2 id="early-crash-title" style="margin:0;font:var(--ed-t-title-lg,600 18px/26px ${sans})">Something went wrong</h2>
			<p style="margin:0;font:var(--ed-t-body,400 14px/21px ${sans});color:${c('text-secondary')}">Eden hit an error it could not recover from.</p>
			<div style="display:grid;gap:6px;border:1px solid ${c('stroke-subtle')};border-radius:var(--ed-radius-control,10px);background:${c('surface-2')};padding:12px">
				<span style="font:var(--ed-t-label,500 13px/20px ${sans});color:${c('text-secondary')}">Error details</span>
				<code style="display:block;max-height:8rem;overflow:auto;font:var(--ed-t-code,400 13px/20px ${mono});white-space:pre-wrap;word-break:break-all">${escapeHtml(error.message)}</code>
			</div>
			<div style="display:flex;justify-content:flex-end;gap:8px">
				<button id="early-crash-copy" type="button" style="${button};border:1px solid ${c('stroke')};background:${c('surface-0')};color:${c('text-primary')}">Copy details</button>
				<button id="early-crash-reset" type="button" style="${button};border:1px solid transparent;background:${c('brand-primary')};color:${c('on-brand')}">Restart Eden</button>
			</div>
		</div>`
	document.getElementById('early-crash-reset')?.addEventListener('click', () => window.location.reload())
	document.getElementById('early-crash-copy')?.addEventListener('click', () => {
		navigator.clipboard?.writeText(details(error)).catch(() => {})
	})
}

async function showFallbackCrashScreen(error: EarlyError): Promise<void> {
	if (svelteKitReady || document.getElementById(FALLBACK_ID)) return
	restoreAppHead()
	const container = document.createElement('div')
	container.id = FALLBACK_ID
	document.body.appendChild(container)
	try {
		// Loaded here, never at the top: an error in the kit or the card must not take this handler down with it.
		const [{ default: CrashCard }, { initializeI18n }] = await Promise.all([
			import('@eden/shared/components/CrashCard.svelte'),
			import('@eden/shared/i18n'),
		])
		await initializeI18n(savedLanguage() as Parameters<typeof initializeI18n>[0])
		if (svelteKitReady || !container.isConnected) return
		card = mount(CrashCard, { target: container, props: { error: { ...error, source: 'startup' } } })
		await new Promise(requestAnimationFrame)
		if (svelteKitReady || !container.isConnected) return
		if (!stylesApplied(container.querySelector('dialog'))) throw new Error('crash card unstyled')
	} catch {
		if (svelteKitReady || !container.isConnected) return
		if (card) void unmount(card)
		card = undefined
		drawPlainCard(container, error)
	}
}

function handleError(event: ErrorEvent): void {
	if (svelteKitReady || isBenignErrorEvent(event)) return
	event.preventDefault()
	void showFallbackCrashScreen({
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
	void showFallbackCrashScreen({
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
	if (card) void unmount(card)
	card = undefined
	document.getElementById(FALLBACK_ID)?.remove()
	window.removeEventListener('error', handleError)
	window.removeEventListener('unhandledrejection', handleRejection)
}
