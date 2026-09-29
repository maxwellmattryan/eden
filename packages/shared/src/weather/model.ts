// The provider-neutral forecast (D-56): what Sky shows, whoever supplied it. Every instant is milliseconds since the
// epoch, every date a calendar date in the place's timezone, and every measurement metric (Celsius, km/h, hPa, km,
// mm); the page converts for display (D-58). The model holds only what Open-Meteo can supply, so the page is the same
// on every platform: a field one provider alone could fill does not belong here.
import type { SkyCondition } from '@eden/ui-kit'
import type { WeatherProvider } from '../types/index.js'

export type ProviderId = WeatherProvider

/** Who the data is from, as the page must credit it. */
export interface Attribution {
	provider: ProviderId
	/** The provider's name as it is written: "Open-Meteo", "Apple Weather". */
	name: string
	/** The provider's mark as an image data URI per theme, when its terms require one (Apple's). */
	mark?: { light: string; dark: string }
	/** The legal or sources page the credit links to. */
	legalUrl?: string
}

export interface CurrentReading {
	time: number
	temp: number
	feelsLike: number
	condition: SkyCondition
	night: boolean
	/** Relative humidity, percent. */
	humidity: number
	dewPoint: number
	/** km/h. */
	windSpeed: number
	windGust: number
	/** Where the wind blows from, in degrees clockwise from north. */
	windDirection: number
	/** Sea-level pressure, hPa. */
	pressure: number
	/** km. */
	visibility: number
	/** Percent. */
	cloudCover: number
	/** mm in the last hour. */
	precipitation: number
	uv: number
}

export interface HourReading {
	time: number
	temp: number
	condition: SkyCondition
	night: boolean
	/** Chance of precipitation, percent. */
	precipChance: number
}

export interface DayReading {
	/** The calendar date in the place's timezone, `YYYY-MM-DD`. */
	date: string
	condition: SkyCondition
	hi: number
	lo: number
	/** Chance of precipitation, percent; absent for a day that has passed. */
	precipChance: number | null
	/** mm over the day. */
	precipAmount: number
	uvMax: number | null
	/** The day's strongest sustained wind, km/h. */
	windMax: number | null
	sunrise: number | null
	sunset: number | null
	/** The day had passed when the forecast was fetched: these are what happened, not what was expected. */
	observed: boolean
}

export interface Forecast {
	provider: ProviderId
	/** The place's IANA timezone: every time on the page is written in it. */
	timeZone: string
	current: CurrentReading
	hours: HourReading[]
	days: DayReading[]
	attribution: Attribution
	/** The provider the owner chose, when it could not answer and this one stood in (D-57). */
	fallbackFrom?: ProviderId
}

/** A supplementary source's mirror (D-59): its own fetch time and state, so it never holds the forecast back. */
export interface SupplementSlot<T> {
	/** The source's name as it is credited; null when no source was tried. */
	source: string | null
	/** When the slot was last filled or found empty, as an ISO timestamp. */
	fetchedAt: string | null
	/** `unavailable`: no source covers the place. `failed`: a source exists and could not be reached. */
	status: 'ok' | 'failed' | 'unavailable'
	data: T | null
}

export type AirCategory = 'good' | 'moderate' | 'sensitive' | 'unhealthy' | 'very-unhealthy' | 'hazardous'

export interface AirQuality {
	/** The US index, 0 to 500. */
	usAqi: number | null
	europeanAqi: number | null
	/** Pollutants in µg/m³. */
	pm25: number | null
	pm10: number | null
	ozone: number | null
	no2: number | null
}

export type AllergenKind = 'tree' | 'alder' | 'birch' | 'olive' | 'grass' | 'weed' | 'mugwort' | 'ragweed' | 'mold'
export type AllergenLevel = 'none' | 'low' | 'moderate' | 'high' | 'very-high'

export interface Allergen {
	kind: AllergenKind
	level: AllergenLevel
}
export interface Allergens {
	items: Allergen[]
}

export const emptySlot = <T>(): SupplementSlot<T> => ({
	source: null,
	fetchedAt: null,
	status: 'unavailable',
	data: null,
})
