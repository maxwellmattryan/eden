// Active severe-weather alerts from the National Weather Service (product/domains/weather.md, "Integrations"):
// keyless, US only, one GET for the point. Open-Meteo carries no alerts. Any failure, including a point outside the
// US, reads as no alerts, so the forecast never waits on this call.
export type AlertSeverity = 'extreme' | 'severe' | 'moderate' | 'minor' | 'unknown'

export interface WeatherAlert {
	id: string
	/** The event name: "Flood Watch". */
	event: string
	headline: string
	severity: AlertSeverity
	/** When the alert ends, as an ISO timestamp, when the service says. */
	ends?: string
}

interface NwsFeature {
	id: string
	properties: {
		event?: string
		headline?: string
		severity?: string
		ends?: string | null
		expires?: string | null
	}
}

const ENDPOINT = 'https://api.weather.gov/alerts/active'
const TIMEOUT_MS = 10_000

function severityOf(value?: string): AlertSeverity {
	const lower = value?.toLowerCase()
	return lower === 'extreme' || lower === 'severe' || lower === 'moderate' || lower === 'minor' ? lower : 'unknown'
}

export async function fetchAlerts(latitude: number, longitude: number): Promise<WeatherAlert[]> {
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
	try {
		const point = `${latitude.toFixed(3)},${longitude.toFixed(3)}`
		const response = await fetch(`${ENDPOINT}?point=${point}`, {
			signal: controller.signal,
			headers: { Accept: 'application/geo+json' },
		})
		if (!response.ok) return []
		const body = (await response.json()) as { features?: NwsFeature[] }
		return (body.features ?? []).map((feature) => ({
			id: feature.id,
			event: feature.properties.event ?? '',
			headline: feature.properties.headline ?? feature.properties.event ?? '',
			severity: severityOf(feature.properties.severity),
			ends: feature.properties.ends ?? feature.properties.expires ?? undefined,
		}))
	} catch {
		return []
	} finally {
		clearTimeout(timer)
	}
}
