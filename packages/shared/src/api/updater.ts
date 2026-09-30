// Desktop only: the mobile app never imports this module (mobile updates through the stores), so the updater and
// process plugins stay out of its bundle.
import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { recordEgress, requestBytes } from '../egress/index.js'
import { getAppInfo } from './app.js'
import { isTauri } from './tauri.js'

export type { Update }
export { relaunch }

let endpoint: Promise<string | null> | undefined

/**
 * The pending update, or null when this build is current or the page is not a Tauri webview. The check is a request
 * the plugin makes for us, so it is entered in the egress ledger here, by the endpoint the build was given (D-71).
 */
export async function checkForUpdate(): Promise<Update | null> {
	if (!isTauri()) return null
	endpoint ??= getAppInfo().then(
		(info) => info.updaterEndpoint,
		() => null
	)
	const url = await endpoint
	if (url) recordEgress('updater', requestBytes(url))
	return check()
}
