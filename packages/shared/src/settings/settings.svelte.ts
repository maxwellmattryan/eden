// The owner's appearance and language choices as one $state class, shared by both apps. It reads and writes the same
// localStorage keys the kit's pre-paint script reads (`storageKeys`), plus two of its own, so the first frame after a
// relaunch already carries the choice and `apply()` only has to keep <html> in step afterwards. "system" is resolved
// here and re-resolved while the OS theme changes, only while the choice is still "system".
import { accents, densities, storageKeys, themes, type Accent, type Density, type Theme } from '@eden/ui-kit/tokens'
import { setLanguage as setI18nLanguage } from '../i18n/index.js'
import {
	fontSettings,
	languages,
	themeSettings,
	type FontSetting,
	type Language,
	type ThemeSetting,
} from '../types/index.js'

/** Every key the settings persist: the kit's five plus the app's own. */
export const storage = {
	...storageKeys,
	language: 'eden:language',
	subtitles: 'eden:subtitles',
} as const

function read(key: string): string | null {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage.getItem(key)
	} catch {
		return null
	}
}

function write(key: string, value: string | null) {
	try {
		if (typeof localStorage === 'undefined') return
		if (value === null) localStorage.removeItem(key)
		else localStorage.setItem(key, value)
	} catch {
		// no storage: the choice lives for this session only
	}
}

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
	return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

export class Settings {
	theme = $state<ThemeSetting>('system')
	accent = $state<Accent>('moss')
	font = $state<FontSetting>('default')
	density = $state<Density>('comfortable')
	subtitles = $state(true)
	language = $state<Language>('en')
	/** The theme on <html>: the choice, or what "system" resolves to right now. */
	resolvedTheme = $state<Theme>('light')

	#media: MediaQueryList | null = null
	#onMediaChange = () => {
		if (this.theme !== 'system') return
		this.resolvedTheme = this.resolveTheme('system')
		this.apply()
	}

	/** Reads the persisted choices, applies them and starts following the OS theme. Call once at mount. */
	load() {
		this.theme = oneOf(read(storage.theme), themeSettings, 'system')
		this.accent = oneOf(read(storage.accent), accents, 'moss')
		this.font = oneOf(read(storage.font), fontSettings, 'default')
		this.density = oneOf(read(storage.density), densities, 'comfortable')
		this.subtitles = read(storage.subtitles) !== 'off'
		this.language = oneOf(read(storage.language), languages, this.systemLanguage())
		this.resolvedTheme = this.resolveTheme(this.theme)
		this.apply()
		if (typeof window !== 'undefined' && window.matchMedia && !this.#media) {
			this.#media = window.matchMedia('(prefers-color-scheme: dark)')
			this.#media.addEventListener('change', this.#onMediaChange)
		}
	}

	/** Stops following the OS theme. */
	dispose() {
		this.#media?.removeEventListener('change', this.#onMediaChange)
		this.#media = null
	}

	/** One of the kit's themes for a choice: "system" asks the OS. */
	resolveTheme(theme: ThemeSetting): Theme {
		if (theme !== 'system') return theme
		if (typeof window === 'undefined' || !window.matchMedia) return 'light'
		return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
	}

	/** The OS language when it is one Eden ships; English otherwise. */
	systemLanguage(): Language {
		const tag = typeof navigator === 'undefined' ? 'en' : navigator.language || 'en'
		return oneOf(tag.split('-')[0] ?? 'en', languages, 'en')
	}

	/** Writes the root attributes the stylesheets key on (D-47). Density is desktop only and absent when comfortable. */
	apply() {
		if (typeof document === 'undefined') return
		const root = document.documentElement
		root.setAttribute('data-theme', this.resolvedTheme)
		root.setAttribute('data-accent', this.accent)
		if (this.font === 'default') root.removeAttribute('data-font')
		else root.setAttribute('data-font', this.font)
		if (this.density === 'compact') root.setAttribute('data-density', 'compact')
		else root.removeAttribute('data-density')
	}

	setTheme(theme: ThemeSetting) {
		this.theme = oneOf(theme, themeSettings, 'system')
		this.resolvedTheme = this.resolveTheme(this.theme)
		write(storage.theme, this.theme)
		this.apply()
	}

	setAccent(accent: Accent) {
		this.accent = oneOf(accent, accents, 'moss')
		write(storage.accent, this.accent)
		this.apply()
	}

	setFont(font: FontSetting) {
		this.font = oneOf(font, fontSettings, 'default')
		write(storage.font, this.font === 'default' ? null : this.font)
		this.apply()
	}

	setDensity(density: Density) {
		this.density = oneOf(density, densities, 'comfortable')
		write(storage.density, this.density === 'compact' ? 'compact' : null)
		this.apply()
	}

	setSubtitles(on: boolean) {
		this.subtitles = on
		write(storage.subtitles, on ? 'on' : 'off')
	}

	async setLanguage(language: Language) {
		this.language = oneOf(language, languages, 'en')
		write(storage.language, this.language)
		await setI18nLanguage(this.language)
	}
}

export const settings = new Settings()

// The themes union is re-exported so a tab can list the choices without importing the kit twice.
export { themes }
