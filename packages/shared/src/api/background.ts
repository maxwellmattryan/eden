// Launch at login (src-tauri/src/commands/background.rs, D-207). The crate calls the autostart plugin itself, so the
// webview holds no permission for it, and the OS is the source of truth: no setting key keeps a copy. The phone and a
// browser answer that it is not available.
import { invoke } from '@tauri-apps/api/core'
import type { LaunchAtLogin } from '../types/index.js'
import { isTauri } from './tauri.js'

const UNAVAILABLE: LaunchAtLogin = { available: false, enabled: false }

/** Whether this build can launch at login, and whether the OS has it on now. */
export async function launchAtLoginStatus(): Promise<LaunchAtLogin> {
	if (!isTauri()) return UNAVAILABLE
	return invoke<LaunchAtLogin>('launch_at_login_status')
}

/** Registers this build's login item (it opens hidden) or removes it, and answers the status read again. */
export async function setLaunchAtLogin(on: boolean): Promise<LaunchAtLogin> {
	if (!isTauri()) return UNAVAILABLE
	return invoke<LaunchAtLogin>('set_launch_at_login', { on })
}
