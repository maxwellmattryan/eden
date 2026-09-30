import { describe, expect, it } from 'vitest'
import { RESOURCES } from '../registry/index.js'
import { FACT_SHAPES, LIVE_FACT_TYPES, formatValue, isLiveFact, optionKey, validateValue, weightOf } from './shapes.js'

const label = (key: string) => `<${key}>`

describe('the value shapes', () => {
	it('cover the fact types of Phase 1 and no other', () => {
		const live = RESOURCES.filter((row) => row.category === 'fact' && row.live).map((row) => row.id)
		expect([...LIVE_FACT_TYPES]).toEqual(live)
		expect(Object.keys(FACT_SHAPES).sort()).toEqual([...live].sort())
		expect(live).toHaveLength(11)
		expect(isLiveFact('allergy') && !isLiveFact('gym-preference') && !isLiveFact('recipe')).toBe(true)
	})

	it('accept the sample values and refuse the wrong ones', () => {
		const fine: [string, unknown][] = [
			['preferred-name', 'Rowan'],
			['home-area', { city: 'Austin', region: 'Texas', country: 'United States' }],
			['home-area', { city: 'Singapore' }],
			['allergy', { kind: 'food', substance: 'tree nuts', severity: 'severe' }],
			['dietary-preference', 'low-sodium'],
			['dietary-preference', 'no nightshades'],
			['disliked-ingredient', 'cilantro'],
			['cuisine-preference', { name: 'Japanese', weight: 0.8 }],
			['household-size', 2],
			['skill', { name: 'Rust', level: 'advanced' }],
			['owned-hardware', 'Raspberry Pi 5'],
			['preferred-tool', 'Neovim'],
			['medical-dietary-restriction', 'low sodium'],
		]
		for (const [type, value] of fine) expect(validateValue(type, value), type).toBeUndefined()

		const wrong: [string, unknown][] = [
			['preferred-name', ''],
			['preferred-name', 3],
			['preferred-name', 'x'.repeat(81)],
			['home-area', { region: 'Texas' }],
			['home-area', { city: 'Austin', planet: 'Earth' }],
			['allergy', { kind: 'pollen', substance: 'oak', severity: 'mild' }],
			['allergy', { kind: 'food', substance: 'oak' }],
			['allergy', 'tree nuts'],
			['cuisine-preference', { name: 'Japanese' }],
			['cuisine-preference', { name: 'Japanese', weight: 2 }],
			['cuisine-preference', { name: '', weight: 0.5 }],
			['household-size', 2.5],
			['household-size', 0],
			['household-size', '2'],
			['skill', { name: 'Rust', level: 'wizard' }],
			['gym-preference', 'mornings'],
		]
		for (const [type, value] of wrong)
			expect(validateValue(type, value), `${type} ${JSON.stringify(value)}`).toBeDefined()
	})

	it('write a value as one line', () => {
		expect(formatValue('preferred-name', 'Rowan', label)).toBe('Rowan')
		expect(formatValue('household-size', 2, label)).toBe('2')
		expect(formatValue('dietary-preference', 'low-sodium', label)).toBe(
			'<profile.values.dietary-preference.low-sodium>'
		)
		expect(formatValue('dietary-preference', 'no nightshades', label)).toBe('no nightshades')
		expect(formatValue('cuisine-preference', { name: 'Japanese', weight: 0.8 }, label)).toBe('Japanese')
		expect(weightOf({ name: 'Japanese', weight: 0.8 })).toBe(0.8)
		expect(weightOf('Japanese')).toBeUndefined()
		expect(formatValue('allergy', { kind: 'food', substance: 'tree nuts', severity: 'severe' }, label)).toBe(
			'tree nuts · <profile.values.allergy.kind.food> · <profile.values.allergy.severity.severe>'
		)
		expect(formatValue('home-area', { city: 'Austin', region: 'Texas', country: 'United States' }, label)).toBe(
			'Austin, Texas, United States'
		)
		expect(formatValue('home-area', { city: 'Singapore', region: '', country: 'Singapore' }, label)).toBe(
			'Singapore, Singapore'
		)
		expect(formatValue('gym-preference', 'mornings', label)).toBe('mornings')
		expect(optionKey('skill', 'advanced', 'level')).toBe('profile.values.skill.level.advanced')
	})
})
