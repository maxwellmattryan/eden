// Opening a link outside the app: a provider's legal page, a source. Under Tauri the opener plugin hands it to the
// system browser; in a plain browser it is a new tab. Only http and https leave this way.
import { invoke } from '@tauri-apps/api/core'
import { isTauri } from './tauri.js'

export async function openExternal(url: string): Promise<void> {
	if (!/^https?:\/\//.test(url)) return
	if (isTauri()) await invoke('plugin:opener|open_url', { url })
	else if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener')
}
