// The light and the moon, computed on-device (product/domains/weather.md: `ephemeris` is computed locally and never
// fetched). Sunrise and sunset come with the forecast's daily block; the golden hour is approximated as the forty
// minutes before sunset (the sample's 19:14 sunset and 18:35 golden hour), not a solar-altitude solve. The moon's
// phase is the synodic month counted from the new moon of 2000-01-06 18:14 UTC, good to about a percent.

export type MoonPhase =
	| 'new'
	| 'waxing-crescent'
	| 'first-quarter'
	| 'waxing-gibbous'
	| 'full'
	| 'waning-gibbous'
	| 'last-quarter'
	| 'waning-crescent'

export interface Moon {
	phase: MoonPhase
	/** The lit fraction, 0 to 100. */
	illumination: number
}

const SYNODIC_DAYS = 29.530588853
const KNOWN_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14)
const DAY_MS = 24 * 60 * 60 * 1000
const GOLDEN_MINUTES = 40

/** The phase and illumination at an instant. */
export function moonAt(when: number = Date.now()): Moon {
	const days = (when - KNOWN_NEW_MOON) / DAY_MS
	const cycle = (((days / SYNODIC_DAYS) % 1) + 1) % 1
	const illumination = Math.round(50 * (1 - Math.cos(2 * Math.PI * cycle)))
	return { phase: phaseOf(cycle), illumination }
}

function phaseOf(cycle: number): MoonPhase {
	if (cycle < 0.0625 || cycle >= 0.9375) return 'new'
	if (cycle < 0.1875) return 'waxing-crescent'
	if (cycle < 0.3125) return 'first-quarter'
	if (cycle < 0.4375) return 'waxing-gibbous'
	if (cycle < 0.5625) return 'full'
	if (cycle < 0.6875) return 'waning-gibbous'
	if (cycle < 0.8125) return 'last-quarter'
	return 'waning-crescent'
}

/** `HH:MM` from a naive local ISO timestamp such as Open-Meteo's `2026-09-30T07:22`. */
export function clockOf(localIso: string): string {
	return localIso.slice(11, 16)
}

/** The golden hour, forty minutes before sunset, as `HH:MM`. */
export function goldenHourOf(sunsetLocalIso: string): string {
	const [hours, minutes] = clockOf(sunsetLocalIso).split(':').map(Number)
	const total = (hours ?? 0) * 60 + (minutes ?? 0) - GOLDEN_MINUTES
	const wrapped = ((total % 1440) + 1440) % 1440
	return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`
}
