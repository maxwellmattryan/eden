// Desktop only: the mobile app never imports this module (mobile updates through the stores), so the updater and
// process plugins stay out of its bundle.
import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { isTauri } from './tauri.js'

export type { Update }
export { relaunch }

/** The pending update, or null when this build is current or the page is not a Tauri webview. */
export async function checkForUpdate(): Promise<Update | null> {
	if (!isTauri()) return null
	return check()
}
