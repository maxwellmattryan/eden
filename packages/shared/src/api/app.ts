import { invoke } from '@tauri-apps/api/core'
import type { AppInfo } from '../types/index.js'
import { isTauri } from './tauri.js'

/** Version, channel and data directory from the Rust side; a browser gets the build's version and no data dir. */
export async function getAppInfo(): Promise<AppInfo> {
	if (!isTauri()) {
		return { version: import.meta.env.PUBLIC_APP_VERSION ?? '0.0.0', environment: 'web', isDev: true, dataDir: '' }
	}
	return invoke<AppInfo>('get_app_info')
}
