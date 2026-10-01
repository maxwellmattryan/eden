// The owner's appearance and language choices as one $state class, shared by both apps. It reads and writes the same
// localStorage keys the kit's pre-paint script reads (`storageKeys`), plus its own, so the first frame after a
// relaunch already carries the choice and `apply()` only has to keep <html> in step afterwards. "system" is resolved
// here and re-resolved while the OS theme changes, only while the choice is still "system".
import {
	accents,
	brandLevels,
	densities,
	storageKeys,
	themes,
	type Accent,
	type BrandLevel,
	type Density,
	type Theme,
} from '@eden/ui-kit/tokens'
import { GRADES } from '../gardener/types.js'
import { setLanguage as setI18nLanguage } from '../i18n/index.js'
import {
	DEFAULT_HOME,
	clockFormats,
	fontSettings,
	languages,
	measurementSystems,
	themeSettings,
	weatherProviders,
	weekStarts,
	type ClockFormat,
	type FontSetting,
	type HomeArea,
	type HomePlace,
	type Language,
	type MeasurementSystem,
	type ModelGrade,
	type ThemeSetting,
	type WeatherProvider,
	type WeekStart,
} from '../types/index.js'
import { measurementFrom } from './migrate.js'

/** Every key the settings persist: the kit's five plus the app's own. */
export const storage = {
	...storageKeys,
	language: 'eden:language',
	subtitles: 'eden:subtitles',
	measurement: 'eden:measurement',
	weekStart: 'eden:week-start',
	clock: 'eden:clock',
	weatherProvider: 'eden:weather-provider',
	home: 'eden:home',
	gardenerGrade: 'eden:gardener-grade',
	gardenerPanelWidth: 'eden:gardener-panel-width',
	sidebarWidth: 'eden:sidebar-width',
	sidebarCollapsed: 'eden:sidebar-collapsed',
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

/** The temperature-only setting the measurement system replaced; read once to carry the choice over, then removed. */
const LEGACY_UNITS = 'eden:units'

/** A whole number above zero, or nothing. */
function positiveInt(value: string | null): number | null {
	if (value === null) return null
	const parsed = Number.parseInt(value, 10)
	return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
	return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

function isArea(value: unknown): value is HomeArea {
	const area = value as HomeArea | null
	return (
		typeof area === 'object' &&
		area !== null &&
		typeof area.city === 'string' &&
		typeof area.region === 'string' &&
		typeof area.country === 'string'
	)
}

function isHome(value: unknown): value is HomePlace {
	const place = value as HomePlace | null
	return (
		typeof place === 'object' &&
		place !== null &&
		typeof place.label === 'string' &&
		Number.isFinite(place.latitude) &&
		Number.isFinite(place.longitude)
	)
}

/** The home as it is kept: an area that is not one is dropped, the place itself stands. */
function asHome(place: HomePlace): HomePlace {
	const { label, latitude, longitude, area } = place
	return isArea(area) ? { label, latitude, longitude, area } : { label, latitude, longitude }
}

function readHome(): HomePlace {
	try {
		const parsed: unknown = JSON.parse(read(storage.home) ?? 'null')
		return isHome(parsed) ? asHome(parsed) : DEFAULT_HOME
	} catch {
		return DEFAULT_HOME
	}
}

export class Settings {
	theme = $state<ThemeSetting>('system')
	accent = $state<Accent>('moss')
	/** Temporary: the brand dial, offered only until the design settles on one level. */
	brand = $state<BrandLevel>('lush')
	font = $state<FontSetting>('default')
	density = $state<Density>('comfortable')
	subtitles = $state(true)
	language = $state<Language>('en')
	/** Metric or imperial, for every measurement a domain shows (D-58). */
	measurement = $state<MeasurementSystem>('metric')
	/** The day a week starts on (D-58). */
	weekStart = $state<WeekStart>('monday')
	/** The clock every time is written on (D-58). */
	clock = $state<ClockFormat>('24h')
	/** The forecast provider Sky asks first (D-56). */
	weatherProvider = $state<WeatherProvider>('open-meteo')
	/** The home place Sky forecasts for, until Places exist (D-38). */
	home = $state<HomePlace>(DEFAULT_HOME)
	/** The grade the Gardener's conversation runs at until the owner switches it on the chip (D-74). */
	gardenerGrade = $state<ModelGrade>('standard')
	/** The Gardener's dock, in px, as the owner last dragged it; null until they do, and the dock takes its default. */
	gardenerPanelWidth = $state<number | null>(null)
	/** The sidebar, in px, as the owner last dragged it; null until they do, and it takes the kit's width. */
	sidebarWidth = $state<number | null>(null)
	/** Whether the sidebar is collapsed to its glyphs. */
	sidebarCollapsed = $state(false)
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
		this.brand = oneOf(read(storage.brand), brandLevels, 'lush')
		this.font = oneOf(read(storage.font), fontSettings, 'default')
		this.density = oneOf(read(storage.density), densities, 'comfortable')
		this.subtitles = read(storage.subtitles) !== 'off'
		this.language = oneOf(read(storage.language), languages, this.systemLanguage())
		this.measurement = this.#readMeasurement()
		this.weekStart = oneOf(read(storage.weekStart), weekStarts, 'monday')
		this.clock = oneOf(read(storage.clock), clockFormats, '24h')
		this.weatherProvider = oneOf(read(storage.weatherProvider), weatherProviders, 'open-meteo')
		this.gardenerGrade = oneOf(read(storage.gardenerGrade), GRADES, 'standard')
		this.gardenerPanelWidth = positiveInt(read(storage.gardenerPanelWidth))
		this.sidebarWidth = positiveInt(read(storage.sidebarWidth))
		this.sidebarCollapsed = read(storage.sidebarCollapsed) === 'on'
		this.home = readHome()
		this.resolvedTheme = this.resolveTheme(this.theme)
		this.apply()
		if (typeof window !== 'undefined' && window.matchMedia && !this.#media) {
			this.#media = window.matchMedia('(prefers-color-scheme: dark)')
			this.#media.addEventListener('change', this.#onMediaChange)
		}
	}

	/** The measurement system, carrying a Fahrenheit choice over from the setting it replaced. */
	#readMeasurement(): MeasurementSystem {
		const legacy = read(LEGACY_UNITS)
		const measurement = measurementFrom(read(storage.measurement), legacy)
		if (legacy !== null) {
			write(storage.measurement, measurement === 'metric' ? null : measurement)
			write(LEGACY_UNITS, null)
		}
		return measurement
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
		if (this.brand === 'lush') root.removeAttribute('data-brand')
		else root.setAttribute('data-brand', this.brand)
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

	setBrand(brand: BrandLevel) {
		this.brand = oneOf(brand, brandLevels, 'lush')
		write(storage.brand, this.brand === 'lush' ? null : this.brand)
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

	setMeasurement(measurement: MeasurementSystem) {
		this.measurement = oneOf(measurement, measurementSystems, 'metric')
		write(storage.measurement, this.measurement === 'metric' ? null : this.measurement)
	}

	setWeekStart(weekStart: WeekStart) {
		this.weekStart = oneOf(weekStart, weekStarts, 'monday')
		write(storage.weekStart, this.weekStart === 'monday' ? null : this.weekStart)
	}

	setClock(clock: ClockFormat) {
		this.clock = oneOf(clock, clockFormats, '24h')
		write(storage.clock, this.clock === '24h' ? null : this.clock)
	}

	setWeatherProvider(provider: WeatherProvider) {
		this.weatherProvider = oneOf(provider, weatherProviders, 'open-meteo')
		write(storage.weatherProvider, this.weatherProvider === 'open-meteo' ? null : this.weatherProvider)
	}

	setGardenerGrade(grade: ModelGrade) {
		this.gardenerGrade = oneOf(grade, GRADES, 'standard')
		write(storage.gardenerGrade, this.gardenerGrade === 'standard' ? null : this.gardenerGrade)
	}

	setGardenerPanelWidth(width: number | null) {
		this.gardenerPanelWidth = positiveInt(width === null ? null : String(Math.round(width)))
		write(storage.gardenerPanelWidth, this.gardenerPanelWidth === null ? null : String(this.gardenerPanelWidth))
	}

	setSidebarWidth(width: number | null) {
		this.sidebarWidth = positiveInt(width === null ? null : String(Math.round(width)))
		write(storage.sidebarWidth, this.sidebarWidth === null ? null : String(this.sidebarWidth))
	}

	setSidebarCollapsed(collapsed: boolean) {
		this.sidebarCollapsed = collapsed
		write(storage.sidebarCollapsed, collapsed ? 'on' : null)
	}

	setHome(home: HomePlace) {
		this.home = isHome(home) ? asHome(home) : DEFAULT_HOME
		write(storage.home, JSON.stringify(this.home))
	}

	/** The choices as they are stored, by name: what an export bundle carries. A choice left at its default is absent. */
	snapshot(): Record<string, string> {
		const values: Record<string, string> = {}
		for (const [name, key] of Object.entries(storage)) {
			const value = read(key)
			if (value !== null) values[name] = value
		}
		return values
	}

	/**
	 * Takes the choices of a bundle in place of the ones here. A name it does not know is ignored; a value that is not
	 * one of the choices falls back to the default when it is read, as a stored one would.
	 */
	async restore(values: unknown) {
		if (typeof values !== 'object' || values === null) return
		const given = values as Record<string, unknown>
		for (const [name, key] of Object.entries(storage)) {
			const value = given[name]
			write(key, typeof value === 'string' ? value : null)
		}
		this.load()
		await setI18nLanguage(this.language)
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
