// The reading's age as one line, the same on the Sky page and on the Garden's weather tiles: "Updating…" while a fetch
// runs, "just now" under a minute, otherwise the age in words. Read it inside a $derived: the store's minute clock
// ticks it forward and every refresh resets it.
import { ago, formatAgo } from '@eden/shared/dates'
import { weather } from '@eden/shared/weather'

type Translate = (key: string, options?: { values?: Record<string, string | number> }) => string

export function updatedLine(t: Translate, lang: string): string | undefined {
	if (weather.loading) return t('domains.weather.updated.loading')
	if (!weather.lastGood) return undefined
	const now = weather.clock
	return ago(weather.lastGood, now).unit === 'second'
		? t('domains.weather.updated.justNow')
		: t('domains.weather.updated.ago', { values: { ago: formatAgo(weather.lastGood, lang, now) } })
}
