import { describe, expect, it } from 'vitest'
import raw from './fixtures/nws-alerts.json'
import outOfBounds from './fixtures/nws-out-of-bounds.json'
import { readAlerts } from './nws.js'

describe('NWS alerts', () => {
	it('reads the active alerts of a point the service covers', () => {
		const answer = readAlerts(200, raw)
		expect(answer?.covered).toBe(true)
		expect(answer?.alerts.map((alert) => [alert.event, alert.severity])).toEqual([
			['Flood Advisory', 'minor'],
			['Flood Warning', 'severe'],
			['Special Weather Statement', 'moderate'],
		])
		expect(answer?.alerts[1]).toEqual({
			id: 'https://api.weather.gov/alerts/urn:oid:2.49.0.1.840.0.9c0753f26ef3a4ab912855fdfac7b35a3e4dfe0c.001.1',
			event: 'Flood Warning',
			headline: 'Flood Warning issued September 30 at 10:56AM CDT until September 30 at 1:15PM CDT by NWS Amarillo TX',
			severity: 'severe',
			ends: '2026-09-30T13:15:00-05:00',
			onset: '2026-09-30T10:56:00-05:00',
			issued: '2026-09-30T10:56:00-05:00',
			sender: 'NWS Amarillo TX',
		})
		// An alert with no end is over when it expires.
		expect(answer?.alerts[2]?.ends).toBe('2026-09-30T18:00:00-05:00')
	})

	it('reads a covered point with nothing active as no alerts', () => {
		expect(readAlerts(200, { type: 'FeatureCollection', features: [] })).toEqual({ alerts: [], covered: true })
	})

	it('reads a point outside the United States as not covered', () => {
		expect(readAlerts(400, outOfBounds)).toEqual({ alerts: [], covered: false })
	})

	it('reads an outage, a rate limit or a body that is not alerts as no answer', () => {
		expect(readAlerts(503, null)).toBeNull()
		expect(readAlerts(429, { title: 'Too Many Requests' })).toBeNull()
		expect(readAlerts(200, null)).toBeNull()
		expect(readAlerts(200, { title: 'Not alerts' })).toBeNull()
	})

	it('reads a severity it does not know as unknown, and a missing headline as the event', () => {
		const answer = readAlerts(200, {
			features: [{ id: 'urn:1', properties: { event: 'Dust Advisory', severity: 'Unknown' } }],
		})
		expect(answer?.alerts).toEqual([
			{
				id: 'urn:1',
				event: 'Dust Advisory',
				headline: 'Dust Advisory',
				severity: 'unknown',
				ends: undefined,
				onset: undefined,
				issued: undefined,
				sender: undefined,
			},
		])
	})
})
