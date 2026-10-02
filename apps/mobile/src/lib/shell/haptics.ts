// The phone's one haptic (design/ux-patterns.md, "Mobile adaptations"): a light impact under the chrome's own
// presses, which are the tab bar, the floating + and the top bar's two buttons (D-TBD(phone-chrome)). Nothing in
// `@eden/shared` calls it, and a plain browser feels nothing. The plugin is loaded on the first tap, so the browser
// build never asks for it.
import { isTauri } from '@eden/shared/api'

/** A light tap under the finger; never throws and never waits. */
export function tap(): void {
	if (!isTauri()) return
	void import('@tauri-apps/plugin-haptics').then(({ impactFeedback }) => impactFeedback('light')).catch(() => null)
}
