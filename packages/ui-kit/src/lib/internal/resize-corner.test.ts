import { describe, expect, it } from 'vitest'
import { sizeAt, stepSize } from './resize-corner.js'

// a cell 200 wide and 160 tall, on a 24 px gutter
const small = { size: 's', width: 200, height: 160, gap: 24 } as const
const wide = { size: 'm', width: 424, height: 160, gap: 24 } as const

describe('sizeAt', () => {
	it('stays where it began for a small drag', () => {
		expect(sizeAt(['s', 'm'], small, 40, 0)).toBe('s')
		expect(sizeAt(['s', 'm'], wide, -40, 0)).toBe('m')
	})

	it('widens once the corner is past half a cell, and narrows the same way', () => {
		expect(sizeAt(['s', 'm'], small, 130, 0)).toBe('m')
		expect(sizeAt(['s', 'm'], wide, -130, 0)).toBe('s')
	})

	it('reaches the two-by-two size only by dragging down as well, and only when it is declared', () => {
		expect(sizeAt(['s', 'm', 'l'], small, 230, 120)).toBe('l')
		expect(sizeAt(['s', 'm', 'l'], small, 230, 20)).toBe('m')
		expect(sizeAt(['s', 'm'], small, 230, 200)).toBe('m')
	})

	it('never leaves a size that is the only one', () => {
		expect(sizeAt(['m'], wide, -400, 300)).toBe('m')
	})
})

describe('stepSize', () => {
	it('steps among the declared sizes in order, and stops at the ends', () => {
		expect(stepSize(['s', 'm'], 's', 1)).toBe('m')
		expect(stepSize(['m', 's'], 'm', -1)).toBe('s')
		expect(stepSize(['s', 'l'], 's', 1)).toBe('l')
		expect(stepSize(['s', 'm'], 'm', 1)).toBeUndefined()
		expect(stepSize(['s', 'm'], 's', -1)).toBeUndefined()
	})
})
