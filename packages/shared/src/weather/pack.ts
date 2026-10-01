// What the Gardener's context pack carries of Sky (D-85): the forecast's row is every hour of thirteen days, and a
// request should not pay for that when the tools answer the details on demand. The pack gets the current reading and
// seven days from today, in the row's own shape so the pack treats it as any other mirror.
import type { Entity } from '../data/types.js'
import type { ForecastPayload } from './rows.js'
import { placeToday } from './week.js'

/** The days the pack carries, from today where the place is. */
export const PACK_DAYS = 7

export function forecastForPack(row: Entity<ForecastPayload>, now: number = Date.now()): Entity {
	const { place, fetchedAt, forecast } = row.payload
	const today = placeToday(forecast.timeZone, now)
	const { temp, feelsLike, condition, humidity, windSpeed, uv } = forecast.current
	return {
		...row,
		payload: {
			place: place.label,
			fetchedAt,
			provider: forecast.provider,
			timeZone: forecast.timeZone,
			units: 'metric',
			current: { temp, feelsLike, condition, humidity, windSpeed, uv },
			days: forecast.days
				.filter((day) => day.date >= today)
				.slice(0, PACK_DAYS)
				.map(({ date, condition, hi, lo, precipChance }) => ({ date, condition, hi, lo, precipChance })),
			note: 'A summary. The forecast tool has the hours, the details and the alerts.',
		},
	}
}
