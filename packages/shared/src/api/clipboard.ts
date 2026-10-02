// Text onto the clipboard: through the crate's plugin in the app, through the browser's own in a browser build. The
// plugin's command is invoked directly, as external.ts does for the opener, so the package needs no dependency on
// the plugin's own bindings.
import { invoke } from '@tauri-apps/api/core'
import { isTauri } from './tauri.js'

/** Copies the text; rejects when the clipboard refuses. */
export async function copyText(text: string): Promise<void> {
	if (isTauri()) await invoke('plugin:clipboard-manager|write_text', { text })
	else await navigator.clipboard.writeText(text)
}
