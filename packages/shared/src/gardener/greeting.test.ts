import { describe, expect, it } from 'vitest'
import en from '../i18n/locales/en.json' with { type: 'json' }
import ja from '../i18n/locales/ja.json' with { type: 'json' }
import { greetingKey, GREETINGS, partOfDay, type GreetingPool } from './greeting.js'

describe('the greeting', () => {
	it('reads the part of the day from the hour', () => {
		expect([4, 5, 11, 12, 16, 17, 21, 22, 0].map(partOfDay)).toEqual([
			'night',
			'morning',
			'morning',
			'afternoon',
			'afternoon',
			'evening',
			'evening',
			'night',
			'night',
		])
	})

	it("picks from the hour's pool first, then the ones good at any hour", () => {
		expect(greetingKey(8, 0, true)).toBe('gardener.greeting.morning.1.named')
		expect(greetingKey(8, 0.34, false)).toBe('gardener.greeting.any.1.plain')
		expect(greetingKey(23, 0.999, true)).toBe('gardener.greeting.any.4.named')
		expect(greetingKey(23, 1, true)).toBe('gardener.greeting.any.4.named')
	})

	it('finds every greeting it can pick in both locales, the named form holding the name', () => {
		for (const [lang, locale] of Object.entries({ en, ja })) {
			const pools = locale.gardener.greeting as Record<string, Record<string, { named: string; plain: string }>>
			expect(Object.keys(pools).sort(), lang).toEqual(Object.keys(GREETINGS).sort())
			for (const pool of Object.keys(GREETINGS) as GreetingPool[]) {
				expect(Object.keys(pools[pool]), `${lang} ${pool}`).toEqual(
					Array.from({ length: GREETINGS[pool] }, (_, index) => String(index + 1))
				)
				for (const greeting of Object.values(pools[pool])) {
					expect(greeting.named).toContain('{name}')
					expect(greeting.plain).not.toContain('{name}')
				}
			}
		}
	})
})
