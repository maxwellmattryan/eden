/**
 * Whether the page runs inside a Tauri webview. `yarn dev:web` serves the desktop app to a plain browser, where
 * `invoke` would throw; every wrapper checks this first and degrades to a harmless value instead.
 */
export function isTauri(): boolean {
	return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}
