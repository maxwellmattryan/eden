// The line an empty conversation opens with (docs/design/ux-patterns.md, "Gardener surfaces"): which of the
// locale's greetings to show, by the hour and a roll. The words live in the locale under `gardener.greeting`, each
// with a `named` and a `plain` form; this file only says how many each pool holds and picks one.

export type GreetingPool = 'any' | 'morning' | 'afternoon' | 'evening' | 'night'

/** How many greetings each pool holds in the locale, numbered from 1. A test holds the locales to it. */
export const GREETINGS: Record<GreetingPool, number> = { any: 4, morning: 2, afternoon: 2, evening: 2, night: 2 }

/** The part of the day an hour (0 to 23) falls in. */
export function partOfDay(hour: number): Exclude<GreetingPool, 'any'> {
	if (hour >= 5 && hour < 12) return 'morning'
	if (hour >= 12 && hour < 17) return 'afternoon'
	if (hour >= 17 && hour < 22) return 'evening'
	return 'night'
}

/**
 * The locale key of one greeting, from the hour's pool and the ones good at any hour: `roll` (0 up to 1) picks
 * among them, `named` picks the form that holds `{name}`.
 */
export function greetingKey(hour: number, roll: number, named: boolean): string {
	const part = partOfDay(hour)
	const keys = [part, 'any' as const].flatMap((pool) =>
		Array.from({ length: GREETINGS[pool] }, (_, index) => `${pool}.${index + 1}`)
	)
	const index = Math.min(keys.length - 1, Math.max(0, Math.floor(roll * keys.length)))
	return `gardener.greeting.${keys[index]}.${named ? 'named' : 'plain'}`
}
