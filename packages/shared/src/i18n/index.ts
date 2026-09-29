// svelte-i18n with the two launch locales (D-20). en.json is the source of truth; ja.json changes with it. The
// dictionaries load lazily; `init` runs at import with English so a `$t` before `initializeI18n` never throws.
import { _, getLocaleFromNavigator, init, locale, register, waitLocale } from 'svelte-i18n'
import { languages, type Language } from '../types/index.js'

export const SUPPORTED_LANGUAGES: { value: Language; label: string; nativeLabel: string }[] = [
	{ value: 'en', label: 'English', nativeLabel: 'English' },
	{ value: 'ja', label: 'Japanese', nativeLabel: '日本語' },
]

register('en', () => import('./locales/en.json'))
register('ja', () => import('./locales/ja.json'))

init({ fallbackLocale: 'en', initialLocale: 'en' })

function systemLanguage(): Language {
	const tag = getLocaleFromNavigator() || 'en'
	const lang = tag.split('-')[0] as Language
	return languages.includes(lang) ? lang : 'en'
}

/** Switches to the saved language, or the OS language when it is one Eden ships, and waits for its dictionary. */
export async function initializeI18n(saved?: Language | null): Promise<void> {
	const language = saved && languages.includes(saved) ? saved : systemLanguage()
	locale.set(language)
	await waitLocale(language)
}

/** Switches the language at runtime and waits for its dictionary. */
export async function setLanguage(language: Language): Promise<void> {
	locale.set(language)
	await waitLocale(language)
}

export { locale, waitLocale }
export { _ as t, _ as translate }
export { uiKitStrings } from './ui-kit-strings.js'
