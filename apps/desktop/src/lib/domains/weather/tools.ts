// Sky's tool handlers (product/domains/weather.md, "Gardener tools"; docs/engineering/gardener.md, "Tools"): all
// three are plain, answering from the forecast and the alerts Sky holds and never running a model. What leaves is city level and
// the owner's units (D-60): the home's area, never its coordinates.
import { queryEvents, queryTasks } from '@eden/shared/data'
import { addDays, dateIn, instantAt, timeIn } from '@eden/shared/dates'
import { home } from '@eden/shared/home'
import { settings } from '@eden/shared/settings'
import {
	goldenHourOf,
	moonAt,
	nextPhase,
	temperature,
	weather,
	type AlertSeverity,
	type DayReading,
	type MoonMoment,
} from '@eden/shared/weather'
import { int, str, type ToolHandler } from '$lib/shell/gardener/types'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const SEVERITIES: readonly AlertSeverity[] = ['extreme', 'severe', 'moderate', 'minor', 'unknown']
const MOMENTS: readonly MoonMoment[] = ['new', 'first-quarter', 'full', 'last-quarter']
/** The chance of rain, in percent, from which an hour counts as rain. */
const RAIN_LIKELY = 40

function place(): string {
	const { area, label } = home.current
	return area ? [area.city, area.region, area.country].filter(Boolean).join(', ') : label
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

/**
 * The alerts in force for the home place, the most severe first. One the owner dismissed in Sky is still in force,
 * so it is still told, marked as seen.
 */
function alerts() {
	const dismissed = weather.data?.dismissed ?? []
	return (weather.data?.alerts ?? [])
		.map(({ id, event, headline, severity, onset, ends, issued, sender }) => ({
			event,
			headline,
			severity,
			onset,
			ends,
			issued,
			sender,
			dismissed: dismissed.includes(id),
		}))
		.sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity))
}

/** The day a request names: today when it names none, today, tomorrow, or a date; nothing for anything else. */
function resolveDay(input: unknown, zone: string | undefined): string | undefined {
	const asked = str(input, 'day')
	const today = dateIn(zone, Date.now())
	if (!asked || asked === 'today') return today
	if (asked === 'tomorrow') return addDays(today, 1)
	return /^\d{4}-\d{2}-\d{2}$/.test(asked) && Number.isFinite(Date.parse(asked)) ? asked : undefined
}

const notADay = (input: unknown) => ({
	output: {
		error: `${JSON.stringify(str(input, 'day'))} is not a day. Pass \`day\` as YYYY-MM-DD, or leave it out for today.`,
	},
})

/** A window's edge as an instant: a local date and time read in the forecast's zone, anything else as it parses. */
function instantOf(value: string, zone: string | undefined): number {
	const local = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2})?$/.exec(value)
	return local ? instantAt(local[1]!, local[2]!, zone) : new Date(value).getTime()
}

