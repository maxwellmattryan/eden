import { describe, expect, it } from 'vitest'
import { contrast, grade, hex, luminance, mix, over, parse } from './color.mjs'

describe('parse and hex', () => {
	it('round-trips six-digit hex and expands three-digit hex', () => {
		expect(hex(parse('#4f7a5a'))).toBe('#4f7a5a')
		expect(hex(parse('#abc'))).toBe('#aabbcc')
	})
	it('reads rgb() and rgba()', () => {
		expect(parse('rgb(31, 42, 34)')).toEqual([31, 42, 34, 1])
		expect(parse('rgba(31, 42, 34, 0.32)')).toEqual([31, 42, 34, 0.32])
	})
	it('rejects what it cannot read', () => {
		expect(() => parse('moss')).toThrow()
	})
})

describe('mix', () => {
	it('interpolates gamma-encoded channels like color-mix(in srgb)', () => {
		expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
		expect(mix('#4f7a5a', '#ffffff', 1)).toBe('#4f7a5a')
		expect(mix('#4f7a5a', '#ffffff', 0)).toBe('#ffffff')
	})
	it('composites alpha over a background', () => {
		expect(over('rgba(0, 0, 0, 0.5)', '#ffffff')).toBe('#808080')
	})
})

describe('contrast', () => {
	it('matches the WCAG reference values', () => {
		expect(luminance('#ffffff')).toBeCloseTo(1, 5)
		expect(luminance('#000000')).toBeCloseTo(0, 5)
		expect(contrast('#000000', '#ffffff')).toBe(21)
		expect(contrast('#ffffff', '#000000')).toBe(21)
	})
	it('reproduces the ratios the brand book quotes', () => {
		expect(contrast('#1f2a22', '#f6f4ec')).toBeCloseTo(13.5, 0) // text-primary on surface-0, light
		expect(contrast('#4f7a5a', '#f6f4ec')).toBeCloseTo(4.47, 1) // moss as text on surface-0
		expect(contrast('#ffffff', '#4f7a5a')).toBeCloseTo(4.9, 1) // on-brand on moss
	})
	it('grades against the AA thresholds', () => {
		expect(grade(4.5)).toBe('AA')
		expect(grade(3.2)).toBe('AA-large')
		expect(grade(2.9)).toBe('fail')
	})
})
