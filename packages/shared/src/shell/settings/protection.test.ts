import { describe, expect, it } from 'vitest'
import { protectionState } from './protection.js'

describe('protectionState', () => {
	it.each([
		// passphrase, confirm, left, valid, short, mismatch
		['', '', false, false, false, false],
		['', '', true, false, false, false],
		['short', '', false, false, false, false],
		['short', '', true, false, true, false],
		['short', 'short', true, false, true, false],
		['1234567', '1234567', false, false, false, false],
		['12345678', '', true, false, false, false],
		['12345678', '1234', false, false, false, true],
		['12345678', '12345678', true, true, false, false],
		['12345678', '12345679', true, false, false, true],
		// characters, not UTF-16 units: four emoji are eight units but four characters
		['🍎🍐🍊🍋', '🍎🍐🍊🍋', true, false, true, false],
		['りんごとなしとみかん', 'りんごとなしとみかん', true, true, false, false],
	] as const)('%j / %j, left %s', (passphrase, confirm, left, valid, short, mismatch) => {
		expect(protectionState(passphrase, confirm, left)).toEqual({ valid, short, mismatch })
	})
})