export const weatherTools: Record<string, ToolHandler> = {
	forecast: {
		run: async (input) => {
			await weather.load()
			const forecast = weather.forecast
			if (!forecast) return { output: { error: 'no forecast on this device yet' } }
			const day = resolveDay(input, forecast.timeZone)
			if (!day) return notADay(input)
			const days = forecast.days
				.filter((reading) => reading.date >= day)
				.slice(0, 7)
				.map(dayOf)
			if (!days.length)
				return {
					output: {
						error: `The forecast does not reach ${day}. It holds ${forecast.days[0]?.date} to ${forecast.days.at(-1)?.date}.`,
					},
				}
			const now = weather.now
			return {
				output: {
					place: place(),
					timeZone: forecast.timeZone,
					unit: degrees(0).unit,
					current: now ? { temp: degrees(now.temp).value, condition: now.condition, night: now.night } : undefined,
					days,
					alerts: alerts(),
					alertsAt: weather.data?.alertsAt,
					alertsCovered: weather.data?.alertsCovered !== false,
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
			const zone = forecast.timeZone
			if (taskId) {
				const task = (await queryTasks()).find((row) => row.id === taskId)
				if (!task)
					return {
						output: {
							error: `No task has the id ${JSON.stringify(taskId)}. A task's id is the \`id\` of its row under \`task\` in the context.`,
						},
					}
				const at = task.at ?? task.due
				// a day with no time of day is not a window: the hours are the owner's to name
				if (!at || !at.includes('T'))
					return {
						output: {
							error: `The task ${JSON.stringify(task.title)} has no time of day. Pass \`from\` and \`to\` for the hours meant.`,
						},
					}
				from = at
				to = new Date(instantOf(at, zone) + HOUR_MS).toISOString()
				about = task.title
			} else if (eventId) {
				const event = (await queryEvents()).find((row) => row.id === eventId)
				if (!event)
					return {
						output: {
							error: `No event has the id ${JSON.stringify(eventId)}. An event's id is the \`id\` of its row in the context.`,
						},
					}
				from = event.startAt
				to = event.endAt ?? new Date(instantOf(event.startAt, zone) + HOUR_MS).toISOString()
				about = event.title
			}
			if (!from) return { output: { error: 'Pass `taskId`, `eventId`, or `from` and `to`: the window to check.' } }
			const start = instantOf(from, zone)
			const end = to ? instantOf(to, zone) : start + 2 * HOUR_MS
			if (!Number.isFinite(start) || !Number.isFinite(end))
				return {
					output: {
						error: 'The window is not a time. Pass `from` and `to` as a local date and time, YYYY-MM-DDTHH:MM.',
					},
				}
			const hours = forecast.hours
				.filter((hour) => hour.time >= start - HOUR_MS && hour.time < end + HOUR_MS)
				.map((hour) => ({
					at: `${dateIn(forecast.timeZone, hour.time)} ${timeIn(hour.time, forecast.timeZone)}`,
					precipChance: hour.precipChance,
					condition: hour.condition,
				}))
			const maxPrecipChance = hours.reduce((highest, hour) => Math.max(highest, hour.precipChance), 0)
			return {
				output: {
					about,
					place: place(),
					rain: maxPrecipChance >= RAIN_LIKELY,
					maxPrecipChance,
					hours,
					covered: hours.length > 0,
				},
				touched: [...(taskId ? [`eden://task/${taskId}`] : []), ...(eventId ? [`eden://event/${eventId}`] : [])],
			}
		},
	},
	'sun-and-moon': {
		run: async (input) => {
			await weather.load()
			const forecast = weather.forecast
			const zone = forecast?.timeZone
			const first = resolveDay(input, zone)
			if (!first) return notADay(input)
			const at = (instant: number | null) => (instant ? timeIn(instant, zone) : null)
			const days = Array.from({ length: int(input, 'days', 1, 1, 31) }, (_, i) => {
				const day = addDays(first, i)
				const reading = forecast?.days.find((entry) => entry.date === day)
				const moon = moonAt(instantAt(day, '12:00', zone))
				return {
					day,
					sunrise: at(reading?.sunrise ?? null),
					sunset: at(reading?.sunset ?? null),
					goldenHour: reading?.sunset ? timeIn(goldenHourOf(reading.sunset), zone) : null,
					moon: { phase: moon.phase, illumination: moon.illumination },
				}
			})
			const asked = str(input, 'next')
			const phase = MOMENTS.find((moment) => moment === asked)
			if (!phase) return { output: { place: place(), days } }
			// from the start of the first day, or from now when that day is today: a phase already past is not next
			const today = dateIn(zone, Date.now())
			const found = nextPhase(phase, first === today ? Date.now() : instantAt(first, '00:00', zone))
			const day = dateIn(zone, found)
			return {
				output: {
					place: place(),
					days,
					next: {
						phase,
						day,
						time: timeIn(found, zone),
						daysAway: Math.round((Date.parse(day) - Date.parse(today)) / DAY_MS),
						approximate: true,
					},
				},
			}
		},
	},
}
