import { describe, expect, it } from 'vitest'
import { forbiddenWords, isSafe } from './safety.js'

describe("Hearth's safety filter", () => {
	const words = forbiddenWords([
		{ value: { substance: 'Peanuts', kind: 'food', severity: 'severe' } },
		{ value: 'shellfish' },
		{ value: { kind: 'food' } },
		{ value: 42 },
	])

	it('reads the substance of an allergy and the word of a restriction, each with its singular', () => {
		expect(words).toEqual(['peanuts', 'peanut', 'shellfish'])
	})

	it('withholds whatever names a word, in any of its texts', () => {
		expect(isSafe(['Peanut butter noodles'], words)).toBe(false)
		expect(isSafe(['Noodles', 'with crushed PEANUTS'], words)).toBe(false)
		expect(isSafe(['Miso-glazed salmon', undefined, 'spinach'], words)).toBe(true)
	})

	it('lets everything through when nothing is forbidden', () => {
		expect(isSafe(['Peanut butter noodles'], [])).toBe(true)
	})

	it('fails closed when the words could not be read', () => {
		expect(isSafe(['Plain rice'], null)).toBe(false)
	})
})
