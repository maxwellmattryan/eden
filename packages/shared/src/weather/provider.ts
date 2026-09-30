// What a source of weather is (D-56, D-59): a forecast provider the owner chooses, and the supplementary sources
// beside it. Each normalizes its own response into the model; nothing past this boundary knows a provider's shape.
import { recordEgress, requestBytes, type Destination } from '../egress/index.js'
import type { HomePlace } from '../types/index.js'
import type { AirQuality, Allergens, Forecast, ProviderId } from './model.js'

/** A source could not be reached or did not answer; the page keeps the last good mirror and says when it is from. */
export class OfflineError extends Error {
	constructor(
		/** The source's name as it is written: "Open-Meteo". */
		readonly source: string,
		message = `${source} could not be reached`
	) {
		super(message)
		this.name = 'OfflineError'
	}
}

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

export const TIMEOUT_MS = 10_000

/**
 * A GET that gives up after ten seconds and reads every failure as the source being offline. The request is entered
 * in the egress ledger as it leaves, answered or not (D-71).
 */
export async function getJson<T>(
	source: string,
	destination: Destination,
	url: string,
	headers?: Record<string, string>
): Promise<T> {
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
	try {
		recordEgress(destination, requestBytes(url))
		const response = await fetch(url, { signal: controller.signal, headers })
		if (!response.ok) throw new OfflineError(source, `${source} answered ${response.status}`)
		return (await response.json()) as T
	} catch (error) {
		throw error instanceof OfflineError ? error : new OfflineError(source, String(error))
	} finally {
		clearTimeout(timer)
	}
}
