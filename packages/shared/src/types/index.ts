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

/** Temperature units for Sky and the Garden's sky tile (D-27: units are a setting, not a fact). */
export type TemperatureUnit = 'celsius' | 'fahrenheit'
export const temperatureUnits: readonly TemperatureUnit[] = ['celsius', 'fahrenheit']

/**
 * The home place, as a setting until Places exist (D-38 makes it a Place of kind `home`): a label and the coordinates
 * Sky forecasts for. Only rounded coordinates ever leave the device.
 */
export interface HomePlace {
	label: string
	latitude: number
	longitude: number
}
/** Rowan's Hyde Park, Austin (design/sample-data.md), until onboarding asks. */
export const DEFAULT_HOME: HomePlace = { label: 'Hyde Park', latitude: 30.305, longitude: -97.735 }

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
