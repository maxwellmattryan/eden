// svelte-i18n with the two launch locales (D-20). en.json is the source of truth; ja.json changes with it. English
// is added synchronously and `init` runs at import with it, so the locale is set before the first render and a `$t`
// before `initializeI18n` never throws; Japanese loads lazily when chosen.
import { _, addMessages, getLocaleFromNavigator, init, locale, register, waitLocale } from 'svelte-i18n'
import { languages, type Language } from '../types/index.js'
import en from './locales/en.json' with { type: 'json' }

export const SUPPORTED_LANGUAGES: { value: Language; label: string; nativeLabel: string }[] = [
	{ value: 'en', label: 'English', nativeLabel: 'English' },
	{ value: 'ja', label: 'Japanese', nativeLabel: '日本語' },
]

addMessages('en', en)
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
