import { describe, expect, it } from 'vitest'
import { parseWeight, readouts } from './quick.js'
import type { BodyMetric, FitnessData } from './types.js'

const TODAY = '2026-09-30'
const SERIES = [83.6, 83.4, 83.5, 83.1, 83.2, 82.9, 83.0, 82.8, 82.7, 82.9, 82.6, 82.5, 82.6, 82.4]

function data(): FitnessData {
	const metrics: BodyMetric[] = SERIES.map((value, i) => ({
		id: `m-${i}`,
		kind: 'weight' as const,
		value,
		at: `2026-09-${String(17 + i).padStart(2, '0')}T06:48:00`,
		source: 'manual' as const,
	})).reverse()
	return {
		exercises: [],
		templates: [
			{ id: 't-push', title: 'Push A', minutes: 55, exercises: [] },
			{ id: 't-pull', title: 'Pull A', minutes: 50, exercises: [] },
			{ id: 't-legs', title: 'Legs', minutes: 60, exercises: [] },
		],
		logs: [],
		sessions: [{ id: 's-1', templateId: 't-legs', title: 'Legs', startAt: `${TODAY}T18:00:00` }],
		gyms: [],
		supplements: [
			{ id: 'su-1', name: 'LMNT citrus', dose: '1 packet', when: 'pre-workout' },
			{ id: 'su-2', name: 'Creatine', dose: '5 g', when: 'daily' },
		],
		intakes: [{ id: 'in-1', supplementId: 'su-1', at: `${TODAY}T06:50:00` }],
		metrics,
	}
}

describe('parseWeight', () => {
	it('reads a point or a comma as the decimal, and writes kg', () => {
		expect(parseWeight('82.4', 'metric')).toBe(82.4)
		expect(parseWeight(' 82,4 ', 'metric')).toBe(82.4)
		expect(parseWeight('82', 'metric')).toBe(82)
	})

	it('converts a weight typed in lb under the imperial system', () => {
		expect(parseWeight('181.7', 'imperial')).toBe(82.42)
		expect(parseWeight('181,7', 'imperial')).toBe(82.42)
	})

	it('refuses what is not a weight above 0 and below 1000', () => {
		for (const bad of ['abc', '0', '-1', '1000', '', '82.4.1', '1e2', 'NaN', 'Infinity'])
			expect(parseWeight(bad, 'metric'), bad).toBeUndefined()
		expect(parseWeight('999.9', 'metric')).toBe(999.9)
	})
})

describe('readouts', () => {
	it('gives the last seven daily weights oldest first, the latest and their average', () => {
		const weight = readouts(data(), TODAY)['log-weight']
		expect(weight.series).toEqual(SERIES.slice(-7))
		expect(weight.reference).toBe(82.6)
		expect(weight.unit).toBe('kg')
		expect(weight.last?.value).toBe('82.4 kg')
	})

	it('reads in lb under the imperial system', () => {
		const weight = readouts(data(), TODAY, 'imperial')['log-weight']
		expect(weight.unit).toBe('lb')
		expect(weight.series?.at(-1)).toBe(181.7)
		expect(weight.last?.value).toBe('181.7 lb')
		expect(weight.reference).toBe(182.2)
	})

	it("offers the templates with today's planned one first, and the supplements", () => {
		const read = readouts(data(), TODAY)
		expect(read['workout-done'].options).toEqual(['Legs', 'Push A', 'Pull A'])
		expect(readouts(data(), '2026-10-01')['workout-done'].options).toEqual(['Push A', 'Pull A', 'Legs'])
		expect(read['took-supplement'].options).toEqual(['LMNT citrus', 'Creatine'])
		expect(read['took-supplement'].last?.value).toBe('LMNT citrus')
	})

	it('puts a planned session that is done back in its place', () => {
		const done = {
			...data(),
			logs: [{ id: 'l', title: 'Legs', date: TODAY, minutes: 60, exercises: [], sessionId: 's-1' }],
		}
		expect(readouts(done, TODAY)['workout-done'].options).toEqual(['Push A', 'Pull A', 'Legs'])
	})

	it('has nothing to show without a weight', () => {
		const weight = readouts({ ...data(), metrics: [] }, TODAY)['log-weight']
		expect(weight).toMatchObject({ series: [], reference: undefined, last: undefined })
	})
})
