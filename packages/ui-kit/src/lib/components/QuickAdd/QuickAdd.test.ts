import { describe, expect, it } from 'vitest'
import { defaultParse } from './QuickAdd.svelte'

describe('defaultParse', () => {
	it('reads a quantity with its unit as a mono chip and a stock location as a chip, with the name in front', () => {
		const chips = defaultParse('2 lb chicken thighs fridge')
		expect(chips[0]).toEqual({ label: 'chicken thighs' })
		expect(chips).toContainEqual({ label: '2 lb', mono: true })
		expect(chips).toContainEqual({ label: 'fridge' })
		expect(chips).toHaveLength(3)
	})

	it('reads a weekday and a time as one clock chip, in 24-hour form', () => {
		expect(defaultParse('dentist thursday 3pm')).toEqual([{ label: 'dentist' }, { label: 'Thu 15:00', icon: 'clock' }])
	})

	it('reads minutes, midnight and a weekday on its own', () => {
		expect(defaultParse('standup mon 9:30')).toEqual([{ label: 'standup' }, { label: 'Mon 09:30', icon: 'clock' }])
		expect(defaultParse('12am shift')).toContainEqual({ label: '00:00', icon: 'clock' })
		expect(defaultParse('groceries saturday')).toEqual([{ label: 'groceries' }, { label: 'Sat', icon: 'clock' }])
	})

	it('does not read a bare number as a time', () => {
		expect(defaultParse('3 eggs')).toEqual([{ label: '3 eggs' }])
	})

	it('gives no chips for an empty or blank line', () => {
		expect(defaultParse('')).toEqual([])
		expect(defaultParse('   ')).toEqual([])
	})

	it('is pure: the same line always gives the same chips', () => {
		const line = '450 g edamame freezer'
		expect(defaultParse(line)).toEqual(defaultParse(line))
		expect(defaultParse(line)).toEqual([{ label: 'edamame' }, { label: '450 g', mono: true }, { label: 'freezer' }])
	})
})
