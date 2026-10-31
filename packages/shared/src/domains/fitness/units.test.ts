import { describe, expect, it } from 'vitest'
import { fromDisplay, round1, toDisplay, unitOf } from './units.js'

describe('Vigor units', () => {
	it('names the unit of each measure in each system', () => {
		expect([unitOf('weight', 'metric'), unitOf('weight', 'imperial')]).toEqual(['kg', 'lb'])
		expect([unitOf('waist', 'metric'), unitOf('waist', 'imperial')]).toEqual(['cm', 'in'])
		expect([unitOf('body-fat', 'metric'), unitOf('body-fat', 'imperial')]).toEqual(['%', '%'])
	})

	it('shows kg as lb and cm as in, to one decimal', () => {
		expect(toDisplay('weight', 82.4, 'imperial')).toBe(181.7)
		expect(toDisplay('weight', 80, 'imperial')).toBe(176.4)
		expect(toDisplay('waist', 84, 'imperial')).toBe(33.1)
		expect(toDisplay('weight', 82.44, 'metric')).toBe(82.4)
		expect(toDisplay('body-fat', 18.46, 'imperial')).toBe(18.5)
	})

	it('stores what is typed in lb and in as kg and cm, and shows it back as it was typed', () => {
		expect(fromDisplay('weight', 181.6, 'imperial')).toBe(82.37)
		expect(toDisplay('weight', fromDisplay('weight', 181.6, 'imperial'), 'imperial')).toBe(181.6)
		expect(fromDisplay('waist', 33, 'imperial')).toBe(83.82)
		expect(toDisplay('waist', fromDisplay('waist', 33, 'imperial'), 'imperial')).toBe(33)
		// metric is stored as typed
		expect(fromDisplay('weight', 82.4, 'metric')).toBe(82.4)
		expect(fromDisplay('body-fat', 18.4, 'imperial')).toBe(18.4)
	})

	it('rounds to one decimal', () => {
		expect([round1(82.64), round1(82.65), round1(82.66)]).toEqual([82.6, 82.7, 82.7])
	})
})
