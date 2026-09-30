// Sky's tool handlers (product/domains/weather.md, "Gardener tools"; docs/engineering/gardener.md, "Tools"): all
// three are plain, answering from the forecast Sky holds and never running a model. What leaves is city level and
// the owner's units (D-60): the home's area, never its coordinates.
import { queryEvents, queryTasks } from '@eden/shared/data'
import { addDays, dateIn, timeIn } from '@eden/shared/dates'
import { settings } from '@eden/shared/settings'
import { moonAt, temperature, weather, type DayReading } from '@eden/shared/weather'
import { str, type ToolHandler } from '$lib/shell/gardener/types'

const HOUR_MS = 60 * 60 * 1000

function place(): string {
	const area = settings.home.area
	return area ? [area.city, area.region, area.country].filter(Boolean).join(', ') : settings.home.label
}

function degrees(celsius: number): { value: number; unit: string } {
	return { value: temperature(celsius, settings.measurement), unit: settings.measurement === 'imperial' ? '°F' : '°C' }
}

function dayOf(reading: DayReading) {
	return {
		day: reading.date,
		condition: reading.condition,
		hi: degrees(reading.hi).value,
		lo: degrees(reading.lo).value,
		precipChance: reading.precipChance,
		precipMm: reading.precipAmount,
		uvMax: reading.uvMax,
		observed: reading.observed,
	}
}

/** The day a request names: today, tomorrow, or a date. */
function resolveDay(input: unknown, zone: string | undefined): string {
	const asked = str(input, 'day')
	const today = dateIn(zone, Date.now())
	if (!asked || asked === 'today') return today
	if (asked === 'tomorrow') return addDays(today, 1)
	return /^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : today
}

export const weatherTools: Record<string, ToolHandler> = {
	forecast: {
		run: async (input) => {
			await weather.load()
			const forecast = weather.forecast
			if (!forecast) return { output: { error: 'no forecast on this device yet' } }
			const day = resolveDay(input, forecast.timeZone)
			const days = forecast.days
				.filter((reading) => reading.date >= day)
				.slice(0, 7)
				.map(dayOf)
			const now = weather.now
			return {
				output: {
					place: place(),
					timeZone: forecast.timeZone,
					unit: degrees(0).unit,
					current: now ? { temp: degrees(now.temp).value, condition: now.condition, night: now.night } : undefined,
					days,
					attribution: forecast.attribution,
				},
			}
		},
	},
	'rain-during-plan': {
		run: async (input) => {
			await weather.load()
			const forecast = weather.forecast
			if (!forecast) return { output: { error: 'no forecast on this device yet' } }
			let from = str(input, 'from')
			let to = str(input, 'to')
			const taskId = str(input, 'taskId')
			const eventId = str(input, 'eventId')
			let about: string | undefined
			if (taskId) {
				const task = (await queryTasks()).find((row) => row.id === taskId)
				const at = task?.at ?? task?.due
				if (at) {
					from = at
					to = new Date(new Date(at).getTime() + HOUR_MS).toISOString()
					about = task?.title
				}
			} else if (eventId) {
				const event = (await queryEvents()).find((row) => row.id === eventId)
				if (event) {
					from = event.startAt
					to = event.endAt ?? new Date(new Date(event.startAt).getTime() + HOUR_MS).toISOString()
					about = event.title
				}
			}
			const start = from ? new Date(from).getTime() : Date.now()
			const end = to ? new Date(to).getTime() : start + 2 * HOUR_MS
			if (!Number.isFinite(start) || !Number.isFinite(end)) return { output: { error: 'the window is not a time' } }
			const hours = forecast.hours
				.filter((hour) => hour.time >= start - HOUR_MS && hour.time < end + HOUR_MS)
				.map((hour) => ({
					at: `${dateIn(forecast.timeZone, hour.time)} ${timeIn(hour.time, forecast.timeZone)}`,
					precipChance: hour.precipChance,
					condition: hour.condition,
				}))
			const rain = hours.some((hour) => hour.precipChance >= 40)
			return {
				output: { about, place: place(), rain, hours, covered: hours.length > 0 },
				touched: [...(taskId ? [`eden://task/${taskId}`] : []), ...(eventId ? [`eden://event/${eventId}`] : [])],
			}
		},
	},
	'sun-and-moon': {
		run: async (input) => {
			await weather.load()
			const forecast = weather.forecast
			const zone = forecast?.timeZone
			const day = resolveDay(input, zone)
			const reading = forecast?.days.find((entry) => entry.date === day)
			const noon = new Date(`${day}T12:00:00Z`).getTime()
			const moon = moonAt(noon)
			const at = (instant: number | null) => (instant ? timeIn(instant, zone) : null)
			return {
				output: {
					day,
					place: place(),
					sunrise: at(reading?.sunrise ?? null),
					sunset: at(reading?.sunset ?? null),
					goldenHour: reading?.sunset ? timeIn(reading.sunset - HOUR_MS * 0.65, zone) : null,
					moon: { phase: moon.phase, illumination: moon.illumination },
				},
			}
		},
	},
}
