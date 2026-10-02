// What a source of weather is (D-56, D-59): a forecast provider the owner chooses, and the supplementary sources
// beside it. Each normalizes its own response into the model; nothing past this boundary knows a provider's shape.
import { getJson, OfflineError, TIMEOUT_MS } from '../egress/fetch.js'
import type { HomePlace } from '../types/index.js'
import type { AirQuality, Allergens, Forecast, ProviderId } from './model.js'

export interface ForecastRequest {
	place: HomePlace
	/** The days before today to bring back as observed, so the calendar week is whole (D-58). */
	pastDays: number
	/** Today and the days after it. */
	forecastDays: number
}

export interface ForecastProvider {
	id: ProviderId
	name: string
	/** Whether the provider can run here at all; where it cannot, its choice is absent (D-56). */
	available(): Promise<boolean>
	/** Rejects with `OfflineError` when the provider cannot answer. */
	fetch(request: ForecastRequest): Promise<Forecast>
}

/** A supplementary source resolves to null when it does not cover the place, and rejects when it cannot be reached. */
export interface AirQualitySource {
	id: string
	name: string
	fetch(place: HomePlace): Promise<AirQuality | null>
}
export interface AllergenSource {
	id: string
	name: string
	fetch(place: HomePlace): Promise<Allergens | null>
}

// The fetch every source shares, and the error it raises, live with the egress ledger; they are still exported from here.
export { getJson, OfflineError, TIMEOUT_MS }
