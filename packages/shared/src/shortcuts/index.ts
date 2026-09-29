// How a command shortcut is written for the platform it is shown on. Callers pass the bare key ("G", "1", ","); the
// modifier is the same everywhere. The module is pure: the operating system and form factor arrive as arguments.

export type ShortcutOs = 'macos' | 'windows'

export interface ShortcutContext {
	os: ShortcutOs
	/** Mobile has no keyboard commands, so nothing is shown. */
	platform: 'desktop' | 'mobile'
}

/** "⌘ G" on macOS, "Cmd + G" on Windows, nothing on mobile. */
export function formatShortcut(key: string, { os, platform }: ShortcutContext): string | undefined {
	if (platform === 'mobile') return undefined
	return os === 'macos' ? `⌘ ${key}` : `Cmd + ${key}`
}

/** The operating system from the user agent; macOS unless it says Windows. */
export function detectOs(userAgent: string): ShortcutOs {
	return /windows/i.test(userAgent) ? 'windows' : 'macos'
}
