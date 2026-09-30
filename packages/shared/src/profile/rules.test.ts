import { describe, expect, it } from 'vitest'
import {
	checkWindow,
	effectiveFacts,
	historyCutoff,
	isExpired,
	isInWindow,
	validateFact,
	validatePatch,
} from './rules.js'
import type { Fact, FactInput } from './types.js'

function input(over: Partial<FactInput> = {}): FactInput {
	return { type: 'disliked-ingredient', value: 'cilantro', provenance: 'user-asserted', ...over }
}

function fact(over: Partial<Fact> = {}): Fact {
	return {
		uri: 'eden://fact/01J9ZQ4M3T8R5V2X7Y6W1B0CDE',
		id: '01J9ZQ4M3T8R5V2X7Y6W1B0CDE',
		type: 'cuisine-preference',
		value: { name: 'Japanese', weight: 0.8 },
		provenance: 'user-asserted',
		confidence: null,
		validFrom: null,
		validUntil: null,
		source: null,
		note: null,
		createdAt: '0000000000000001-00000000-00000001',
		updatedAt: '0000000000000001-00000000-00000001',
		deletedAt: null,
		...over,
	}
}

describe('validateFact', () => {
	it('names a fact type of Phase 1 and nothing else', () => {
		expect(validateFact(input())).toBeUndefined()
		expect(validateFact(input({ type: 'medical-dietary-restriction', value: 'low sodium' }))).toBeUndefined()
		expect(validateFact(input({ type: 'spaceship' as never }))?.[0]).toBe('fact:invalid')
		expect(validateFact(input({ type: 'recipe' as never }))?.[0]).toBe('fact:invalid')
		expect(validateFact(input({ type: 'gym-preference' }))?.[0]).toBe('fact:invalid')
		expect(validateFact(input({ value: null }))?.[0]).toBe('fact:invalid')
		expect(validateFact(input({ value: undefined }))?.[0]).toBe('fact:invalid')
	})

	it('has confidence and a source follow the provenance', () => {
		const cases: [Partial<FactInput>, boolean][] = [
			[{ provenance: 'user-asserted' }, true],
			[{ provenance: 'user-asserted', confidence: 0.5 }, false],
			[{ provenance: 'ai-inferred', confidence: 0.8 }, true],
			[{ provenance: 'ai-inferred' }, false],
			[{ provenance: 'ai-inferred', confidence: 1.5 }, false],
			[{ provenance: 'domain-derived', confidence: 0.6 }, true],
			[{ provenance: 'domain-derived', confidence: null }, false],
			[{ provenance: 'integration', source: 'google-calendar' }, true],
			[{ provenance: 'integration' }, false],
			[{ provenance: 'integration', source: '' }, false],
			[{ provenance: 'system-derived' }, false],
			[{ provenance: 'system-derived', type: 'home-area', value: { city: 'Austin' } }, true],
			[{ provenance: 'system-derived', type: 'home-area', value: { city: 'Austin' }, confidence: 0.9 }, true],
		]
		for (const [over, ok] of cases) {
			const refusal = validateFact(input(over))
			expect(refusal === undefined, JSON.stringify(over)).toBe(ok)
			if (!ok) expect(refusal?.[0]).toBe('fact:invalid')
		}
	})

	it('wants a window of days in order', () => {
		expect(checkWindow(null, null)).toBeUndefined()
		expect(checkWindow('2026-01-01', '2026-12-31')).toBeUndefined()
		expect(checkWindow('2026-12-31', '2026-01-01')?.[0]).toBe('fact:invalid')
		expect(checkWindow('someday', null)?.[0]).toBe('fact:invalid')
		expect(checkWindow(null, '2026-02-30')?.[0]).toBe('fact:invalid')
		expect(validateFact(input({ validFrom: '2026-1-1' }))?.[0]).toBe('fact:invalid')
	})
})

describe('validatePatch', () => {
	it('names only what a fact has', () => {
		expect(validatePatch({ value: 'x', note: null, validUntil: '2026-12-31' })).toBeUndefined()
		expect(validatePatch({ provenance: 'user-asserted' })).toBeUndefined()
		expect(validatePatch({ type: 'allergy' } as never)?.[1]).toContain('type')
		expect(validatePatch({ provenance: 'integration' } as never)?.[0]).toBe('fact:invalid')
		expect(validatePatch({ confidence: 'high' } as never)?.[0]).toBe('fact:invalid')
		expect(validatePatch({ validFrom: 2020 } as never)?.[0]).toBe('fact:invalid')
	})
})

describe('the effective set', () => {
	it('judges the window by the day, inclusive', () => {
		const windowed = fact({ validFrom: '2026-10-01', validUntil: '2026-11-30' })
		expect(isInWindow(windowed, '2026-09-30')).toBe(false)
		expect(isInWindow(windowed, '2026-10-01')).toBe(true)
		expect(isInWindow(windowed, '2026-11-30')).toBe(true)
		expect(isInWindow(windowed, '2026-12-01')).toBe(false)
		expect(isExpired(windowed, '2026-12-01')).toBe(true)
		expect(isExpired(windowed, '2026-09-30')).toBe(false)
		expect(isInWindow(fact(), '1999-01-01')).toBe(true)
	})

	it('puts the owner first, then the latest, by type', () => {
		const inferred = fact({
			id: 'a',
			provenance: 'ai-inferred',
			confidence: 0.6,
			updatedAt: '0000000000000003-00000000-00000001',
		})
		const own = fact({ id: 'b', updatedAt: '0000000000000001-00000000-00000001' })
		const later = fact({ id: 'c', updatedAt: '0000000000000002-00000000-00000001' })
		const other = fact({ id: 'd', type: 'allergy' })
		const gone = fact({ id: 'e', deletedAt: '0000000000000004-00000000-00000001' })
		const past = fact({ id: 'f', validUntil: '2020-01-01' })
		expect(effectiveFacts([past, gone, inferred, other, own, later], '2026-09-30').map((row) => row.id)).toEqual([
			'd',
			'c',
			'b',
			'a',
		])
	})

	it('keeps thirty days of history', () => {
		const now = 1_790_000_000_000
		expect(historyCutoff(now)).toBe(
			`${(now - 30 * 24 * 60 * 60 * 1000).toString(16).padStart(16, '0')}-00000000-00000000`
		)
		expect(historyCutoff(0)).toBe('0000000000000000-00000000-00000000')
	})
})
