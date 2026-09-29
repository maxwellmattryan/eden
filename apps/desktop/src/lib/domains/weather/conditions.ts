// The kit's condition names live in its strings, the same ones SkyGlyph reads; this maps a condition to its key.
import type { SkyCondition, UiStrings } from '@eden/ui-kit'

export const CONDITION_KEY: Record<SkyCondition, keyof UiStrings['sky']> = {
	sunny: 'sunny',
	'partly-cloudy': 'partlyCloudy',
	cloudy: 'cloudy',
	fog: 'fog',
	drizzle: 'drizzle',
	rain: 'rain',
	thunderstorm: 'thunderstorm',
	snow: 'snow',
	hail: 'hail',
	wind: 'wind',
	tornado: 'tornado',
}

/** The condition's name, "Clear night" for a clear sky after sunset. */
export function conditionLabel(strings: UiStrings, condition: SkyCondition, night: boolean): string {
	return night && condition === 'sunny' ? strings.sky.clearNight : strings.sky[CONDITION_KEY[condition]]
}
