// Types the apps and the Rust commands agree on. The diagnostics shapes mirror src-tauri/src/models.rs (camelCase over
// the wire); the settings unions extend the kit's tokens with the app-level choices the kit does not own.
import type { Theme } from '@eden/ui-kit/tokens'

export type Language = 'en' | 'ja'
export const languages: readonly Language[] = ['en', 'ja']

/** What the owner picked: a theme, or "system", which the settings state resolves to one of the kit's themes. */
export type ThemeSetting = Theme | 'system'
export const themeSettings: readonly ThemeSetting[] = ['light', 'dark', 'system']

/** The body-font setting behind `data-font`, reserved in the kit; `default` is the shipped Inter. */
export type FontSetting = 'default' | 'system'
export const fontSettings: readonly FontSetting[] = ['default', 'system']

export interface AppInfo {
	version: string
	/** development, staging or production: the channel the binary was built for. */
	environment: string
	isDev: boolean
	dataDir: string
}

export type DiagnosticLevel = 'error' | 'warning'

export interface DiagnosticEntry {
	id: string
	timestamp: string
	level: DiagnosticLevel
	category: string
	message: string
	details: string | null
}

export interface SystemInfo {
	osName: string
	osVersion: string
	cpuBrand: string
	cpuCores: number
	totalMemoryBytes: number
	usedMemoryBytes: number
	dataDirSizeBytes: number | null
}

export interface DiagnosticsReport {
	appVersion: string
	environment: string
	generatedAt: string
	systemInfo: SystemInfo
	entries: DiagnosticEntry[]
}

export interface CrashInfo {
	message: string
	stack?: string
	source?: string
	timestamp: string
}
