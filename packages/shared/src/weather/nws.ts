// Active severe-weather alerts from the National Weather Service (product/domains/weather.md, "Integrations"):
// keyless, US only, one GET for the point. Open-Meteo carries no alerts. The service says when a point is outside
// what it covers, and Sky then stops asking for that place; any other failure answers nothing, and the alerts on the
// page stay as they were. The point is rounded like every coordinate that leaves the device (D-60).
import { recordEgress, requestBytes } from '../egress/index.js'
import { rounded } from './coordinates.js'

export type AlertSeverity = 'extreme' | 'severe' | 'moderate' | 'minor' | 'unknown'

export interface WeatherAlert {
	id: string
	/** The event name: "Flood Watch". */
	event: string
	headline: string
	severity: AlertSeverity
	/** When the alert ends, as an ISO timestamp, when the service says. */
	ends?: string
	/** When what it warns of begins. */
	onset?: string
	/** When it was issued. */
	issued?: string
	/** Who issued it: "NWS Austin/San Antonio TX". */
	sender?: string
}

interface NwsFeature {
	id: string
	properties: {
		event?: string
		headline?: string
		severity?: string
		ends?: string | null
		expires?: string | null
		onset?: string | null
		sent?: string | null
		senderName?: string | null
	}
}

const ENDPOINT = 'https://api.weather.gov/alerts/active'
const TIMEOUT_MS = 10_000

function severityOf(value?: string): AlertSeverity {
	const lower = value?.toLowerCase()
	return lower === 'extreme' || lower === 'severe' || lower === 'moderate' || lower === 'minor' ? lower : 'unknown'
}

/** What the service said of a point: its active alerts, and whether it covers the point at all. */
export interface AlertsAnswer {
	alerts: WeatherAlert[]
	/** `false` for a point outside the United States: there is nothing to ask again until the place changes. */
	covered: boolean
}

/** The status the service gives a point it does not cover ("Parameter "point" is invalid: out of bounds"). */
const OUT_OF_BOUNDS = 400

/** A response as an answer, or `null` for one that says nothing either way (an outage, a rate limit). */
export function readAlerts(status: number, body: unknown): AlertsAnswer | null {
	if (status === OUT_OF_BOUNDS) return { alerts: [], covered: false }
	if (status < 200 || status >= 300) return null
	const features = (body as { features?: NwsFeature[] } | null)?.features
	if (!Array.isArray(features)) return null
	return {
		covered: true,
		alerts: features.map((feature) => ({
			id: feature.id,
			event: feature.properties.event ?? '',
			headline: feature.properties.headline ?? feature.properties.event ?? '',
			severity: severityOf(feature.properties.severity),
			ends: feature.properties.ends ?? feature.properties.expires ?? undefined,
			onset: feature.properties.onset ?? undefined,
			issued: feature.properties.sent ?? undefined,
			sender: feature.properties.senderName ?? undefined,
		})),
	}
}

/** Asks the service for the point. Answers `null` when it could not be reached or did not say. */
export async function fetchAlerts(latitude: number, longitude: number): Promise<AlertsAnswer | null> {
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
	try {
		const point = `${rounded(latitude)},${rounded(longitude)}`
		const url = `${ENDPOINT}?point=${point}`
		recordEgress('nws', requestBytes(url))
		const response = await fetch(url, {
			signal: controller.signal,
			headers: { Accept: 'application/geo+json' },
		})
		return readAlerts(response.status, await response.json().catch(() => null))
	} catch {
		return null
	} finally {
		clearTimeout(timer)
	}
}
